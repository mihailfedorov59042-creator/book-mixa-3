// All fixtures below are synthetic. The suite sends no personal notes anywhere.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
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
const books = { phedre: 100000, barthes: 100000 };
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
async function openSettings(page) {
  if (!await page.locator('#app-settings').count()) return;
  if (!await page.locator('#app-settings').evaluate(el => el.open)) {
    const gear = page.locator('[data-settings-open]:visible');
    if (await gear.count()) await gear.first().click();
    else await page.locator('#btn-aa').click();
  }
}
async function choose(page, text, filename = 'polka-notes.json') {
  await openSettings(page);
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
  await openSettings(page);
  const waiting = page.waitForEvent('download');
  await page.locator(selector).click();
  const file = await waiting;
  assert.match(file.suggestedFilename(), /^polka-notes-.*\.json$/);
  const text = await readFile(await file.path(), 'utf8');
  await page.evaluate(() => document.querySelector('#app-settings')?.close());
  return text;
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
    await openSettings(page);
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
    await page.locator('[data-notes-export]').waitFor({state:'attached'});
    await page.waitForFunction(() => !!window.__BOOKS?.barthes);
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

for (const [name, options] of [
  ['desktop', { viewport: { width: 1365, height: 900 } }],
  ['android', devices['Pixel 7']]
]) test(`Barthes on ${name}: full anthology, navigation, table, notes and offline persistence`, { timeout: 180000 }, async () => {
  const context = await contextFor(options);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const screenshot = async suffix => {
      if (!process.env.POLKA_SCREENSHOT_DIR) return;
      await mkdir(process.env.POLKA_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.POLKA_SCREENSHOT_DIR, `barthes-${name}-${suffix}.png`) });
    };
    await ready(page);
    const original = await saved(page);
    await page.locator('[data-go="shelf/theory"]').click();
    const card = page.locator('#theory-slot [data-go="barthes"]');
    await card.waitFor();
    assert.equal(await card.count(), 1);
    await card.scrollIntoViewIfNeeded();
    await screenshot('shelf');
    await context.setOffline(true);
    await card.click();
    await page.locator('#book .page').first().waitFor({ state: 'attached' });
    assert.ok(await page.locator('#book .page').count() > 50);
    assert.equal(await page.locator('#toc-list .toc-i').count(), 36);
    await screenshot('title');
    await page.locator('#btn-toc').click();
    await page.locator('#toc-list .toc-i').filter({ hasText: 'Смерть автора' }).click();
    const visibleText = await page.locator('#book .page:not([hidden])').allTextContents();
    assert.ok(visibleText.join('\n').includes('Смерть автора'));
    await page.locator('#btn-search').click();
    await page.locator('#sr-q').fill('рождение читателя');
    await page.locator('#sr-list .sr-hit').first().waitFor();
    await page.locator('#sr-list .sr-hit').first().click();
    await page.locator('#btn-pnote').click();
    await page.locator('#ed-text').fill('Синтетическая заметка к Барту');
    await page.locator('#ed-save').click();
    const annotated = await saved(page);
    assert.equal(Object.values(annotated.notes).filter(n => n.book === 'barthes').length, 1);
    assert.deepEqual(annotated.progress.phedre, original.progress.phedre);
    assert.deepEqual(annotated.bookmarks, original.bookmarks);
    assert.deepEqual(annotated.notes.fixture1, original.notes.fixture1);
    const tableIndex = await page.evaluate(() => window.__BOOKS.barthes.b.findIndex(b => b[0] === 'table'));
    await page.evaluate(i => { location.hash = 'barthes@' + i; }, tableIndex);
    const table = page.locator(`#book [data-i="${tableIndex}"] table:visible`);
    await table.waitFor();
    assert.equal(await table.locator('tr').count(), 3);
    const fits = await table.evaluate(el => {
      const r = el.getBoundingClientRect(), body = el.closest('.pg-body').getBoundingClientRect();
      return r.left >= body.left - 1 && r.right <= body.right + 1;
    });
    assert.equal(fits, true, 'the original diagram must fit the reader column');
    await screenshot('table');
    await page.evaluate(() => { location.hash = ''; });
    const exported = await download(page, '[data-notes-export]');
    assert.equal(transfer.parseBackup(exported, books).filter(n => n.book === 'barthes').length, 1);
    await choose(page, exported);
    await apply(page);
    assert.equal(Object.keys((await saved(page)).notes).length, 2);
    await page.reload();
    const restored = await saved(page);
    assert.equal(Object.values(restored.notes).filter(n => n.book === 'barthes').length, 1);
    assert.ok(restored.progress.barthes.a > 0);
    assert.deepEqual(restored.progress.phedre, original.progress.phedre);
    assert.equal(await page.evaluate(() => window.__cloudCalls), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [name, options] of [
  ['desktop', {viewport:{width:1365,height:900}}],
  ['android', devices['Pixel 7']]
]) test(`Shelf selection and settings on ${name}: routes, history, keyboard and offline use`, {timeout:120000}, async () => {
  const context = await contextFor(options);
  try {
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await ready(page);
    const before=await saved(page);
    assert.equal(await page.locator('.shelf-choice').count(),5);
    assert.equal(await page.locator('#home .book').count(),0);
    assert.equal(await page.locator('#home [data-notes-export]').count(),0);
    await context.setOffline(true);
    for(const [id,slot] of [['classic','classic-slot'],['gozzi','gz-slot'],['xx','xx-slot'],['euripides','eur-slot'],['theory','theory-slot']]) {
      await page.locator(`[data-go="shelf/${id}"]`).click();
      await page.waitForURL(`**/#shelf/${id}`);
      await page.locator('#'+slot).waitFor();
      assert.equal(await page.locator('#shelf-picker').isVisible(),false);
      assert.equal(await page.locator('#'+slot).isVisible(),true);
      assert.equal(await page.locator('#home .shelf-choice').count(),0);
      await page.reload();
      assert.equal(await page.locator('#'+slot).isVisible(),true);
      await page.locator('#shelf-navigation [data-go="home"]').click();
      await page.locator('.shelf-choice').first().waitFor();
    }
    await page.locator('[data-go="shelf/theory"]').click();
    await page.locator('#theory-slot [data-go="barthes"]').click();
    await page.locator('#book .page').first().waitFor({state:'attached'});
    await page.locator('#btn-aa').click();
    assert.equal(await page.locator('#app-settings').isVisible(),true);
    assert.equal(await page.locator('#aa-panel').isVisible(),true);
    await page.locator('#fs-inc').click();
    assert.equal((await saved(page)).fs,before.fs+1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#app-settings').isVisible(),false);
    await page.locator('#reader [data-go="home"]').click();
    await page.waitForURL('**/#shelf/theory');
    await page.goBack();
    await page.waitForURL('**/#barthes');
    await page.goForward();
    await page.waitForURL('**/#shelf/theory');
    await openSettings(page);
    await page.locator('[data-splash-tog]').click();
    assert.equal((await saved(page)).splash,true);
    await page.locator('[data-splash-tog]').click();
    await page.locator('[data-settings-close]').click();
    assert.deepEqual((await saved(page)).notes,before.notes);
    assert.deepEqual((await saved(page)).progress.phedre,before.progress.phedre);
    assert.deepEqual(errors,[]);
    if(process.env.POLKA_SCREENSHOT_DIR) {
      await page.locator('#shelf-navigation [data-go="home"]').click();
      await mkdir(process.env.POLKA_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.POLKA_SCREENSHOT_DIR,`shelves-${name}.png`)});
      await openSettings(page);
      await page.screenshot({path:path.join(process.env.POLKA_SCREENSHOT_DIR,`settings-${name}.png`)});
    }
  } finally { await context.close(); }
});

test('Remembered export folder: actual filesystem writes, reload, revoked permission and reset', {timeout:90000}, async () => {
  const context=await contextFor({viewport:{width:1280,height:900}});
  await context.addInitScript(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('polka-test-exports',{create:true});
  });
  try {
    const page=await context.newPage(); await ready(page); await context.setOffline(true);
    const original=await saved(page);
    await openSettings(page);
    await page.locator('#notes-folder-choose').click();
    await page.waitForFunction(()=>document.querySelector('#notes-folder-status').textContent.includes('polka-test-exports'));
    await page.locator('[data-notes-export]').click();
    await page.waitForFunction(()=>document.querySelector('#notes-transfer-status').textContent.includes('JSON-копия сохранена'));
    const files=await page.evaluate(async()=>{
      const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('polka-test-exports');
      const result=[];for await(const [name,handle] of dir.entries()) result.push({name,text:await (await handle.getFile()).text()});return result;
    });
    assert.equal(files.length,1);assert.deepEqual(transfer.parseBackup(files[0].text,books),[note()]);
    await page.reload();await openSettings(page);
    await page.waitForFunction(()=>document.querySelector('#notes-folder-status').textContent.includes('polka-test-exports'));
    await page.evaluate(()=>{FileSystemDirectoryHandle.prototype.queryPermission=async()=> 'denied';});
    await page.locator('[data-notes-export]').click();
    await page.waitForFunction(()=>document.querySelector('#notes-transfer-status').textContent.includes('Доступ к папке не разрешён'));
    assert.deepEqual((await saved(page)).notes,original.notes);
    await page.reload();await openSettings(page);
    await page.waitForFunction(()=>document.querySelector('#notes-folder-status').textContent.includes('polka-test-exports'));
    await page.evaluate(()=>{FileSystemDirectoryHandle.prototype.getFileHandle=async()=>{throw new DOMException('full','QuotaExceededError');};});
    await page.locator('[data-notes-export]').click();
    await page.waitForFunction(()=>document.querySelector('#notes-transfer-status').textContent.includes('Не удалось записать JSON'));
    assert.deepEqual((await saved(page)).notes,original.notes);
    await page.locator('#notes-folder-reset').click();
    await page.waitForFunction(()=>document.querySelector('#notes-folder-reset').hidden);
    assert.deepEqual(transfer.parseBackup(await download(page,'[data-notes-export]'),books),[note()]);
    await page.reload();await openSettings(page);
    assert.equal(await page.locator('#notes-folder-reset').isVisible(),false);
  }finally{await context.close();}
});

test('Unsupported folder selection keeps ordinary JSON downloads available', {timeout:60000},async()=>{
  const context=await contextFor(devices['Pixel 7']);
  await context.addInitScript(()=>{window.showDirectoryPicker=undefined;});
  try{
    const page=await context.newPage();await ready(page);await context.setOffline(true);await openSettings(page);
    assert.equal(await page.locator('#notes-folder-choose').isVisible(),false);
    assert.match(await page.locator('#notes-folder-status').innerText(),/не поддерживает закрепление/);
    assert.deepEqual(transfer.parseBackup(await download(page,'[data-notes-export]'),books),[note()]);
  }finally{await context.close();}
});
