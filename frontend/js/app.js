import { createApi } from './api-client.js';
import { AudioPlayer } from './audio-player.js';
import { VoiceSession } from './voice-session.js';
import { createRelationshipUI } from './relationship-ui.js';
import { createMemoryUI } from './memory-ui.js';

const cfg = window.KARWAHE_CONFIG;
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
let conversationId = null;
let session = null;

// Size the app to the *visible* viewport (handles the on-screen keyboard on iOS and Android).
(function trackViewport() {
  const vv = window.visualViewport, root = document.documentElement;
  const update = () => {
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-h', `${Math.round(h)}px`);
    root.classList.toggle('compact', h < 560 && window.innerWidth <= 900);
  };
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', () => { if (vv.offsetTop) window.scrollTo(0, 0); });
  window.addEventListener('orientationchange', () => setTimeout(update, 250));
  update();
})();

const api = createApi({ base: cfg.API_BASE, getToken: () => session?.access_token });
const player = new AudioPlayer();
const people = createRelationshipUI({ api, root: document.getElementById('rel-root') });
const memories = createMemoryUI({ api, root: document.getElementById('mem-root') });

// Decorative tick marks around the HUD ring.
(function buildTicks() {
  const g = $('ticks'), NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 120; i++) {
    const long = i % 5 === 0, a = (i / 120) * 2 * Math.PI;
    const r1 = long ? 176 : 182, r2 = 190;
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', 200 + r1 * Math.sin(a)); l.setAttribute('y1', 200 - r1 * Math.cos(a));
    l.setAttribute('x2', 200 + r2 * Math.sin(a)); l.setAttribute('y2', 200 - r2 * Math.cos(a));
    g.appendChild(l);
  }
})();

// The HUD only ever shows real state.
function setState(state, text) {
  $('orb').dataset.state = state;
  $('status').dataset.state = state;
  $('status').textContent = `SYSTEM: ${text.toUpperCase()}`;
}

function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = `bubble ${role}`;
  el.textContent = text; // textContent: never inject model output as HTML
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
  return el;
}

// ---------- Voice wiring ----------
const HUD = { idle: 'idle', requesting_microphone: 'thinking', listening: 'listening', transcribing: 'thinking', thinking: 'thinking', speaking: 'speaking', interrupted: 'listening', paused: 'paused', error: 'error' };
const LABEL = { idle: 'Ready', requesting_microphone: 'Waiting for microphone', listening: 'Listening', transcribing: 'Transcribing', thinking: 'Thinking', speaking: 'Speaking', interrupted: 'Interrupted', paused: 'Paused' };

const voice = new VoiceSession({
  api, player,
  getConversationId: () => conversationId,
  setConversationId: (id) => { conversationId = id; },
  onUserText: (t) => addBubble('user', t),
  onAssistantText: (t) => addBubble('assistant', t),
  onNotice: (m) => { $('voice-note').textContent = m; },
  isContinuous: () => $('voice-continuous').checked,
  onLevel: (l) => {
    const v = Math.min(1, l * 8); // real microphone level
    $('meter-fill').style.width = `${v * 100}%`;
    $('orb').style.setProperty('--level', v.toFixed(3));
  },
  onState: onVoiceState,
});

function onVoiceState(to, _from, info) {
  setState(HUD[to], to === 'error' ? (info?.message || 'Error') : LABEL[to]);
  if (to === 'error' && info?.message) $('voice-note').textContent = info.message;
  const open = voice.sessionOpen;
  const busy = ['speaking', 'thinking', 'transcribing'].includes(to);
  $('voice-start').hidden = open;
  $('voice-pause').hidden = !open;
  $('voice-pause').textContent = to === 'paused' ? 'Resume' : 'Pause';
  $('voice-mute').hidden = !open || to === 'paused';
  $('voice-interrupt').hidden = !open || !busy;
  $('voice-end').hidden = !open;
  const chipVoice = $('chip-voice'), chipMic = $('chip-mic');
  chipVoice.textContent = open || to === 'error' ? to.replace('_', ' ').toUpperCase() : 'OFFLINE';
  chipVoice.className = `v ${open ? 'live' : 'off'}`;
  const micLive = !!voice.stream;
  chipMic.textContent = to === 'error' && !open ? 'DENIED/ERR' : !micLive ? 'OFF' : voice.muted ? 'MUTED' : 'LIVE';
  chipMic.className = `v ${micLive && !voice.muted ? 'live' : 'off'}`;
  if (to === 'idle') { $('voice-mute').setAttribute('aria-pressed', 'false'); $('voice-mute').textContent = 'Mute'; }
}

$('voice-start').addEventListener('click', () => { $('voice-note').textContent = 'Mic ON karke 1 second chup raho, phir bolo.'; voice.start(); });
$('voice-pause').addEventListener('click', () => (voice.state === 'paused' ? voice.resume() : voice.pause()));
$('voice-mute').addEventListener('click', () => {
  const m = voice.toggleMute();
  $('voice-mute').setAttribute('aria-pressed', String(m));
  $('voice-mute').textContent = m ? 'Unmute' : 'Mute';
  $('chip-mic').textContent = m ? 'MUTED' : 'LIVE';
});
$('voice-interrupt').addEventListener('click', () => voice.interrupt('button'));
$('voice-end').addEventListener('click', () => { voice.end(); $('voice-note').textContent = ''; });
window.addEventListener('beforeunload', () => voice.end());

// ---------- Tabs ----------
function setTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('chat').hidden = !session || name !== 'chat';
  $('people').hidden = !session || name !== 'people';
  $('memory').hidden = !session || name !== 'memory';
  if (session && name === 'people') people.load();
  if (session && name === 'memory') memories.load();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ---------- Auth + text chat ----------
function render(s) {
  session = s;
  $('auth').hidden = !!s;
  $('tabs').hidden = !s;
  setTab('chat');
  $('chip-auth').textContent = s ? 'SECURE LINK' : 'LOCKED';
  $('chip-memory').textContent = s ? 'ACTIVE' : 'LOCKED';
  $('chip-memory').className = `v ${s ? 'live' : 'off'}`;
  if (s) setState('idle', 'Ready');
  else { voice.end(); setState('idle', 'Signed out'); conversationId = null; $('log').replaceChildren(); people.reset(); memories.reset(); }
}

async function authAction(kind) {
  const creds = { email: $('email').value, password: $('password').value };
  const { error } = kind === 'up' ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
  if (error) return setState('error', error.message);
  if (kind === 'up') setState('idle', 'Account created. Confirm email if required, then sign in');
}

$('auth-form').addEventListener('submit', (e) => { e.preventDefault(); authAction('in'); });
$('signup').addEventListener('click', () => authAction('up'));
$('signout').addEventListener('click', () => sb.auth.signOut());
$('export').addEventListener('click', async () => {
  try {
    const blob = await api.exportAll();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `karwahe-export-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { setState('error', e.message); }
});
sb.auth.onAuthStateChange((_evt, s) => render(s));
sb.auth.getSession().then(({ data }) => render(data.session));

$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('msg').value.trim();
  if (!text || !session) return;
  if (voice.sessionOpen) voice.interrupt('button'); // typing takes over from any speaking/in-flight voice turn
  $('msg').value = '';
  addBubble('user', text);
  const typing = addBubble('assistant typing', '...');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  setState('thinking', 'Processing');
  try {
    const data = await api.chat(text, conversationId, 'text');
    conversationId = data.conversationId;
    typing.remove();
    addBubble('assistant', data.reply);
    setState(voice.sessionOpen ? HUD[voice.state] : 'idle', voice.sessionOpen ? LABEL[voice.state] : 'Ready');
  } catch (err) {
    typing.remove();
    setState('error', err.message);
  } finally {
    btn.disabled = false;
    $('msg').focus();
  }
});
