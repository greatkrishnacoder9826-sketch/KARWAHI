import { normalize, refusalReason, sensitivityOf, guessCategory, MAX_LEN, MAX_MEMORIES } from './memoryRules.js';
import { pickMentioned } from './relationships.js';

// ---------- Parsing (pure, deterministic) ----------
const LIST_RES = [
  /\b(meri|mere|my|saved|saari|sari|all)\b.{0,30}\b(memor(?:y|ies)|yaad(?:ein|en|daasht)?)\b.{0,30}\b(dikha\w*|show|list|batao|bata\w*|dekh\w*)\b/i,
  /\b(dikha\w*|show|list|batao|bata\w*)\b.{0,30}\bmemor(?:y|ies)\b/i,
  /\bmemor(?:y|ies)\b.{0,20}\b(dikha\w*|show|list|batao|bata\w*|dekh\w*)\b/i,
  /\bwhat (?:do|did) you (?:remember|know) about me\b/i,
  /\bkya\s+(?:kya\s+)?yaad\s+hai\b.*\b(mere|meri|mujh\w*)\b/i,
];
const UPDATE_RES = [
  /^(?:please\s+)?(?:update|edit|change)\s+memory\s*#?(\d{1,3})\s*[:\-]\s*(.+)$/is,
  /^(?:memory|yaad)\s*#?(\d{1,3})\s*(?:ko\s+)?(?:update|edit|change|badal)\w*\s*(?:kar\s*(?:lo|do|o)?|karo)?\s*[:\-]\s*(.+)$/is,
];
const PROFILE_RES = [
  /^(?:please\s+)?(?:mere|meri)\s+profile\s+(?:ko\s+)?update\s*(?:kar\w*)?\s*[:\-]\s*(.+)$/is,
  /^update\s+(?:my\s+)?profile\s*[:\-]\s*(.+)$/is,
];
const FORGET_START = /^(?:please\s+|plz\s+)?(?:forget|bhool\s*ja\w*)\b\s*(?:this|that|ye|yeh|it|isko|ise|about)?\s*[:\-]?\s*(.*)$/is;
const FORGET_MAT = /\b(?:ye|yeh|isko|ise)?\s*yaad\s+mat\s+rakh\w*\s*[:\-]?\s*(.*)$/is;
const PERSON_SAVE = [
  /^(.+?)\s+(?:ke|ki|ka)\s+(?:baare|bare)\s+(?:mein|me)\s+(?:ye|yeh|yah)?\s*(?:save\s*kar|note\s*kar|yaad\s*rakh|remember)\w*(?:\s*(?:lo|do|o))?\s*(?:ki|that|:|-|,)*\s*(.+)$/is,
  /^(?:remember|note|save)\s+(?:this\s+)?about\s+(.+?)\s*[:\-]\s*(.+)$/is,
];
const SAVE_PREFIX = /^(?:please\s+|plz\s+|karwahe[,:]?\s+)?(?:(?:mere|meri)\s+(?:baare|bare)\s+(?:mein|me)\s+)?(?:(?:ye|yeh|yah|isko|ise|this)\s+)?(?:remember|yaad\s*rakh(?:o|na|iye|ana)?|note\s*(?:kar|down)(?:\s*(?:lo|do|o))?|save\s*kar(?:\s*(?:lo|do|o))?|save\s+this|memory\s*(?:me|mein)\s*(?:save|add)\s*kar(?:\s*(?:lo|do|o))?)(?![a-z])(?:\s*(?:this|ye|yeh)\s*[:\-,]|\s*(?:that|ki)\b|\s*[:\-,])*\s*(.*)$/is;
const SAVE_SUFFIX = /^(.{3,}?)[\s,.\-]+(?:(?:ye|yeh|isko|ise|this|it)\s+)?(?:save\s*kar|note\s*kar|yaad\s*rakh(?:o|na|iye)?)(?:\s*(?:lo|do|o|na|dena|den|lena))?\s*[.!]*$/is;

const STOP = new Set(['forget', 'mera', 'delete', 'hata', 'hatao', 'mita', 'mitao', 'remove', 'clear', 'kar', 'karo', 'karna', 'kardo', 'do', 'lo', 'de', 'memory', 'memories', 'yaad', 'saved', 'ye', 'yeh', 'is', 'isko', 'ise', 'this', 'that', 'it', 'please', 'plz', 'ko', 'wali', 'wala', 'meri', 'mere', 'ka', 'ki', 'ke', 'baare', 'mein', 'bhool', 'jao', 'ja', 'mat', 'rakho', 'rakh', 'about', 'the', 'my', 'and', 'aur']);

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

/** Returns a command object, or null when the message is ordinary conversation. */
export function parseCommand(raw) {
  const text = clean(raw);
  if (!text || text.length > 1500) return null;

  for (const re of UPDATE_RES) { const m = text.match(re); if (m) return { type: 'update', index: Number(m[1]), content: clean(m[2]) }; }
  for (const re of PROFILE_RES) { const m = text.match(re); if (m) return { type: 'save', content: clean(m[1]), category: 'profile' }; }
  if (LIST_RES.some((re) => re.test(text))) return { type: 'list' };

  const forgetBits = (rest) => {
    const num = (text.match(/\b(?:memory|yaad|#)\s*(\d{1,3})\b/i) || rest.match(/^\D*(\d{1,3})\D*$/) || [])[1];
    const query = normalize(rest).split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
    return { type: 'forget', index: num ? Number(num) : null, query };
  };

  let m = text.match(FORGET_START);
  if (m) return forgetBits(m[1]);

  for (const re of PERSON_SAVE) { m = text.match(re); if (m) return { type: 'save_person', nameText: clean(m[1]), content: clean(m[2]) }; }

  if (/\?\s*$/.test(text)) return null; // questions are chat, not commands
  m = text.match(SAVE_PREFIX);
  if (m) return { type: 'save', content: clean(m[1]) };
  m = text.match(SAVE_SUFFIX);
  if (m) return { type: 'save', content: clean(m[1]) };

  m = text.match(FORGET_MAT);
  if (m) return forgetBits(m[1]);
  if (/\b(memory|memories|yaad|saved)\b/i.test(text) && /\b(delete|hata\w*|mita\w*|remove|clear)\b/i.test(text)) return forgetBits(text);
  return null;
}

// ---------- Execution (confirms only what the store really did) ----------
const short = (s, n = 110) => (s.length > n ? `${s.slice(0, n)}...` : s);

function listReply(memories, mode) {
  if (!memories.length) return 'Abhi koi saved memory nahi hai. Bolo: "remember: ..." aur main save kar dungi.';
  const shown = mode === 'voice' ? memories.slice(-5) : memories;
  const offset = memories.length - shown.length;
  const lines = shown.map((x, i) => `${offset + i + 1}. ${short(x.content, 140)}`);
  const head = mode === 'voice' ? `Total ${memories.length} memories hain. Aakhri ${shown.length}:` : `Tumhari ${memories.length} saved memories:`;
  const tail = mode === 'voice' ? ' Poori list Memory tab mein dekh sakte ho.' : '\nDelete ke liye bolo: "forget 2". Badalne ke liye: "update memory 2: ..."';
  return `${head}\n${lines.join('\n')}${tail}`;
}

export async function executeCommand({ store, cmd, mode = 'text' }) {
  try {
    switch (cmd.type) {
      case 'list': return listReply(await store.listMemories(), mode);

      case 'save': {
        if (!cmd.content) return 'Kya save karun? Aise bolo: "remember: mera exam 5 December ko hai".';
        return await saveMemory(store, cmd.content, cmd.category);
      }

      case 'save_person': {
        if (!cmd.content) return 'Kya save karun? Naam ke baad batao, jaise: "Retesh ke baare mein ye save karo: ..."';
        if (cmd.content.length > MAX_LEN) return `Thoda chhota karo (${MAX_LEN} characters tak).`;
        const why = refusalReason(cmd.content);
        if (why) return `Ye ${why} jaisa lag raha hai, ise main save nahi karti.`;
        const found = pickMentioned(await store.listPeople(), cmd.nameText);
        if (found.people.length === 1 && !found.ambiguous) {
          await store.addEvent(found.people[0].id, cmd.content);
          return `Save ho gaya. ${found.people[0].name} ke saath ye note joda: "${short(cmd.content)}"`;
        }
        if (found.people.length > 1) return `"${cmd.nameText}" kai logon se match karta hai. Poora naam bolo ya People tab use karo.`;
        const r = await saveMemory(store, `${cmd.nameText}: ${cmd.content}`);
        return `People tab mein "${cmd.nameText}" nahi mila, isliye ise general memory ki tarah rakha. ${r}`;
      }

      case 'update': {
        const list = await store.listMemories();
        const target = list[cmd.index - 1];
        if (!target) return `Memory #${cmd.index} nahi mili. "memories dikhao" bolke numbers dekho.`;
        if (!cmd.content || cmd.content.length > MAX_LEN) return `Naya text 1 se ${MAX_LEN} characters ke beech hona chahiye.`;
        const why = refusalReason(cmd.content);
        if (why) return `Ye ${why} jaisa lag raha hai, ise main save nahi karti.`;
        const ok = await store.updateMemory(target.id, { content: cmd.content, sensitivity: sensitivityOf(cmd.content), last_confirmed_at: new Date().toISOString() });
        return ok ? `Memory #${cmd.index} update ho gayi: "${short(cmd.content)}"` : 'Update nahi ho paya. Dobara try karo.';
      }

      case 'forget': {
        const list = await store.listMemories();
        if (!list.length) return 'Abhi koi saved memory nahi hai.';
        let target;
        if (cmd.index) {
          target = list[cmd.index - 1];
          if (!target) return `Memory #${cmd.index} nahi mili. "memories dikhao" bolke numbers dekho.`;
        } else if (cmd.query.length) {
          const scored = list.map((x, i) => ({ x, i, s: cmd.query.filter((w) => normalize(x.content).includes(w)).length })).filter((r) => r.s > 0);
          const best = Math.max(0, ...scored.map((r) => r.s));
          const top = scored.filter((r) => r.s === best);
          if (!top.length) return 'Aisi koi memory nahi mili. "memories dikhao" bolke dekho.';
          if (top.length > 1) return `Kai memories match hui, kaun si hatani hai?\n${top.slice(0, 5).map((r) => `${r.i + 1}. ${short(r.x.content, 90)}`).join('\n')}\nBolo: "forget 2" (number ke saath).`;
          target = top[0].x; cmd.index = top[0].i + 1;
        } else return 'Kaun si memory hatani hai? Bolo "forget 2" ya "memories dikhao".';
        const ok = await store.deleteMemory(target.id);
        return ok ? `Delete ho gayi: "${short(target.content)}". Numbers badal gaye hain, dobara "memories dikhao" bolo.` : 'Delete nahi ho paya. Dobara try karo.';
      }
      default: return 'Ye command samajh nahi aaya.';
    }
  } catch (err) {
    console.error('[memory command]', err.message);
    return 'Ye operation nahi ho paya (server side problem). Maine kuch save ya delete nahi kiya, thodi der baad dobara try karo.';
  }
}

async function saveMemory(store, content, category) {
  if (content.length > MAX_LEN) return `Thoda chhota karo (${MAX_LEN} characters tak).`;
  const why = refusalReason(content);
  if (why) return `Ye ${why} jaisa lag raha hai. Aisi cheezein main save nahi karti, kripya yahan store mat karo.`;
  const existing = await store.listMemories();
  if (existing.length >= MAX_MEMORIES) return `Memory limit (${MAX_MEMORIES}) poori ho gayi. Kuch purani delete karo.`;
  if (existing.some((x) => normalize(x.content) === normalize(content))) return 'Ye pehle se saved hai.';
  const sensitivity = sensitivityOf(content);
  await store.insertMemory({ content, category: category || guessCategory(content), sensitivity, source: 'chat' });
  return `Save ho gaya: "${short(content)}"${sensitivity === 'sensitive' ? ' (sensitive mark kiya hai. Memory tab se kabhi bhi delete kar sakte ho.)' : ''}`;
}
