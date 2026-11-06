const { test } = require('node:test');
const assert = require('node:assert/strict');
const transfer = require('../notes-transfer.js');
const books = { phedre: 100, gulliver: 500 };
const note = (changes = {}) => ({ id: 'note1', book: 'phedre', b0: 2, s: 1, b1: 2, e: 8,
  quote: 'Строка', text: 'Мысль «о книге»\n第二行 📖', label: 'Акт I', pct: .2,
  created: 1000, updated: 2000, ...changes });
const envelope = notes => JSON.stringify({ format: 'polka-notes', version: 1,
  exportedAt: '2026-11-06T12:00:00.000Z', notes });
function storage(state = {}, failKey) {
  const values = new Map([[transfer.STORAGE_KEY, JSON.stringify(state)]]);
  return { getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (key === failKey) throw new Error('QuotaExceededError'); values.set(key, value); } };
}
const state = () => ({ notes: { note1: note() }, progress: { phedre: { a: 32, r: 40, pct: .4, t: 4000 } },
  last: 'phedre', lastT: 4000, read: { gulliver: { t: 3000 } }, fs: 21,
  cm: { note1: { items: [{ text: 'Сохранённый комментарий' }] } }, del: ['old'],
  ink: { phedre: { s: [1, 2, 3] } }, bookmarks: ['kept'], futurePreference: true });

test('JSON round trip retains Unicode, dates and text anchors, excludes cloud flags and other state', () => {
  const text = transfer.serializeBackup([note({ synced: true, secret: 'omit' })], books);
  const parsed = transfer.parseBackup('\uFEFF' + text, books);
  assert.deepEqual(parsed, [note()]);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['exportedAt', 'format', 'notes', 'version']);
  assert.ok(!text.includes('synced') && !text.includes('secret'));
});
test('rejects malformed, unrelated, future-version and excessive JSON', () => {
  for (const text of ['{', 'null', '[]', '{}', '{"format":"polka-notes","version":2}',
    JSON.stringify({ format: 'polka-notes', version: 1, exportedAt: 'bad', notes: [] }),
    ' '.repeat(transfer.MAX_BYTES + 1)]) assert.throws(() => transfer.parseBackup(text, books));
});
test('rejects duplicate or unsafe IDs, unknown books, non-string books and malformed values', () => {
  for (const changes of [{ id: '__proto__' }, { id: 'constructor' }, { id: 'x" onclick="alert(1)' },
    { book: 'missing' }, { book: ['phedre'] }, { text: 42 }, { quote: {} }, { updated: 'yesterday' },
    { pct: 2 }, { b0: -1 }, { b1: 101 }, { b0: 3, b1: 2 }, { b1: null }, { e: 0 }, { s: -1 },
    { book: 'general' }]) assert.throws(() => transfer.parseBackup(envelope([note(changes)]), books));
  assert.throws(() => transfer.parseBackup(envelope([note(), note()]), books));
});
test('general notes without a book or text anchor can be restored', () => {
  const general = note({ book: 'general', b0: null, b1: null, s: 0, e: 0, quote: '', pct: null });
  assert.deepEqual(transfer.parseBackup(envelope([general]), books), [general]);
});
test('merge keeps local notes and both conflicting versions; repeated imports are idempotent', () => {
  const incoming = [note({ text: 'Правка на другом устройстве', updated: 3000 }), note({ id: 'note2' })];
  const first = transfer.mergeNotes([note()], incoming);
  assert.equal(first.conflicts, 1);
  assert.equal(first.added, 2);
  assert.equal(Object.keys(first.notes).length, 3);
  assert.equal(first.notes.note1.text, note().text);
  assert.ok(Object.values(first.notes).some(n => n.text === incoming[0].text));
  const second = transfer.mergeNotes(Object.values(first.notes), incoming);
  assert.deepEqual(second.notes, first.notes);
  assert.equal(second.added, 0);
});
test('same contents with changed timestamps do not duplicate a note', () => {
  assert.equal(transfer.mergeNotes([note()], [note({ updated: 9999 })]).added, 0);
});
for (const mode of ['merge', 'replace']) test(`${mode} changes only notes, backing up before writing`, () => {
  const original = state();
  const local = storage(original);
  const result = transfer.importNotes(local, transfer.snapshot(local, original, books), [note({ id: 'note2' })], mode, books);
  const saved = JSON.parse(local.getItem(transfer.STORAGE_KEY));
  const { notes: ignoredOld, ...oldOther } = original;
  const { notes: ignoredNew, ...newOther } = saved;
  assert.deepEqual(newOther, oldOther);
  assert.deepEqual(transfer.parseBackup(local.getItem(transfer.BACKUP_KEY), books), [note()]);
  assert.equal(Object.keys(saved.notes).length, mode === 'merge' ? 2 : 1);
  assert.deepEqual(result.state, saved);
  assert.deepEqual(original, state(), 'caller memory must not change before persistent success');
});
test('backup can restore replaced notes; empty merge and explicit empty replacement are supported', () => {
  const original = state(), local = storage(original);
  const merged = transfer.importNotes(local, transfer.snapshot(local, original, books), [], 'merge', books);
  assert.deepEqual(merged.state.notes, original.notes);
  const replaced = transfer.importNotes(local, transfer.snapshot(local, merged.state, books), [], 'replace', books);
  assert.deepEqual(replaced.state.notes, {});
  const recovery = transfer.parseBackup(local.getItem(transfer.BACKUP_KEY), books);
  const restored = transfer.importNotes(local, transfer.snapshot(local, replaced.state, books), recovery, 'replace', books);
  assert.deepEqual(restored.state.notes, original.notes);
});
for (const key of [transfer.BACKUP_KEY, transfer.STORAGE_KEY]) test(`storage failure at ${key} preserves existing notes and memory`, () => {
  const original = state(), local = storage(original, key);
  const raw = local.getItem(transfer.STORAGE_KEY);
  assert.throws(() => transfer.importNotes(local, transfer.snapshot(local, original, books), [], 'replace', books),
    /Не удалось/);
  assert.equal(local.getItem(transfer.STORAGE_KEY), raw);
  assert.deepEqual(original, state());
});
test('rejects corrupt local storage without replacing it', () => {
  const local = storage(state());
  local.setItem(transfer.STORAGE_KEY, '{broken');
  assert.throws(() => transfer.snapshot(local, state(), books));
  assert.equal(local.getItem(transfer.STORAGE_KEY), '{broken');
  local.setItem(transfer.STORAGE_KEY, '{"notes":{"wrong":{"id":"note1"}}}');
  assert.throws(() => transfer.snapshot(local, state(), books));
});
test('detects changes from another tab between preview and confirmation', () => {
  const original = state(), local = storage(original);
  const preview = transfer.snapshot(local, original, books);
  const newer = { ...original, notes: { note2: note({ id: 'note2' }) } };
  local.setItem(transfer.STORAGE_KEY, JSON.stringify(newer));
  assert.throws(() => transfer.importNotes(local, preview, [], 'replace', books), /другом окне/);
  assert.deepEqual(JSON.parse(local.getItem(transfer.STORAGE_KEY)), newer);
  assert.equal(local.getItem(transfer.BACKUP_KEY), null);
  assert.throws(() => transfer.snapshot(local, original, books), /различаются/);
});
test('fresh device can import and rejects unsupported modes without writes', () => {
  const local = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); } };
  const before = transfer.snapshot(local, { notes: {}, progress: {} }, books);
  assert.throws(() => transfer.importNotes(local, before, [note()], 'unknown', books));
  assert.equal(local.values.size, 0);
  const result = transfer.importNotes(local, before, [note()], 'merge', books);
  assert.deepEqual(result.state.notes.note1, note());
});
