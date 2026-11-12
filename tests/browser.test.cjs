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
let server, browser, base, previous = false, interruptUpdate = false, previousTheory = false;
const oldFiles = new Map(), oldTheoryFiles = new Map();
before(async () => {
  for (const name of ['index.html', 'pwa.js', 'pwa.css', 'sw.js']) {
    oldFiles.set(name, execFileSync('git', ['show', '99f7fd9:' + name], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
  }
  for (const name of ['index.html','pwa.js','pwa.css','theory-map.js','sw.js']) {
    oldTheoryFiles.set(name,execFileSync('git',['show','c4e6ac0:'+name],{cwd:root,maxBuffer:8*1024*1024}));
  }
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const ssl = pathname.startsWith('/SSL/');
    const name = pathname.replace(ssl ? /^\/SSL\// : /^\/book-mixa-3\//, '') || 'index.html';
    const assetName = ssl && name.startsWith('icons/') ? name.slice(6) : name;
    const file = path.resolve(ssl ? path.join(root,'tests/fixtures/ssl') : root, assetName);
    if ((!ssl && !pathname.startsWith('/book-mixa-3/')) || !file.startsWith(root + path.sep)) {
      response.writeHead(404).end(); return;
    }
    if (interruptUpdate && name === 'notes-transfer.js') { response.writeHead(503).end(); return; }
    try {
      const data = !ssl && previousTheory && oldTheoryFiles.has(name) ? oldTheoryFiles.get(name) : !ssl && previous && oldFiles.has(name) ? oldFiles.get(name) : await readFile(file);
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

test('Two installed-app identities on one origin stay separate, including offline caches and stored data', {timeout:90000},async()=>{
 const context=await contextFor({viewport:{width:1280,height:900}});
 try {
  const polka=await context.newPage();await ready(polka);
  const ssl=await context.newPage();await ssl.goto(base.replace('/book-mixa-3/','/SSL/'));
  await ssl.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await ssl.reload();
  const polkaSession=await context.newCDPSession(polka),sslSession=await context.newCDPSession(ssl);
  const a=await polkaSession.send('Page.getAppManifest'),b=await sslSession.send('Page.getAppManifest');
  const ma=JSON.parse(a.data),mb=JSON.parse(b.data);
  assert.equal(ma.id,'/book-mixa-3/');assert.equal(mb.id,'/SSL/');
  assert.notEqual(new URL(ma.id,base).href,new URL(mb.id,base).href);
  if(a.manifest?.id && b.manifest?.id) assert.notEqual(a.manifest.id,b.manifest.id);
  const scopeA=await polka.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
  const scopeB=await ssl.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
  assert.match(scopeA,/\/book-mixa-3\/sw.js$/);assert.match(scopeB,/\/SSL\/sw.js$/);
  await ssl.evaluate(()=>localStorage.setItem('noun-v2',JSON.stringify({test:'keep-ssl-progress'})));
  const before=await saved(polka);
  // Simulate an existing SSL installation with its old cached identity.
  await ssl.evaluate(async()=>{
   const names=await caches.keys();const cache=await caches.open(names.find(n=>n.startsWith('ssl-study:')));
   const url=new URL('manifest.webmanifest',location.href);
   const old=await (await cache.match(url)).json();old.id='./';
   await cache.put(url,new Response(JSON.stringify(old),{headers:{'Content-Type':'application/manifest+json'}}));
   const reg=await navigator.serviceWorker.register('./sw.js?identity-update',{scope:'./'});
   if(reg.waiting) return;
   await new Promise(resolve=>{
    const watch=()=>{const w=reg.installing;if(!w)return;const check=()=>{if(w.state==='installed'||w.state==='activated')resolve();};w.addEventListener('statechange',check);check();};
    reg.addEventListener('updatefound',watch);watch();
   });
  });
  await context.setOffline(true);await polka.reload();await ssl.reload();
  assert.equal(await ssl.locator('h1').innerText(),'Старославянский язык');
  assert.equal(await polka.locator('.shelf-choice').count(),5);
  assert.deepEqual((await saved(polka)).notes,before.notes);
  assert.equal(await ssl.evaluate(()=>JSON.parse(localStorage.getItem('noun-v2')).test),'keep-ssl-progress');
  const names=await polka.evaluate(()=>caches.keys());
  assert.ok(names.some(n=>n.startsWith('polka-offline-')));
  assert.ok(names.some(n=>n.startsWith('ssl-study:')));
  const cached=await ssl.evaluate(async()=>{
   const names=await caches.keys();const cache=await caches.open(names.find(n=>n.startsWith('ssl-study:')));
   return (await (await cache.match(new URL('manifest.webmanifest',location.href))).json()).id;
  });
  assert.equal(cached,'/SSL/');
 }finally{await context.close();}
});

test('theory SVG maps: fullscreen, four modes, sources and offline use', { timeout: 120000 }, async () => {
  previous = false; interruptUpdate = false;
  const context = await contextFor(devices['Pixel 7'], { notes: {}, splash: false });
  try {
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await ready(page); await context.setOffline(true);
    for (const [id, group] of [['frye','F1'],['ne','A1'],['barthes','B3']]) {
      await page.evaluate(id => { location.hash = id; }, id);
      await page.waitForFunction(id => document.body.dataset.book === id, id);
      await page.locator('.theory-open').click();
      const dialog=page.locator('.tm');await dialog.waitFor({state:'visible'});
      const bounds=await dialog.boundingBox();
      assert.equal(Math.round(bounds.width),page.viewportSize().width);
      assert.equal(Math.round(bounds.height),page.viewportSize().height);
      assert.equal(await dialog.locator('.tm-card').isVisible(),false);
      assert.ok(await dialog.locator('.tm-svg circle.outer').count());
      await dialog.locator('[data-group]').selectOption(group);
      await dialog.locator('[data-mode="topics"]').click();
      assert.ok(await dialog.locator('.tm-svg [data-kind="topic"]').count());
      assert.ok(await dialog.locator('.tm-svg .edge-hit').count());
      await dialog.locator('[data-list]').first().click();
      await dialog.locator('.tm-list button[data-kind="relation"]').first().click();
      assert.ok(await dialog.locator('.tm-card [data-source]').count());
      await dialog.locator('.tm-list [data-list]').click();
      await dialog.locator('[data-mode="works"]').click();
      await dialog.locator('[data-mode="claims"]').click();
      assert.ok(await dialog.locator('.tm-svg .tm-structural').count());
      await dialog.locator('[data-close]').click();
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('theory SVG ink: world coordinates, pan, zoom, eraser, undo and legacy preservation', {timeout:120000}, async()=>{
  previous=false;interruptUpdate=false;
  const context=await contextFor({viewport:{width:1440,height:960}},initial());
  try{
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await ready(page);await context.setOffline(true);
    const legacy=JSON.stringify({'frye:thoughts:overview':[{color:'cin',width:3,points:[[200,200],[1000,1000]]}]});
    await page.evaluate(value=>{localStorage.setItem('polka-theory-ink-v1',value);location.hash='frye';},legacy);
    await page.locator('.theory-open').click();const dialog=page.locator('.tm');await dialog.waitFor({state:'visible'});
    const notesBefore=(await saved(page)).notes;
    const canvas=dialog.locator('.tm-svg');const r=await canvas.boundingBox();
    await dialog.locator('[data-tool="pen"]').click();await dialog.locator('[data-color="cin"]').click();
    await page.mouse.move(r.x+100,r.y+100);await page.mouse.down();await page.mouse.move(r.x+180,r.y+160,{steps:8});await page.mouse.up();
    const key='polka-theory-ink-v2',scene='frye:thoughts:overview';
    const ink=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    assert.equal(ink[scene].length,1);assert.equal(ink[scene][0].color,'cin');
    const points=await dialog.locator('.tm-ink polyline').getAttribute('points');
    await dialog.locator('[data-tool="view"]').click();
    const before=await canvas.getAttribute('viewBox');
    await page.mouse.move(r.x+40,r.y+40);await page.mouse.down();await page.mouse.move(r.x+150,r.y+90,{steps:5});await page.mouse.up();
    assert.notEqual(await canvas.getAttribute('viewBox'),before);
    await dialog.locator('[data-zoom="+"]').click();
    assert.equal(await dialog.locator('.tm-ink polyline').getAttribute('points'),points);
    await page.setViewportSize({width:1000,height:720});
    assert.equal(await dialog.locator('.tm-ink polyline').getAttribute('points'),points);
    await dialog.locator('[data-close]').click();await page.reload();
    await page.locator('.theory-open').click();await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.locator('.tm-ink polyline').getAttribute('points'),points);
    await dialog.locator('[data-mode="topics"]').click();assert.equal(await dialog.locator('.tm-ink polyline').count(),0);
    await dialog.locator('[data-mode="thoughts"]').click();assert.equal(await dialog.locator('.tm-ink polyline').count(),1);
    await dialog.locator('[data-tool="erase"]').click();
    const target=await canvas.evaluate((s,p)=>{const point=new DOMPoint(p[0],p[1]).matrixTransform(s.getScreenCTM());return {x:point.x,y:point.y};},ink[scene][0].points[4]);
    await page.mouse.click(target.x,target.y);
    assert.equal(await dialog.locator('.tm-ink polyline').count(),0);
    await dialog.locator('[data-undo]').click();assert.equal(await dialog.locator('.tm-ink polyline').count(),1);
    page.once('dialog',d=>d.accept());await dialog.locator('[data-clear]').click();
    assert.equal(await dialog.locator('.tm-ink polyline').count(),0);
    await dialog.locator('[data-undo]').click();assert.equal(await dialog.locator('.tm-ink polyline').count(),1);
    assert.deepEqual((await saved(page)).notes,notesBefore);
    assert.equal(await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v1')),legacy);
    await dialog.locator('[data-legacy]').click();
    await page.locator('.theory-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('.theory-dialog .theory-ink polyline').count(),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v1')),legacy);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('theory layout keeps every title inside its circle in all 25 groups', {timeout:120000}, async()=>{
  const data=JSON.parse(await readFile(path.join(root,'data/theory-map.json'),'utf8'));
  const context=await contextFor({viewport:{width:1920,height:1000}},{notes:{},splash:false});
  try{
    const page=await context.newPage();await ready(page);await context.setOffline(true);
    for(const book of ['frye','ne','barthes']){
      await page.evaluate(book=>location.hash=book,book);
      await page.waitForFunction(book=>document.body.dataset.book===book,book);
      await page.locator('.theory-open').click();
      for(const group of data.clusters.filter(g=>g.book===book)){
        await page.locator('.tm [data-group]').selectOption(group.id);
        for(const mode of ['thoughts','topics','works','claims']){
          await page.locator(`.tm [data-mode="${mode}"]`).click();
          const overflow=await page.locator('.tm-svg').evaluate(svg=>[...svg.querySelectorAll('.tm-node')].flatMap(node=>{
            const r=+node.querySelector('circle').getAttribute('r');
            return [...node.querySelectorAll('tspan')].flatMap(line=>{
              const b=line.getBBox();const extent=Math.max(...[b.x,b.x+b.width].flatMap(x=>[b.y,b.y+b.height].map(y=>Math.hypot(x,y))));
              return extent>r-3?[node.getAttribute('aria-label')]:[];
            });
          }));
          assert.deepEqual(overflow,[],`${book}/${group.id}/${mode}: titles must fit circles`);
          const overlaps=await page.locator('.tm-svg').evaluate(svg=>{
            const nodes=[...svg.querySelectorAll('.tm-node')].map(n=>({id:n.dataset.id,r:+n.querySelector('circle').getAttribute('r'),m:n.transform.baseVal.consolidate().matrix}));
            return nodes.flatMap((a,i)=>nodes.slice(i+1).filter(b=>Math.hypot(a.m.e-b.m.e,a.m.f-b.m.f)<a.r+b.r+2).map(b=>[a.id,b.id]));
          });
          assert.deepEqual(overlaps,[],`${book}/${group.id}/${mode}: circles must not overlap`);
        }
      }
      await page.locator('.tm [data-close]').click();
    }
  }finally{await context.close();}
});

test('theory pen and touch: pinch, palm rejection, cancelled strokes and failed saving', {timeout:120000}, async()=>{
  const context=await contextFor(devices['Pixel 7']);
  try{
    const page=await context.newPage();await ready(page);await context.setOffline(true);
    await page.evaluate(()=>location.hash='frye');await page.locator('.theory-open').click();
    const canvas=page.locator('.tm-svg'),r=await canvas.boundingBox();
    const client=await context.newCDPSession(page);
    const touch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});
    const before=await canvas.getAttribute('viewBox');
    await touch('touchStart',[[130,r.y+190],[230,r.y+190]]);
    await touch('touchMove',[[100,r.y+190],[260,r.y+190]]);
    await touch('touchEnd',[]);
    assert.notEqual(await canvas.getAttribute('viewBox'),before);
    assert.equal(await canvas.locator('.tm-ink polyline').count(),0);
    await page.locator('.tm [data-tool="pen"]').click();
    const pen=(type,x,y)=>client.send('Input.dispatchMouseEvent',{type,x,y,pointerType:'pen',button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,force:.7});
    await pen('mousePressed',120,r.y+160);await pen('mouseMoved',150,r.y+190);
    await touch('touchStart',[[270,r.y+200]]);await touch('touchMove',[[280,r.y+210]]);await touch('touchEnd',[]);
    await pen('mouseMoved',170,r.y+210);await pen('mouseReleased',170,r.y+210);
    assert.equal(await canvas.locator('.tm-ink polyline').count(),1);
    const original=await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v2'));
    assert.ok(Object.values(JSON.parse(original)).flat()[0].points.some(p=>p[2]>.6));
    // Browser cancellation must never turn a partial stroke into a saved drawing.
    await canvas.evaluate(s=>s.addEventListener('pointerdown',e=>{window.__testPenID=e.pointerId;},{once:true}));
    await pen('mousePressed',100,r.y+250);await pen('mouseMoved',120,r.y+270);
    await canvas.evaluate(s=>s.dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.__testPenID,pointerType:'pen',bubbles:true})));
    await pen('mouseReleased',120,r.y+270);
    assert.equal(await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v2')),original);
    // A quota failure must keep the last persisted drawing and explain the failure.
    await page.evaluate(()=>{window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='polka-theory-ink-v2')throw new DOMException('quota','QuotaExceededError');return window.__setItem.call(this,k,v);};});
    await pen('mousePressed',100,r.y+280);await pen('mouseMoved',140,r.y+300);await pen('mouseReleased',140,r.y+300);
    assert.equal(await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v2')),original);
    assert.match(await page.locator('.tm [data-status]').textContent(),/Не удалось сохранить/);
  }finally{await context.close();}
});

test('upgrade from the previous theory map preserves old ink and opens it offline', {timeout:120000},async()=>{
  previousTheory=true;
  const context=await contextFor({viewport:{width:1440,height:960}});
  try{
    const page=await context.newPage();
    const oldInk=JSON.stringify({'frye:thoughts:overview':[{color:'az',width:2,points:[[200,200],[1000,1000]]}]});
    await page.addInitScript(ink=>{if(!localStorage.getItem('polka-theory-ink-v1'))localStorage.setItem('polka-theory-ink-v1',ink);},oldInk);
    await ready(page);await page.evaluate(()=>location.hash='frye');
    await page.locator('.theory-open').click();await page.locator('.theory-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('.theory-ink polyline').count(),1);
    await page.keyboard.press('Escape');
    const original=await saved(page);
    previousTheory=false;
    await page.evaluate(async()=>(await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Обновить',exact:true}).click();
    await page.locator('.tm').waitFor({state:'attached'});
    await context.setOffline(true);await page.reload();
    assert.equal(await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v1')),oldInk);
    const after=await saved(page);
    for(const field of ['notes','bookmarks','ink'])assert.deepEqual(after[field],original[field]);
    assert.deepEqual(after.progress.phedre,original.progress.phedre);
    await page.locator('.theory-open').click();await page.locator('.tm').waitFor({state:'visible'});
    await page.locator('.tm [data-legacy]').click();await page.locator('.theory-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('.theory-ink polyline').count(),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('polka-theory-ink-v1')),oldInk);
  }finally{previousTheory=false;await context.close();}
});
