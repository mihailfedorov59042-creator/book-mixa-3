/* Extended search index & matching engine for Polka (books, chapters, characters, full-text helpers). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PolkaSearch = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SLOW = /[\u00ad\u00c0-\u024f\u0300-\u036f\u0370-\u03ff\u1e00-\u1fff]/;
  const HEADING_TYPES = new Set(['h1', 'act', 'h2', 'scene', 'h3', 'date']);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function decodeEnt(s) {
    return String(s == null ? '' : s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&amp;/g, '&');
  }

  function cleanHeading(html) {
    return decodeEnt(
      String(html == null ? '' : html)
        .replace(/<a class="ed-ref"[^>]*><sup>\*<\/sup><\/a>/g, '')
        .replace(/<a class="nr"[^>]*>.*?<\/a>/g, '')
        .replace(/<[^>]+>/g, '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normMap(s) {
    const str = String(s == null ? '' : s).replace(/\u00a0/g, ' ');
    if (!SLOW.test(str)) {
      return { t: str.toLowerCase().replace(/ё/g, 'е'), m: null };
    }
    let t = '';
    const m = [];
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === 'й' || c === 'Й') {
        t += 'й';
        m.push(i);
        continue;
      }
      if (c === '\u00ad') continue;
      const d = c.normalize('NFD').toLowerCase();
      for (const x of d) {
        const k = x.charCodeAt(0);
        if (k >= 0x300 && k <= 0x36f) continue;
        t += x === 'ё' ? 'е' : x;
        m.push(i);
      }
    }
    return { t, m };
  }

  function normQ(q) {
    return normMap(String(q == null ? '' : q).replace(/\s+/g, ' ').trim()).t;
  }

  function tokenize(nq) {
    if (!nq) return [];
    const seen = new Set();
    const out = [];
    for (const part of nq.split(' ')) {
      if (part && !seen.has(part)) {
        seen.add(part);
        out.push(part);
      }
    }
    return out;
  }

  function highlightText(raw, query) {
    const text = String(raw == null ? '' : raw);
    const nq = normQ(query);
    if (!nq || !text) return esc(text);

    const nm = normMap(text);
    const terms = tokenize(nq);
    const needles = terms.length > 1 ? [nq, ...terms] : [nq];
    const ranges = [];

    for (const needle of needles) {
      if (!needle) continue;
      let p = nm.t.indexOf(needle);
      while (p >= 0) {
        const a = nm.m ? nm.m[p] : p;
        const lastIdx = p + needle.length - 1;
        const z = (nm.m ? (lastIdx < nm.m.length ? nm.m[lastIdx] : text.length - 1) : lastIdx) + 1;
        if (z > a) ranges.push([a, z]);
        p = nm.t.indexOf(needle, p + Math.max(1, needle.length));
      }
    }

    if (!ranges.length) return esc(text);
    ranges.sort((x, y) => x[0] - y[0] || y[1] - x[1]);

    const merged = [ranges[0].slice()];
    for (let i = 1; i < ranges.length; i++) {
      const prev = merged[merged.length - 1];
      const cur = ranges[i];
      if (cur[0] <= prev[1]) {
        if (cur[1] > prev[1]) prev[1] = cur[1];
      } else {
        merged.push(cur.slice());
      }
    }

    let html = '';
    let pos = 0;
    for (const [a, z] of merged) {
      if (a > pos) html += esc(text.slice(pos, a));
      html += '<mark>' + esc(text.slice(a, z)) + '</mark>';
      pos = z;
    }
    if (pos < text.length) html += esc(text.slice(pos));
    return html;
  }

  function isWordStart(str, idx) {
    if (idx === 0) return true;
    const prev = str[idx - 1];
    return /[\s«"„('—–\-·.,:;!?/]/.test(prev);
  }

  function scoreMatch(primaryNorm, secondaryNorm, nq, terms, ownNorm) {
    if (!nq) return 0;
    const combined = secondaryNorm ? primaryNorm + ' ' + secondaryNorm : primaryNorm;
    for (const term of terms) {
      if (!combined.includes(term)) return 0;
    }

    if (ownNorm != null) {
      let ownHit = false;
      for (const term of terms) {
        if (ownNorm.includes(term)) {
          ownHit = true;
          break;
        }
      }
      if (!ownHit) return 0;
    }

    if (primaryNorm === nq) return 1000;
    if (primaryNorm.startsWith(nq)) return 850;

    const pIdx = primaryNorm.indexOf(nq);
    if (pIdx >= 0) {
      return isWordStart(primaryNorm, pIdx) ? 740 : 620;
    }

    if (terms.length > 1 && terms.every((t) => primaryNorm.includes(t))) {
      const allWordStart = terms.every((t) => {
        const idx = primaryNorm.indexOf(t);
        return idx >= 0 && isWordStart(primaryNorm, idx);
      });
      return allWordStart ? 560 : 480;
    }

    const sIdx = secondaryNorm ? secondaryNorm.indexOf(nq) : -1;
    if (sIdx >= 0) {
      return isWordStart(secondaryNorm, sIdx) ? 380 : 300;
    }

    let primaryHits = 0;
    for (const t of terms) {
      if (primaryNorm.includes(t)) primaryHits++;
    }
    return 180 + primaryHits * 40;
  }

  function buildBookIndex(ids, meta, books) {
    const out = [];
    for (let order = 0; order < ids.length; order++) {
      const id = ids[order];
      const m = meta && meta[id];
      if (!m || (books && !books[id])) continue;

      const title = m.title || m.short || id;
      const shortTitle = m.short || title;
      const sub = m.sub || '';
      const author = m.author || '';
      const orig = m.orig || '';
      const genre = m.genre || '';
      const year = m.year || '';
      const top = m.top || '';

      const primary = [title, shortTitle !== title ? shortTitle : '', sub].filter(Boolean).join(' ');
      const secondary = [author, orig, genre, year, top].filter(Boolean).join(' ');

      out.push({
        id,
        order,
        title,
        short: shortTitle,
        sub,
        author,
        orig,
        genre,
        year,
        primaryNorm: normMap(primary).t,
        secondaryNorm: normMap(secondary).t,
        ownNorm: null,
      });
    }
    return out;
  }

  function buildCharIndex(ids, meta, books) {
    const out = [];
    for (let order = 0; order < ids.length; order++) {
      const bookId = ids[order];
      const bk = books && books[bookId];
      const m = meta && meta[bookId];
      if (!bk || !m || !Array.isArray(bk.c) || !bk.c.length) continue;

      const bookTitle = m.title || m.short || bookId;
      const bookShort = m.short || bookTitle;
      const author = m.author || '';

      for (let ci = 0; ci < bk.c.length; ci++) {
        const c = bk.c[ci];
        if (!c || !c.name) continue;
        const name = String(c.name).trim();
        const role = String(c.role || '').trim();
        const intro = String(c.intro || '').trim();
        const gen = c.gen ? String(c.gen).trim() : '';

        const primary = [name, gen && gen !== name ? gen : ''].filter(Boolean).join(' ');
        const ownMeta = [primary, role, intro].filter(Boolean).join(' ');
        const secondary = [role, intro, bookTitle, bookShort !== bookTitle ? bookShort : '', author]
          .filter(Boolean)
          .join(' ');

        out.push({
          cid: c.id,
          bookId,
          order,
          charOrder: ci,
          name,
          role,
          intro,
          bookTitle,
          bookShort,
          author,
          stagesCount: Array.isArray(c.st) ? c.st.length : 0,
          primaryNorm: normMap(primary).t,
          secondaryNorm: normMap(secondary).t,
          ownNorm: normMap(ownMeta).t,
        });
      }
    }
    return out;
  }

  function chapterKindLabel(type, title) {
    if (type === 'act') return 'Действие';
    if (type === 'scene') return 'Явление';
    if (type === 'date') return 'Письмо';
    if (/^(песнь|глава|книга|часть|пролог|эпилог|введение)\b/i.test(title)) return 'Глава';
    return type === 'h1' ? 'Раздел' : 'Подраздел';
  }

  function buildChapterIndex(ids, meta, books) {
    const out = [];
    for (let order = 0; order < ids.length; order++) {
      const bookId = ids[order];
      const bk = books && books[bookId];
      const m = meta && meta[bookId];
      if (!bk || !m || !Array.isArray(bk.b)) continue;

      const B = bk.b;
      const mainEnd = bk.mainEnd || B.length;
      const bookTitle = m.title || m.short || bookId;
      const bookShort = m.short || bookTitle;
      const author = m.author || '';

      let curH1 = '';
      let curAct = '';

      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (!b || !HEADING_TYPES.has(b[0])) continue;
        const type = b[0];
        const title = cleanHeading(b[1]);
        if (!title) continue;

        let parent = '';
        if (type === 'h1') {
          curH1 = title;
          curAct = '';
        } else if (type === 'act') {
          curAct = title;
          parent = curH1 && curH1 !== title ? curH1 : '';
        } else if (type === 'scene') {
          parent = curAct || curH1;
        } else if (type === 'h2') {
          parent = curAct || (curH1 && curH1 !== title ? curH1 : '');
        } else if (type === 'h3') {
          parent = curAct || curH1;
        } else if (type === 'date') {
          parent = curAct || curH1;
        }

        const cast = type === 'scene' && B[i + 1] && B[i + 1][0] === 'cast' ? cleanHeading(B[i + 1][1]) : '';
        const side = i >= mainEnd && !/коммент|примеч|стать|прилож/i.test(title + ' ' + parent);
        const primary = title;
        const ownHeading = [title, cast].filter(Boolean).join(' ');
        const secondary = [parent, cast, bookTitle, bookShort !== bookTitle ? bookShort : '', author]
          .filter(Boolean)
          .join(' ');

        out.push({
          bookId,
          i,
          type,
          kind: chapterKindLabel(type, title),
          order,
          title,
          parent,
          cast,
          side,
          bookTitle,
          bookShort,
          author,
          primaryNorm: normMap(primary).t,
          secondaryNorm: normMap(secondary).t,
          ownNorm: normMap(ownHeading).t,
        });
      }
    }
    return out;
  }

  function runIndexedSearch(items, query, opts) {
    const options = opts || {};
    const nq = normQ(query);
    if (nq.length < 2) return { hits: [], total: 0 };

    const terms = tokenize(nq);
    const bookId = options.bookId || null;
    const cap = typeof options.cap === 'number' ? options.cap : 300;
    const matched = [];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (bookId && (item.bookId || item.id) !== bookId) continue;
      const score = scoreMatch(item.primaryNorm, item.secondaryNorm, nq, terms, item.ownNorm);
      if (score > 0) {
        matched.push({ item, score });
      }
    }

    matched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.order !== b.item.order) return a.item.order - b.item.order;
      const ai = a.item.i != null ? a.item.i : a.item.charOrder || 0;
      const bi = b.item.i != null ? b.item.i : b.item.charOrder || 0;
      return ai - bi;
    });

    return {
      total: matched.length,
      hits: matched.slice(0, cap).map((x) => x.item),
    };
  }

  function searchBooks(index, query, opts) {
    return runIndexedSearch(index, query, opts);
  }

  function searchChars(index, query, opts) {
    return runIndexedSearch(index, query, opts);
  }

  function searchChapters(index, query, opts) {
    return runIndexedSearch(index, query, opts);
  }

  return {
    esc,
    decodeEnt,
    cleanHeading,
    normMap,
    normQ,
    tokenize,
    highlightText,
    scoreMatch,
    buildBookIndex,
    buildCharIndex,
    buildChapterIndex,
    searchBooks,
    searchChars,
    searchChapters,
  };
});
