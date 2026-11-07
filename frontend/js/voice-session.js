import { VoiceStateMachine } from './voice-state.js';

// Turn-based voice loop: mic -> VAD -> STT -> chat -> TTS -> playback -> back to listening.
// Honest limitation: this is chunked turn-taking, not full-duplex streaming.
const VAD = {
  calibrateMs: 600, minThreshold: 0.015, maxThreshold: 0.08,
  startMs: 160, endSilenceMs: 1100, minSpeechMs: 350, maxUtteranceMs: 30000, preRollMs: 1500,
  bargeFactor: 2.5, bargeMinThreshold: 0.06, bargeMs: 350, minBlobBytes: 2000,
};
const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export class VoiceSession {
  constructor({ api, player, getConversationId, setConversationId, onState, onLevel, onUserText, onAssistantText, onNotice, isContinuous }) {
    Object.assign(this, { api, player, getConversationId, setConversationId, onState, onLevel, onUserText, onAssistantText, onNotice, isContinuous });
    this.sm = new VoiceStateMachine((to, from, info) => this.onState(to, from, info));
    this.turn = 0; // bumping this invalidates every in-flight turn
    this.muted = false;
    this.sessionOpen = false;
    this.stream = this.ctx = this.analyser = this.buf = this.timer = this.rec = this.abort = null;
    this.chunks = [];
    this.thr = VAD.minThreshold;
    this._resetVad();
  }

  get state() { return this.sm.state; }

  // ---------- lifecycle ----------
  async start() {
    if (!this.sm.can('requesting_microphone')) return; // ignores duplicate clicks
    this.sessionOpen = true;
    this.sm.go('requesting_microphone');
    this.player.unlock();

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.sessionOpen = false;
      return void this.sm.go('error', { message: 'Is browser mein voice capture support nahi hai. Chrome ya Edge use karo.' });
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      this.sessionOpen = false;
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      return void this.sm.go('error', { message: denied ? 'Microphone permission deny hui. Browser ke address bar mein mic allow karo.' : 'Microphone nahi mila.' });
    }
    if (this.sm.state !== 'requesting_microphone') { stream.getTracks().forEach((t) => t.stop()); return; } // ended meanwhile

    this.stream = stream;
    stream.getAudioTracks()[0].onended = () => this.sessionOpen && this._fail('Microphone disconnect ho gaya.');
    stream.getAudioTracks().forEach((t) => { t.enabled = !this.muted; });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume?.();
    const src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser); // not connected to destination: no feedback loop
    this.buf = new Float32Array(this.analyser.fftSize);
    this.mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    this.calibrated = false; this.calibUntil = performance.now() + VAD.calibrateMs; this.floorSum = 0; this.floorN = 0;
    this._resetVad();
    if (!this.sm.go('listening')) return;
    this._startRecorder();
    this.timer = setInterval(() => this._tick(), 50);
  }

  resume() { return this.start(); } // mic was released on pause, so resuming re-acquires it

  pause() {
    if (!this.sm.can('paused')) return;
    this._teardown();
    this.sm.go('paused');
  }

  end() {
    this._teardown();
    this.sessionOpen = false;
    this.muted = false;
    this.sm.go('idle');
  }

  toggleMute() {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !this.muted; });
    if (this.muted && this.state === 'listening') { this._restartRecorder(); this._resetVad(); }
    return this.muted;
  }

  /** Stop the assistant (or an in-flight turn) and go straight back to listening. */
  interrupt(source = 'button') {
    if (!['speaking', 'thinking', 'transcribing'].includes(this.state)) return;
    this.turn++;
    this.abort?.abort();
    this.player.stop();
    this.sm.go('interrupted');
    this.sm.go('listening');
    this._resetVad();
    this._startRecorder();
    if (source === 'voice') { // user is already talking: keep capturing what follows
      this.speaking = true; this.speechStart = this.lastLoud = performance.now();
    }
  }

  // ---------- internals ----------
  _teardown() {
    this.turn++;
    this.abort?.abort();
    this.player.stop();
    this._discardRecorder();
    clearInterval(this.timer); this.timer = null;
    this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    this.stream = null;
    this.ctx?.close().catch(() => {}); this.ctx = this.analyser = null;
    this.onLevel(0);
  }

  _fail(message) {
    this._teardown();
    this.sessionOpen = false;
    this.sm.go('error', { message });
  }

  _resetVad() { this.speaking = false; this.loudSince = null; this.lastLoud = 0; this.speechStart = 0; this.bargeSince = null; }

  _rms() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    return Math.sqrt(sum / this.buf.length);
  }

  _tick() {
    if (!this.analyser) return;
    const rms = this.muted ? 0 : this._rms();
    this.onLevel(rms);
    const now = performance.now();
    if (this.state === 'listening') this._tickListening(rms, now);
    else if (this.state === 'speaking') this._tickSpeaking(rms, now);
  }

  _tickListening(rms, now) {
    if (this.muted) return void this._resetVad();
    if (!this.calibrated) { // learn the room's noise floor first
      this.floorSum += rms; this.floorN++;
      if (now >= this.calibUntil) {
        const floor = this.floorN ? this.floorSum / this.floorN : 0;
        this.thr = Math.min(VAD.maxThreshold, Math.max(VAD.minThreshold, floor * 3));
        this.calibrated = true;
      }
      return;
    }
    if (!this.speaking) {
      if (rms > this.thr) {
        this.loudSince ??= now;
        if (now - this.loudSince >= VAD.startMs) { this.speaking = true; this.speechStart = this.loudSince; this.lastLoud = now; }
      } else this.loudSince = null;
      // Recycle the recorder while silent: bounds pre-roll, memory and billed silence. Nothing is uploaded without speech.
      if (!this.speaking && !this.loudSince && now - this.recStart > VAD.preRollMs) this._restartRecorder();
      return;
    }
    if (rms > this.thr * 0.7) this.lastLoud = now;
    if (now - this.lastLoud >= VAD.endSilenceMs || now - this.speechStart >= VAD.maxUtteranceMs) {
      if (this.lastLoud - this.speechStart < VAD.minSpeechMs) { this._restartRecorder(); this._resetVad(); } // click/cough: discard
      else this._finishUtterance();
    }
  }

  _tickSpeaking(rms, now) {
    if (this.muted) return;
    // Barge-in needs a clearly louder, sustained voice, so the assistant's own speaker output is not mistaken for the user.
    const thr = Math.max(this.thr * VAD.bargeFactor, VAD.bargeMinThreshold);
    if (rms > thr) { this.bargeSince ??= now; if (now - this.bargeSince >= VAD.bargeMs) this.interrupt('voice'); }
    else this.bargeSince = null;
  }

  _finishUtterance() {
    const turn = ++this.turn;
    this.speaking = false;
    if (!this.sm.go('transcribing')) return;
    this._stopRecorder().then((blob) => this._runTurn(turn, blob));
  }

  async _runTurn(turn, blob) {
    const ac = (this.abort = new AbortController());
    try {
      if (!blob || blob.size < VAD.minBlobBytes) return this._backToListening(turn);
      const { text } = await this.api.transcribe(blob, ac.signal);
      if (turn !== this.turn) return;
      if (!text) { this.onNotice('Samajh nahi aaya, dobara bolo.'); return this._backToListening(turn); }
      this.onNotice('');
      this.onUserText(text);
      this.sm.go('thinking');

      const { reply, conversationId } = await this.api.chat(text, this.getConversationId(), 'voice', ac.signal);
      if (turn !== this.turn) return;
      this.setConversationId(conversationId);
      this.onAssistantText(reply);

      let audio;
      try { audio = await this.api.speak(reply, ac.signal); }
      catch (e) {
        if (e.name === 'AbortError' || turn !== this.turn) return;
        this.onNotice(`Awaaz nahi ban paayi (${e.message}). Jawab text mein upar hai.`);
        return this._backToListening(turn);
      }
      if (turn !== this.turn) return;
      if (!this.sm.go('speaking')) return;
      this.bargeSince = null;
      await this.player.play(audio);
      if (turn !== this.turn) return; // interrupted, paused or ended meanwhile
      if (!this.isContinuous()) { this.onNotice('Continuous off hai. Resume dabao aur bolo.'); return this.pause(); }
      this._backToListening(turn);
    } catch (e) {
      if (e.name === 'AbortError' || turn !== this.turn) return;
      this._turnError(turn, e.message);
    }
  }

  _backToListening(turn) {
    if (turn !== this.turn || !this.sessionOpen) return;
    if (this.sm.go('listening')) { this._resetVad(); this._startRecorder(); }
  }

  _turnError(turn, message) {
    this.sm.go('error', { message });
    setTimeout(() => { if (this.sm.state === 'error' && this.sessionOpen && this.stream) this._backToListening(turn); }, 2500);
  }

  // ---------- recorder ----------
  _startRecorder() {
    this._discardRecorder();
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.recStart = performance.now();
  }

  _discardRecorder() {
    const rec = this.rec;
    this.rec = null;
    if (rec && rec.state !== 'inactive') { rec.ondataavailable = null; rec.onstop = null; try { rec.stop(); } catch { /* already stopped */ } }
    this.chunks = [];
  }

  _restartRecorder() { if (this.stream) this._startRecorder(); }

  _stopRecorder() {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec || rec.state === 'inactive') return resolve(null);
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || this.mime || 'audio/webm' }));
      rec.stop();
    });
  }
}
