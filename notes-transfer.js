/* Local JSON backups only: this module never makes network requests. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PolkaNotesTransfer = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const STORAGE_KEY = 'polka-reader-v1';
  const BACKUP_KEY = STORAGE_KEY + '-notes-backup';
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_NOTES = 10000;
  const CONTENT_FIELDS = ['book', 'b0', 's', 'b1', 'e', 'quote', 'text', 'label', 'pct'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const safeId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) &&
    !['__proto__', 'prototype', 'constructor'].includes(id);
  class TransferError extends Error {}
  function fail(message) { throw new TransferError(message); }
  function byteLength(text) { return new TextEncoder().encode(text).length; }

  // Rebuild every note from allowed fields. IDs are also used in HTML attributes
  // and selectors by the original reader, so arbitrary strings are not safe IDs.
  function validateNotes(items, books) {
    if (!Array.isArray(items) || items.length > MAX_NOTES) fail('Некорректный список заметок (не более 10 000).');
    const seen = new Set();
    return items.map(n => {
      if (!record(n) || !safeId(n.id) || seen.has(n.id)) fail('Некорректный или повторяющийся идентификатор заметки.');
      seen.add(n.id);
      if (typeof n.book !== 'string' || (n.book !== 'general' && (!own(books, n.book) || !Number.isSafeInteger(books[n.book])))) {
        fail('В файле есть заметка к неизвестной книге. Обновите приложение и проверьте файл.');
      }
      const result = { id: n.id, book: n.book };
      for (const field of ['quote', 'text', 'label']) {
        if (typeof n[field] !== 'string' || n[field].length > 1000000) fail('Некорректный текст заметки.');
        result[field] = n[field];
      }
      for (const field of ['created', 'updated']) {
        if (!Number.isSafeInteger(n[field]) || n[field] < 0 || n[field] > 8640000000000000) fail('Некорректная дата заметки.');
        result[field] = n[field];
      }
      for (const field of ['b0', 'b1']) {
        const value = n[field];
        if (value !== null && (!Number.isSafeInteger(value) || value < 0 || n.book === 'general' || value >= books[n.book])) {
          fail('Некорректная привязка заметки к тексту книги.');
        }
        result[field] = value;
      }
      if ((n.b0 === null) !== (n.b1 === null) || (n.b0 !== null && n.b1 < n.b0)) fail('Некорректный диапазон заметки.');
      for (const field of ['s', 'e']) {
        if (!Number.isSafeInteger(n[field]) || n[field] < 0 || n[field] > 1000000) fail('Некорректное выделение текста.');
        result[field] = n[field];
      }
      if (n.b0 !== null && n.b0 === n.b1 && n.e < n.s) fail('Некорректный диапазон выделенного текста.');
      if (n.pct !== null && (typeof n.pct !== 'number' || !Number.isFinite(n.pct) || n.pct < 0 || n.pct > 1)) {
        fail('Некорректная позиция заметки.');
      }
      result.pct = n.pct;
      return result;
    });
  }
  function parseBackup(text, books) {
    if (typeof text !== 'string' || byteLength(text) > MAX_BYTES) fail('Файл слишком большой. Максимальный размер — 5 МБ.');
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (_) { fail('Не удалось прочитать JSON. Выберите файл, созданный кнопкой «Выгрузить заметки».'); }
    if (!record(data) || data.format !== 'polka-notes' || data.version !== 1 ||
        typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) {
      fail('Неподдерживаемый формат или версия файла. Нужна резервная копия «Полки» в формате JSON.');
    }
    return validateNotes(data.notes, books);
  }
  function serializeBackup(notes, books) {
    const text = JSON.stringify({ format: 'polka-notes', version: 1,
      exportedAt: new Date().toISOString(), notes: validateNotes(notes, books) }, null, 2) + '\n';
    if (byteLength(text) > MAX_BYTES) fail('Резервная копия превышает 5 МБ. Загрузка отменена.');
    return text;
  }
  const content = n => JSON.stringify(CONTENT_FIELDS.map(field => n[field]));
  const noteMap = notes => Object.fromEntries(notes.map(n => [n.id, n]));
  function mergeNotes(current, incoming) {
    const result = noteMap(current);
    let added = 0, conflicts = 0;
    for (const n of incoming) {
      if (!own(result, n.id)) { result[n.id] = { ...n }; added++; continue; }
      const signature = content(n);
      if (content(result[n.id]) === signature) continue;
      // A stable ID makes repeated imports of the same conflicting version safe.
      let hash = 2166136261;
      for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
      const base = n.id.slice(0, 90) + '_import_' + (hash >>> 0).toString(16);
      let id = base, suffix = 1;
      while (own(result, id) && content(result[id]) !== signature) id = base + '_' + suffix++;
      if (own(result, id)) continue;
      result[id] = { ...n, id }; added++; conflicts++;
    }
    return { notes: result, added, conflicts };
  }
  function storedNotes(state, books) {
    const map = state.notes === undefined ? {} : state.notes;
    if (!record(map) || Object.entries(map).some(([id, n]) => !record(n) || n.id !== id)) {
      fail('Хранилище заметок повреждено. Загрузка отменена, существующие данные сохранены.');
    }
    return validateNotes(Object.values(map), books);
  }
  function snapshot(storage, state, books) {
    const raw = storage.getItem(STORAGE_KEY);
    let persisted = {};
    try { if (raw !== null) persisted = JSON.parse(raw); }
    catch (_) { fail('Не удалось прочитать данные устройства. Загрузка отменена, существующие данные сохранены.'); }
    if (!record(persisted)) fail('Некорректное хранилище устройства. Загрузка отменена.');
    const local = storedNotes(state, books);
    const saved = raw === null ? [] : storedNotes(persisted, books);
    if (JSON.stringify(noteMap(local)) !== JSON.stringify(noteMap(saved))) {
      fail('Заметки в памяти и хранилище различаются. Выгрузите текущие заметки, затем откройте приложение заново.');
    }
    return { raw, state: { ...state, ...persisted }, notes: local };
  }
  function importNotes(storage, before, incoming, mode, books) {
    if (!['merge', 'replace'].includes(mode)) fail('Выберите объединение или замену заметок.');
    const validated = validateNotes(incoming, books);
    const merged = mode === 'merge' ? mergeNotes(before.notes, validated) :
      { notes: noteMap(validated), added: validated.length, conflicts: 0 };
    validateNotes(Object.values(merged.notes), books);
    const next = { ...before.state, notes: merged.notes };
    const backup = serializeBackup(before.notes, books);
    const serialized = JSON.stringify(next);
    if (storage.getItem(STORAGE_KEY) !== before.raw) fail('Данные изменились в другом окне. Загрузка отменена. Выберите файл заново.');
    try {
      // Never clear the store to make room. Quota/permission failures abort before
      // the atomic main-key write, leaving both saved notes and memory untouched.
      storage.setItem(BACKUP_KEY, backup);
      if (storage.getItem(BACKUP_KEY) !== backup) throw new Error('Backup verification failed');
    } catch (_) { fail('Не удалось создать резервную копию на устройстве. Загрузка отменена. Проверьте свободное место и разрешение на хранение данных.'); }
    if (storage.getItem(STORAGE_KEY) !== before.raw) fail('Данные изменились в другом окне. Загрузка отменена. Выберите файл заново.');
    try { storage.setItem(STORAGE_KEY, serialized); }
    catch (_) { fail('Не удалось сохранить заметки. Исходные данные и резервная копия сохранены. Возможно, хранилище заполнено.'); }
    return { state: next, added: merged.added, conflicts: merged.conflicts };
  }

  function setup({ getState, books, refresh, hasDraft }) {
    const find = selector => document.querySelector(selector);
    const exportButton = find('[data-notes-export]');
    const importButton = find('[data-notes-import]');
    const recoveryButton = find('[data-notes-backup]');
    const fileInput = find('#notes-file');
    const dialog = find('#notes-import-dialog');
    const applyButton = find('#notes-import-apply');
    const status = find('#notes-transfer-status');
    let pending = null, busy = false;
    const message = text => { status.textContent = text; };
    const errorMessage = err => err instanceof TransferError ? err.message :
      'Не удалось обработать файл или открыть хранилище устройства. Заметки не изменены.';
    function recoveryAvailable() {
      try { recoveryButton.hidden = window.localStorage.getItem(BACKUP_KEY) === null; }
      catch (_) { recoveryButton.hidden = true; }
    }
    function download(text, prefix) {
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = prefix + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        // Android may consume the Blob after the click handler has returned.
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    }
    exportButton.addEventListener('click', () => {
      try {
        download(serializeBackup(storedNotes(getState(), books), books), 'polka-notes-');
        message('Скачивание JSON-копии начато. Сохраните файл и перенесите его на другое устройство.');
      } catch (err) { message(errorMessage(err)); }
    });
    recoveryButton.addEventListener('click', () => {
      try {
        const text = window.localStorage.getItem(BACKUP_KEY);
        parseBackup(text, books);
        download(text, 'polka-notes-before-import-');
        message('Скачивание копии до последней загрузки начато. Для восстановления выберите её через «Загрузить заметки».');
      } catch (err) { message(errorMessage(err)); }
    });
    importButton.addEventListener('click', () => {
      if (busy) return;
      if (hasDraft()) { message('Сначала сохраните или закройте редактируемую заметку.'); return; }
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file || busy) return;
      busy = true; importButton.disabled = true;
      try {
        if (file.size > MAX_BYTES) fail('Файл слишком большой. Максимальный размер — 5 МБ.');
        if (!/\.json$/i.test(file.name)) fail('Выберите резервную копию с расширением .json.');
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reader.onabort = () => reject(new TransferError('Не удалось прочитать файл. Выберите его заново.'));
          reader.readAsText(file, 'UTF-8');
        });
        const notes = parseBackup(text, books);
        const before = snapshot(window.localStorage, getState(), books);
        if (hasDraft()) fail('Сначала сохраните или закройте редактируемую заметку.');
        pending = { notes, before };
        find('#notes-import-summary').textContent = `Файл «${file.name}»: ${notes.length} заметок. На устройстве: ${before.notes.length}.`;
        find('input[name="notes-import-mode"][value="merge"]').checked = true;
        find('#notes-import-error').textContent = '';
        dialog.showModal();
      } catch (err) { pending = null; message(errorMessage(err)); }
      finally { busy = false; importButton.disabled = false; }
    });
    find('#notes-import-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { pending = null; });
    applyButton.addEventListener('click', () => {
      if (!pending || busy) return;
      const mode = find('input[name="notes-import-mode"]:checked').value;
      const warning = mode === 'replace' ?
        `Заменить все текущие заметки (${pending.before.notes.length}) заметками из файла (${pending.notes.length})? ${pending.notes.length === 0 ? 'Список заметок станет пустым. ' : ''}` :
        'Объединить заметки? Разные версии одной заметки будут сохранены отдельно. ';
      if (!window.confirm(warning + 'Перед загрузкой будет создана резервная копия текущих заметок на этом устройстве.')) return;
      busy = true; applyButton.disabled = true;
      try {
        const result = importNotes(window.localStorage, pending.before, pending.notes, mode, books);
        // Update the reader only after the persistent write succeeds. No reload
        // is needed, and bookmarks, reading progress and preferences stay intact.
        Object.assign(getState(), result.state);
        dialog.close();
        refresh();
        message(`Заметки загружены. Всего: ${Object.keys(result.state.notes).length}. Разных версий сохранено отдельно: ${result.conflicts}. Копия до загрузки доступна рядом.`);
      } catch (err) { find('#notes-import-error').textContent = errorMessage(err); }
      finally { busy = false; applyButton.disabled = false; recoveryAvailable(); }
    });
    recoveryAvailable();
  }
  return { STORAGE_KEY, BACKUP_KEY, MAX_BYTES, parseBackup, serializeBackup, mergeNotes, snapshot, importNotes, setup };
});
