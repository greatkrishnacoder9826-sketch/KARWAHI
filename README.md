# KARWAHE

Personal AI companion. Status: **Stages 1-5 partial** (foundation, text chat, voice, people/relationships, memory commands, phone-friendly UI). Emotion layer, semantic (vector) memory search, summaries and account deletion are not built yet.

## Local setup (Windows 11, VS Code)
1. Install Node.js 20+ (check: `node -v`).
2. Create a Supabase project, then run `database/schema.sql` in its SQL editor. (Existing project from earlier stages? Run only the new migrations: `002_relationships.sql`, then `003_memories.sql`.)
3. Copy `.env.example` to `backend/.env`, fill `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`, and set `GROQ_MODEL` to a current model from Groq's model list.
4. Copy `frontend/js/config.example.js` to `frontend/js/config.js` and fill it.
5. Backend: `cd backend && npm install && npm start` (expect `KARWAHE backend on :3000`).
6. Frontend: serve `frontend/` on port 5500 (VS Code Live Server, or `npx serve frontend -l 5500`).
7. Open the site, create an account, sign in, chat.

## Voice (Stage 4)
Extra `backend/.env` values: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL` (the model you selected). STT uses `scribe_v2`.
Flow: mic -> automatic speech detection -> `POST /api/voice/transcribe` -> `POST /api/chat` (mode `voice`) -> `POST /api/voice/speak` -> playback -> back to listening.
- States: idle, requesting_microphone, listening, transcribing, thinking, speaking, interrupted, paused, error (`frontend/js/voice-state.js`).
- Controls: Start, Pause/Resume (releases the mic), Mute, Interrupt, End, Continuous toggle. Speaking loudly while she talks also interrupts.
- Use headphones for the cleanest result. Echo cancellation is requested from the browser but is not guaranteed.
- Limits: turn-based (not full-duplex streaming); audio upload max 5 MB; TTS text max 1500 chars per reply; per-user daily TTS cap `VOICE_DAILY_CHARS` (in-memory, resets on restart). ElevenLabs bills STT by audio duration and TTS by characters; free-tier limits apply. Check your plan.
- Use Chrome or Edge on `localhost` (microphone needs localhost or HTTPS).

## People / relationships
Open the **People** tab: add anyone, with relation, your description, your feelings, extra spellings (aliases), custom details (any key/value, e.g. Birthday) and dated events you want to share. Everything is private to your account (RLS) and editable/deletable.
- In chat or voice, a person is added to the AI context only when their name or alias appears in your message. A bare "Didi" matches every Didi and KARWAHE is told to ask which one.
- Stored text is treated as untrusted data and is never allowed to act as instructions.
- **Import starting people** reads `backend/seed/relationships.seed.json` (private, gitignored). It is idempotent. Edit that file before importing if you want different wording; never commit it.
- Not built yet: saying "Retesh ke baare mein ye save karo" in chat (natural-language save/forget), export, and account deletion.

## Memory commands (chat or voice)
Say or type: `remember: ...`, `mere baare mein ye save kar lo: ...`, `yaad rakhna ki ...`, `Retesh ke baare mein ye save karo: ...` (adds a note to that person), `meri saved memories dikhao`, `forget 2`, `forget this: exam date`, `update memory 2: ...`, `mere profile ko update karo: ...`.
- These run on the backend. KARWAHE's reply states only what the database actually did; failures are reported as failures.
- Forget deletes only on a clear match (a number, or exactly one best text match). Otherwise she asks which one.
- Passwords/OTP/PIN, card numbers, government ID numbers and API keys are refused. Health/money/religion-type notes are saved only on an explicit command and marked `sensitive`.
- Retrieval is keyword overlap (not semantic search yet), so differently worded memories may be missed.
- Memory tab: add, edit, delete, **Export my data** (JSON of your own data only), Sign out.

## Phone
The layout is responsive (single column, big touch targets, sticky input, keyboard-aware). The microphone only works on **HTTPS or localhost**, so opening `http://<laptop-ip>:5500` on a phone will not allow the mic. To test on a real phone before deploying: connect it by USB, open `chrome://inspect/#devices` in desktop Chrome, enable *Port forwarding* for 5500 and 3000, then open `http://localhost:5500` on the phone.

## Tests
`cd backend && npm test` runs API tests (health, auth rejection, 404). Voice tests use a stubbed `fetch` and verify request shapes only; they do not call Groq, Supabase or ElevenLabs.

## Security notes
- Provider keys live only in `backend/.env`. The Supabase anon key in the frontend is public by design; RLS protects data.
- User id always comes from the verified token. Every table has owner-only RLS policies.
