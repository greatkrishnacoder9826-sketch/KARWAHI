// Explicit voice state machine. Invalid or duplicate transitions are ignored (go() returns false),
// so repeated callbacks can never create overlapping sessions.
export const STATES = ['idle', 'requesting_microphone', 'listening', 'transcribing', 'thinking', 'speaking', 'interrupted', 'paused', 'error'];

const ALLOWED = {
  idle: ['requesting_microphone'],
  requesting_microphone: ['listening', 'error', 'idle'],
  listening: ['transcribing', 'paused', 'idle', 'error'],
  transcribing: ['thinking', 'listening', 'interrupted', 'paused', 'idle', 'error'],
  thinking: ['speaking', 'listening', 'interrupted', 'paused', 'idle', 'error'],
  speaking: ['listening', 'interrupted', 'paused', 'idle', 'error'],
  interrupted: ['listening', 'paused', 'idle', 'error'],
  paused: ['requesting_microphone', 'idle'],
  error: ['idle', 'requesting_microphone', 'listening'],
};

export class VoiceStateMachine {
  constructor(onChange) { this.state = 'idle'; this.onChange = onChange; }
  can(to) { return ALLOWED[this.state].includes(to); }
  go(to, info) {
    if (this.state === to || !this.can(to)) return false;
    const from = this.state;
    this.state = to;
    this.onChange?.(to, from, info);
    return true;
  }
}
