import { h } from './dom.js';

const CATS = ['general', 'preference', 'education', 'skill', 'project', 'goal', 'date', 'profile'];

export function createMemoryUI({ api, root }) {
  let items = [];
  let editingId = null;
  let note = '';
  let loaded = false;

  async function load() {
    try { items = (await api.mem.list()).memories; loaded = true; note = ''; } catch (e) { note = `Load nahi hua: ${e.message}`; }
    draw();
  }
  function reset() { items = []; editingId = null; note = ''; loaded = false; root.replaceChildren(); }
  async function run(fn, ok) { try { await fn(); editingId = null; await load(); if (ok) { note = ok; draw(); } } catch (e) { note = `Error: ${e.message}`; draw(); } }

  function addForm() {
    const text = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Kuch bhi jo KARWAHE ko yaad rakhna hai...', 'aria-label': 'New memory', required: true });
    const cat = h('select', { 'aria-label': 'Category' }, CATS.map((c) => h('option', { value: c }, c)));
    return h('form', { class: 'stack card', onsubmit: (e) => { e.preventDefault(); run(() => api.mem.create({ content: text.value, category: cat.value }), 'Memory save ho gayi.'); } },
      h('label', {}, 'NEW MEMORY', text),
      h('div', { class: 'row' }, cat, h('button', { type: 'submit', class: 'btn sm' }, 'Save')),
      h('span', { class: 'hint' }, 'Chat mein bhi bol sakte ho: "remember: ...", "forget 2", "memories dikhao". Password, OTP, card/ID numbers save nahi hote.'));
  }

  function item(m, i) {
    if (editingId === m.id) {
      const text = h('textarea', { rows: 3, maxlength: 500, 'aria-label': 'Edit memory' }, m.content);
      return h('form', { class: 'stack card', onsubmit: (e) => { e.preventDefault(); run(() => api.mem.update(m.id, { content: text.value }), 'Update ho gaya.'); } },
        text, h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn sm' }, 'Save'),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { editingId = null; draw(); } }, 'Cancel')));
    }
    return h('article', { class: 'card mem' },
      h('p', {}, h('span', { class: 'k-label' }, `#${i + 1} `), m.content),
      h('div', { class: 'row meta' }, h('span', { class: 'tagchip' }, m.category), m.sensitivity === 'sensitive' && h('span', { class: 'tagchip warn' }, 'sensitive'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { editingId = m.id; draw(); } }, 'Edit'),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { if (confirm('Ye memory delete karein?')) run(() => api.mem.remove(m.id), 'Delete ho gayi.'); } }, 'Delete')));
  }

  function draw() {
    const kids = [h('p', { class: 'note', role: 'status', 'aria-live': 'polite' }, note), addForm()];
    if (loaded && !items.length) kids.push(h('p', { class: 'hint' }, 'Abhi koi saved memory nahi hai.'));
    items.forEach((m, i) => kids.push(item(m, i)));
    root.replaceChildren(...kids);
  }
  return { load, reset };
}
