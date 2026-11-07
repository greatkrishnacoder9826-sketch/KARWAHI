import { h } from './dom.js';

// People screen. All user text is rendered with textContent (never innerHTML).
export function createRelationshipUI({ api, root }) {
  let people = [];
  let editing = null; // person object, 'new', or null
  let note = '';
  let loaded = false;

  const say = (m) => { note = m; draw(); };

  async function load() {
    try { people = (await api.rel.list()).people; loaded = true; note = ''; }
    catch (e) { note = `Load nahi hua: ${e.message}`; }
    draw();
  }
  function reset() { people = []; editing = null; note = ''; loaded = false; root.replaceChildren(); }

  async function run(fn, okMsg) {
    try { await fn(); await load(); if (okMsg) say(okMsg); } catch (e) { say(`Error: ${e.message}`); }
  }

  // ---------- form ----------
  function form(person) {
    const isNew = person === 'new';
    const p = isNew ? { name: '', relation: '', description: '', my_feelings: '', aliases: [], facts: [] } : person;
    const f = {
      name: h('input', { maxlength: 80, value: p.name, required: true, 'aria-label': 'Name' }),
      relation: h('input', { maxlength: 120, value: p.relation, placeholder: 'Mera unse rishta (Didi, best friend, ...)' }),
      description: h('textarea', { maxlength: 1000, rows: 3, placeholder: 'Unke baare mein jo tum batana chahte ho' }, p.description),
      feelings: h('textarea', { maxlength: 1000, rows: 2, placeholder: 'Tumhari feelings / perspective' }, p.my_feelings),
      aliases: h('input', { value: (p.aliases || []).join(', '), placeholder: 'Aur naam/spellings, comma se alag (Nikil, Rana)' }),
    };
    const factRows = h('div', { class: 'fact-rows' });
    const addFact = (k = '', v = '') => factRows.append(h('div', { class: 'row fact' },
      h('input', { class: 'fk', maxlength: 40, value: k, placeholder: 'Detail (Birthday, City, ...)', 'aria-label': 'Detail name' }),
      h('input', { class: 'fv', maxlength: 200, value: v, placeholder: 'Value', 'aria-label': 'Detail value' }),
      h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Remove detail', onclick: (e) => e.target.closest('.fact').remove() }, '×')));
    (p.facts || []).forEach((x) => addFact(x.key, x.value));

    const submit = (e) => {
      e.preventDefault();
      const payload = {
        name: f.name.value, relation: f.relation.value, description: f.description.value, my_feelings: f.feelings.value,
        aliases: f.aliases.value.split(',').map((x) => x.trim()).filter(Boolean),
        facts: [...factRows.querySelectorAll('.fact')].map((r) => ({ key: r.querySelector('.fk').value, value: r.querySelector('.fv').value }))
          .filter((x) => x.key.trim() || x.value.trim()),
      };
      run(async () => { isNew ? await api.rel.create(payload) : await api.rel.update(p.id, payload); editing = null; }, isNew ? 'Person add ho gaya.' : 'Update ho gaya.');
    };

    return h('form', { class: 'stack card', onsubmit: submit },
      h('label', {}, 'NAME', f.name), h('label', {}, 'RELATION', f.relation),
      h('label', {}, 'DESCRIPTION', f.description), h('label', {}, 'MY FEELINGS', f.feelings),
      h('label', {}, 'ALIASES', f.aliases),
      h('div', {}, h('div', { class: 'k-label' }, 'CUSTOM DETAILS (kuch bhi add karo)'), factRows,
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => addFact() }, '+ Add detail')),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn' }, 'Save'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { editing = null; draw(); } }, 'Cancel')));
  }

  // ---------- cards ----------
  function card(p) {
    const evText = h('input', { maxlength: 500, placeholder: 'Koi event/baat jo tum share karna chaho', 'aria-label': 'New event' });
    const evDate = h('input', { type: 'date', 'aria-label': 'Event date' });
    return h('article', { class: 'card person' },
      h('div', { class: 'person-head' }, h('strong', {}, p.name), p.relation && h('span', { class: 'tagchip' }, p.relation)),
      p.description && h('p', {}, p.description),
      p.my_feelings && h('p', { class: 'feel' }, h('span', { class: 'k-label' }, 'MERI FEELING '), p.my_feelings),
      (p.facts || []).length > 0 && h('div', { class: 'facts' }, p.facts.map((x) => h('span', { class: 'tagchip' }, `${x.key}: ${x.value}`))),
      p.events.length > 0 && h('ul', { class: 'events' }, p.events.map((e) => h('li', {},
        h('span', {}, `${e.happened_on ? `${e.happened_on} · ` : ''}${e.event_text}`),
        h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': 'Delete event', onclick: () => run(() => api.rel.removeEvent(p.id, e.id)) }, '×')))),
      h('form', { class: 'row ev-form', onsubmit: (ev) => { ev.preventDefault(); if (!evText.value.trim()) return;
        run(() => api.rel.addEvent(p.id, { event_text: evText.value, happened_on: evDate.value || undefined }), 'Event save ho gaya.'); } },
        evText, evDate, h('button', { type: 'submit', class: 'btn ghost sm' }, '+ Event')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { editing = p; draw(); } }, 'Edit'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { if (confirm(`${p.name} ko aur unke saare events delete karein?`)) run(() => api.rel.remove(p.id), 'Delete ho gaya.'); } }, 'Delete')));
  }

  function draw() {
    const kids = [h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => { editing = 'new'; draw(); } }, '+ Add person'),
      h('span', { class: 'hint' }, 'Ye sirf tumhara private data hai. Chat mein jab naam aayega tabhi use hoga.')),
      h('p', { class: 'note', role: 'status', 'aria-live': 'polite' }, note)];
    if (editing) kids.push(form(editing));
    if (loaded && !people.length && !editing) kids.push(h('div', { class: 'card' },
      h('p', {}, 'Abhi koi person saved nahi hai.'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => run(async () => { const r = await api.rel.seed(); note = `${r.added} log import hue.`; }) }, 'Import starting people')));
    people.forEach((p) => { if (editing !== p) kids.push(card(p)); });
    root.replaceChildren(...kids);
  }

  return { load, reset };
}
