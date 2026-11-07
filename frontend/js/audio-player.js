// Single-channel player: starting a new clip always stops the previous one, so audio can never overlap.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class AudioPlayer {
  constructor() { this.el = new Audio(); this.url = null; this._resolve = null; }

  /** Call from a user gesture (the Start click) so later playback is not blocked by autoplay rules. */
  unlock() {
    try { this.el.src = SILENT_WAV; this.el.play().catch(() => {}); } catch { /* ignore */ }
  }

  /** Resolves 'ended' | 'stopped' | 'error'. */
  play(blob) {
    this.stop();
    this.url = URL.createObjectURL(blob);
    this.el.src = this.url;
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.el.onended = () => this._finish('ended');
      this.el.onerror = () => this._finish('error');
      this.el.play().catch(() => this._finish('error'));
    });
  }

  stop() { this.el.pause(); this._finish('stopped'); }

  _finish(result) {
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    const done = this._resolve;
    this._resolve = null;
    this.el.onended = this.el.onerror = null;
    done?.(result);
  }
}
