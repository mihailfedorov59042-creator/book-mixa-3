// All fixtures below are synthetic. The suite sends no personal notes anywhere.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const transfer = require('../notes-transfer.js');
const root = path.resolve(__dirname, '..');
const note = (changes = {}) => ({ id: 'fixture1', book: 'phedre', b0: 7, s: 0, b1: 7, e: 0,
  quote: '', text: 'Тестовая заметка «Федра» 📖\nВторая строка', label: 'Акт I', pct: .01,
  created: 1000, updated: 2000, ...changes });
const initial = () => ({ notes: { fixture1: note() }, progress: { phedre: { a: 30, r: 45, pct: .2, t: 4000 } },
  last: 'phedre', lastT: 4000, fs: 19, splash: false, read: { gulliver: { t: 3000 } },
  del: [], cm: {}, bookmarks: { phedre: [7, 30] }, ink: { phedre: { t: 1, s: [] } } });
const json = notes => JSON.stringify({ format: 'polka-notes', version: 1,
  exportedAt: '2026-11-06T12:00:00Z', notes });
const books = { phedre: 100000 };
let server, browser, base, previous = false, interruptUpdate = false;
const oldFiles = new Map();
before(async () => {
  for (const name of ['index.html', 'pwa.js', 'pwa.css', 'sw.js']) {
    oldFiles.set(name, execFileSync('git', ['show', '99f7fd9:' + name], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
  }
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const name = pathname.replace(/^\/book-mixa-3\//, '') || 'index.html';
    const file = path.resolve(root, name);
    if (!pathname.startsWith('/book-mixa-3/') || !file.startsWith(root + path.sep)) {
      response.writeHead(404).end(); return;
    }
    if (interruptUpdate && name === 'notes-transfer.js') { response.writeHead(503).end(); return; }
    try {
      const data = previous && oldFiles.has(name) ? oldFiles.get(name) : await readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(name)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data);
    } catch (_) { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/book-mixa-3/`;
  browser = await chromium.launch({ executablePath: process.env.POLKA_CHROMIUM_PATH || undefined,
    headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function contextFor(options, state = initial()) {
  const context = await browser.newContext({ ...options, acceptDownloads: true });
  // Avoid font requests in tests and catch any attempt to initialise cloud APIs.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:)/, route => route.abort());
  await context.addInitScript(({ key, state }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    window.__cloudCalls = 0;
    window.claude = { use() { window.__cloudCalls++; throw new Error('Cloud access must stay disabled'); } };
  }, { key: transfer.STORAGE_KEY, state });
  return context;
}
async function ready(page) {
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), transfer.STORAGE_KEY);
const rawSaved = page => page.evaluate(key => localStorage.getItem(key), transfer.STORAGE_KEY);
async function choose(page, text, filename = 'polka-notes.json') {
  const picker = page.waitForEvent('filechooser');
  await page.locator('[data-notes-import]').click();
  await (await picker).setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(text) });
}
async function apply(page, mode = 'merge', accept = true) {
  await page.locator('#notes-import-dialog[open]').waitFor();
  await page.locator(`input[name="notes-import-mode"][value="${mode}"]`).check();
  page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.locator('#notes-import-apply').click();
}
async function download(page, selector) {
  const waiting = page.waitForEvent('download');
  await page.locator(selector).click();
  const file = await waiting;
  assert.match(file.suggestedFilename(), /^polka-notes-.*\.json$/);
  return readFile(await file.path(), 'utf8');
}

for (const [name, options] of [
  ['Windows Chrome/Edge viewport', { viewport: { width: 1365, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36' }],
  ['Android Chrome touch viewport', devices['Pixel 7']]
]) test(name + ': export/import, confirmation, recovery and offline reading', { timeout: 120000 }, async () => {
  previous = false; interruptUpdate = false;
  const context = await contextFor(options);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page);
    const original = await saved(page);
    const exported = await download(page, '[data-notes-export]');
    assert.deepEqual(transfer.parseBackup(exported, books), [note()]);
    assert.equal(await page.evaluate(() => window.__cloudCalls), 0);
    // Every following file operation must work with the network disconnected.
    await context.setOffline(true);
    const initialRaw = await rawSaved(page);
    await choose(page, '{broken');
    await page.waitForFunction(() => document.querySelector('#notes-transfer-status').textContent.includes('JSON.'));
    assert.equal(await rawSaved(page), initialRaw);
    await choose(page, json([note({ id: 'bad"id' })]));
    await page.waitForFunction(() => document.querySelector('#notes-transfer-status').textContent.includes('идентификатор'));
    assert.equal(await rawSaved(page), initialRaw);
    const incoming = json([note({ text: 'Изменено на другом устройстве' }), note({ id: 'fixture2', text: 'Новая заметка' })]);
    await choose(page, incoming);
    await page.locator('#notes-import-dialog[open]').waitFor();
    await page.locator('#notes-import-cancel').click();
    assert.equal(await rawSaved(page), initialRaw);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), transfer.BACKUP_KEY), null);
    await choose(page, incoming);
    await apply(page, 'replace', false);
    assert.equal(await rawSaved(page), initialRaw);
    await apply(page);
    await page.locator('#notes-import-dialog[open]').waitFor({ state: 'hidden' });
    const merged = await saved(page);
    assert.equal(Object.keys(merged.notes).length, 3);
    assert.equal(merged.notes.fixture1.text, note().text);
    const { notes: ignored1, ...other1 } = original;
    const { notes: ignored2, ...other2 } = merged;
    assert.deepEqual(other2, other1, 'progress, bookmarks, comments and preferences are unchanged');
    await choose(page, incoming);
    await apply(page);
    assert.equal(Object.keys((await saved(page)).notes).length, 3);
    await page.reload();
    await page.locator('[data-notes-backup]:visible').waitFor();
    assert.equal(transfer.parseBackup(await download(page, '[data-notes-export]'), books).length, 3);
    await choose(page, json([note({ id: 'replacement', text: 'Замена' })]));
    await apply(page, 'replace');
    assert.deepEqual(Object.keys((await saved(page)).notes), ['replacement']);
    const recovery = await download(page, '[data-notes-backup]');
    assert.equal(transfer.parseBackup(recovery, books).length, 3);
    await choose(page, recovery);
    await apply(page, 'replace');
    assert.equal(Object.keys((await saved(page)).notes).length, 3);
    // Malformed or unreadable storage must not silently erase existing notes.
    await choose(page, exported);
    await page.evaluate(key => {
      const setItem = Storage.prototype.setItem;
      window.__restoreStorage = () => { Storage.prototype.setItem = setItem; };
      Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return setItem.call(this, k, v); };
    }, transfer.BACKUP_KEY);
    const beforeQuota = await rawSaved(page);
    await apply(page);
    await page.waitForFunction(() => document.querySelector('#notes-import-error').textContent.includes('резервную копию'));
    assert.equal(await rawSaved(page), beforeQuota);
    await page.evaluate(() => window.__restoreStorage());
    await page.locator('#notes-import-cancel').click();
    await page.locator('[data-go="notes"]').first().click();
    await page.locator('#nlist .ncard').first().waitFor();
    assert.equal(await page.locator('#nlist .ncard').count(), 3);
    await page.locator('[data-na="open"]').first().click();
    await page.locator('#book .page').first().waitFor({ state: 'attached' });
    await page.locator('#btn-bnotes').click();
    await page.locator('#bn-list .bn-item').first().waitFor();
    assert.equal(await page.locator('#bn-list .bn-item').count(), 3);
    assert.equal(await page.evaluate(() => window.__cloudCalls), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('update from the original PWA: interrupted install, confirmation, activation and offline files', { timeout: 120000 }, async () => {
  previous = true;
  const context = await contextFor({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await ready(page);
    assert.equal(await page.locator('[data-notes-export]').count(), 0);
    const originalRaw = await rawSaved(page);
    previous = false; interruptUpdate = true;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      window.__failedInstall = new Promise(resolve => reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(true); });
      }, { once: true }));
      await reg.update();
      await window.__failedInstall;
    });
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.locator('[data-notes-export]').count(), 0);
    assert.equal(await rawSaved(page), originalRaw);
    interruptUpdate = false;
    await context.setOffline(false);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await page.locator('[data-notes-export]').waitFor();
    assert.equal(await rawSaved(page), originalRaw);
    await context.setOffline(true);
    await page.reload();
    assert.deepEqual(transfer.parseBackup(await download(page, '[data-notes-export]'), books), [note()]);
    await choose(page, json([note({ id: 'afterUpdate' })]));
    await apply(page);
    assert.equal(Object.keys((await saved(page)).notes).length, 2);
    const caches = await page.evaluate(() => window.caches.keys());
    assert.equal(caches.filter(name => name.startsWith('polka-offline-')).length, 1);
  } finally { previous = false; interruptUpdate = false; await context.close(); }
});

test('fresh device imports an exported file without progress or bookmarks from the source device', { timeout: 60000 }, async () => {
  const context = await contextFor({ viewport: { width: 1280, height: 900 } }, { notes: {}, splash: false });
  try {
    const page = await context.newPage();
    await ready(page);
    await context.setOffline(true);
    await choose(page, json([note()]));
    await apply(page);
    const data = await saved(page);
    assert.deepEqual(data.notes.fixture1, note());
    assert.deepEqual(data.progress, {});
    assert.equal(data.bookmarks, undefined);
  } finally { await context.close(); }
});
