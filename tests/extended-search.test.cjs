const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../extended-search.js');

const sampleMeta = {
  onegin: {
    title: 'Евгений Онегин',
    short: 'Евгений Онегин',
    sub: 'Роман в стихах',
    author: 'Александр Сергеевич Пушкин',
    year: '1978',
    genre: 'роман в стихах',
  },
  iliad: {
    title: 'Илиада',
    short: 'Илиада',
    author: 'Гомер',
    orig: 'Древнегреческий эпос',
    year: '1978',
    genre: 'поэма',
  },
  werther: {
    title: 'Страдания юного Вертера',
    short: 'Вертер',
    author: 'Иоганн Вольфганг Гёте',
    orig: 'Die Leiden des jungen Werthers',
    year: '1774',
    genre: 'роман в письмах',
  },
};

const sampleBooks = {
  onegin: {
    mainEnd: 10,
    b: [
      ['h1', 'Глава первая<a class="nr" href="#n-1">1</a>'],
      ['p', 'Мой дядя самых честных правил...'],
      ['h2', 'Письмо Татьяны к Онегину'],
      ['h1', 'Глава вторая'],
      ['h1', 'Примечания'],
    ],
    c: [
      { id: 'onegin', name: 'Евгений Онегин', role: 'Молодой петербургский дворянин', intro: 'Главный герой романа.', st: [{ i: 1 }, { i: 3 }] },
      { id: 'tatyana', name: 'Татьяна Ларина', role: 'Старшая дочь Лариных', intro: 'Влюблена в Онегина.', st: [{ i: 2 }] },
    ],
  },
  iliad: {
    mainEnd: 5,
    b: [
      ['h1', 'Песнь первая'],
      ['h1', 'Песнь шестая'],
    ],
    c: [
      { id: 'achilles', name: 'Ахиллес', role: 'Сын Пелея, герой ахейцев', intro: 'Гнев Ахиллеса.', st: [{ i: 0 }] },
      { id: 'hector', name: 'Гектор', role: 'Защитник Трои, сын Приама', intro: 'Главный герой Трои.', st: [{ i: 1 }] },
    ],
  },
  werther: {
    mainEnd: 5,
    b: [
      ['act', 'Книга первая'],
      ['date', '4 мая 1771 года.'],
      ['date', '16 июня.'],
    ],
    c: [
      { id: 'werther', name: 'Вертер', role: 'Молодой мечтатель и художник', intro: 'Автор писем.', st: [{ i: 1 }] },
    ],
  },
};

const ids = ['onegin', 'iliad', 'werther'];

test('normalization handles case, ё→е, accents and whitespace', () => {
  assert.equal(S.normQ('  Гёте   Вертер  '), 'гете вертер');
  assert.equal(S.normQ('Phèdre'), 'phedre');
  assert.equal(S.normQ('Евге́ний'), 'евгений');
  assert.equal(S.normQ('Йошкар'), 'йошкар');
});

test('highlightText marks matching spans accurately with ё/е and escapes HTML', () => {
  assert.equal(S.highlightText('Иоганн Гёте', 'гете'), 'Иоганн <mark>Гёте</mark>');
  assert.equal(S.highlightText('<script> & Онегин', 'онег'), '&lt;script&gt; &amp; <mark>Онег</mark>ин');
  assert.equal(S.highlightText('Евгений Онегин', 'пушкин онегин'), 'Евгений <mark>Онегин</mark>');
});

test('searchBooks finds by title, author, original title and ranks exact/prefix matches first', () => {
  const idx = S.buildBookIndex(ids, sampleMeta, sampleBooks);

  const byTitle = S.searchBooks(idx, 'илиад');
  assert.equal(byTitle.total, 1);
  assert.equal(byTitle.hits[0].id, 'iliad');

  const byAuthorYo = S.searchBooks(idx, 'гете');
  assert.equal(byAuthorYo.total, 1);
  assert.equal(byAuthorYo.hits[0].id, 'werther');

  const byMultiWord = S.searchBooks(idx, 'пушкин онегин');
  assert.equal(byMultiWord.total, 1);
  assert.equal(byMultiWord.hits[0].id, 'onegin');

  const byOrig = S.searchBooks(idx, 'Werthers');
  assert.equal(byOrig.total, 1);
  assert.equal(byOrig.hits[0].id, 'werther');
});

test('searchChars finds characters across all books and supports single-book scoping', () => {
  const idx = S.buildCharIndex(ids, sampleMeta, sampleBooks);

  const tatyana = S.searchChars(idx, 'Татьяна');
  assert.equal(tatyana.total, 1);
  assert.equal(tatyana.hits[0].cid, 'tatyana');
  assert.equal(tatyana.hits[0].bookId, 'onegin');

  const troy = S.searchChars(idx, 'Трои');
  assert.equal(tatyana.hits[0].name, 'Татьяна Ларина');
  assert.equal(troy.total, 1);
  assert.equal(troy.hits[0].cid, 'hector');

  // Name match ("Евгений Онегин") outranks intro mention ("Влюблена в Онегина")
  const onegin = S.searchChars(idx, 'Онегин');
  assert.equal(onegin.total, 2);
  assert.equal(onegin.hits[0].cid, 'onegin');

  // Scoped to iliad should not return Pushkin's characters
  const scoped = S.searchChars(idx, 'Онегин', { bookId: 'iliad' });
  assert.equal(scoped.total, 0);
});

test('searchChapters strips footnote markup, preserves parent context, and finds chapters/letters', () => {
  const idx = S.buildChapterIndex(ids, sampleMeta, sampleBooks);

  const ch1 = S.searchChapters(idx, 'Глава первая');
  assert.equal(ch1.total, 1);
  assert.equal(ch1.hits[0].title, 'Глава первая');
  assert.equal(ch1.hits[0].i, 0);
  assert.equal(ch1.hits[0].bookId, 'onegin');

  const letter = S.searchChapters(idx, 'Письмо Татьяны');
  assert.equal(letter.total, 1);
  assert.equal(letter.hits[0].parent, 'Глава первая');
  assert.equal(letter.hits[0].i, 2);

  const dateHit = S.searchChapters(idx, '4 мая');
  assert.equal(dateHit.total, 1);
  assert.equal(dateHit.hits[0].bookId, 'werther');
  assert.equal(dateHit.hits[0].kind, 'Письмо');
  assert.equal(dateHit.hits[0].parent, 'Книга первая');

  // Book + chapter combined query works
  const bookPlusChap = S.searchChapters(idx, 'Онегин глава вторая');
  assert.equal(bookPlusChap.total, 1);
  assert.equal(bookPlusChap.hits[0].title, 'Глава вторая');

  // Searching only book title does not flood unrelated chapters
  const onlyBookName = S.searchChapters(idx, 'Илиада');
  assert.equal(onlyBookName.total, 0);

  const scoped = S.searchChapters(idx, 'Песнь', { bookId: 'onegin' });
  assert.equal(scoped.total, 0);
});

test('author + character multi-word search works without flooding on author-only query', () => {
  const idx = S.buildCharIndex(ids, sampleMeta, sampleBooks);
  assert.equal(S.searchChars(idx, 'Пушкин').total, 0);
  const combo = S.searchChars(idx, 'Пушкин Татьяна');
  assert.equal(combo.total, 1);
  assert.equal(combo.hits[0].cid, 'tatyana');
});

test('real library data from Pushkin and Homer indexes cleanly and returns expected matches', () => {
  const sandbox = { window: { __BOOKS: {}, __SCH: {}, __PUSHKIN: {}, __BAKHTIN: {} } };
  const root = path.resolve(__dirname, '..');
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data/b-pushkin.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data/b-homer.js'), 'utf8'), sandbox);

  const books = sandbox.window.__BOOKS;
  const meta = {};
  for (const [id, title] of Object.entries(sandbox.window.__PUSHKIN)) {
    meta[id] = { title, short: title, author: 'Александр Сергеевич Пушкин' };
  }
  meta.iliad = { title: 'Илиада', short: 'Илиада', author: 'Гомер' };
  meta.odyssey = { title: 'Одиссея', short: 'Одиссея', author: 'Гомер' };

  const realIds = Object.keys(meta);
  const bookIdx = S.buildBookIndex(realIds, meta, books);
  const charIdx = S.buildCharIndex(realIds, meta, books);
  const chapIdx = S.buildChapterIndex(realIds, meta, books);

  assert.ok(S.searchBooks(bookIdx, 'Борис Годунов').total >= 1);
  assert.ok(S.searchBooks(bookIdx, 'Одиссея').total >= 1);
  assert.ok(S.searchChars(charIdx, 'Ахиллес').total >= 1);
  assert.ok(S.searchChars(charIdx, 'Татьяна').total >= 1);
  assert.ok(S.searchChapters(chapIdx, 'Песнь первая').total >= 1);
  assert.ok(S.searchChapters(chapIdx, 'Глава первая').total >= 1);
});
