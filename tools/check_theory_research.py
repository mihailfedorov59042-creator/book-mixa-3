#!/usr/bin/env python3
"""Validate research references and structural coverage, not interpretations."""
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', str(value)))).strip()


def main():
    data = json.loads((ROOT / 'docs/theory-map/research.json').read_text())
    books = {}
    clusters = {c['id']: c for c in data['clusters']}
    assert len(clusters) == len(data['clusters']), 'Duplicate cluster IDs'
    for item in data['inventory']:
        raw = (ROOT / item['file']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == item['sha256'], item['file']
        text = raw.decode()
        book, _ = json.JSONDecoder().raw_decode(text[text.index('={') + 1:])
        books[item['id']] = book
        assert len(book['b']) == item['blocks']
        assert len(book['n']) == item['notes']
        sections = [s for s in data['sections'] if s['book'] == item['id']]
        visited = []
        for section in sections:
            assert section['start'] < section['endExclusive'] <= len(book['b'])
            assert section['clusters']
            for group in section['clusters']:
                assert clusters[group]['book'] == item['id']
            visited.extend(range(section['start'], section['endExclusive']))
        assert visited == list(range(len(book['b']))), 'Sections omit or duplicate blocks'
        for i in visited:
            assert any(c['book'] == item['id'] and any(a <= i < z for a, z in c['coverageRanges'])
                       for c in clusters.values()), f'No thematic area: {item["id"]}:{i}'
    for key, source in data['sources'].items():
        book = books[source['book']]
        value = (' '.join(book['n'][source['note']]) if 'note' in source
                 else book['b'][source['block']][1])
        assert plain(value).startswith(source['excerpt']), f'Stale excerpt: {key}'
    for group in ('clusters', 'works', 'relationExamples'):
        for item in data[group]:
            assert item['evidence'], f'No evidence: {item["id"]}'
            assert all(r in data['sources'] for r in item['evidence'])
            if group == 'works':
                assert all(g in clusters for g in item['clusters'])
    for note in data['footnotes']:
        book = books[note['book']]
        assert note['text'] == plain(' '.join(book['n'][note['id']]))
        expected = [i for i, b in enumerate(book['b']) if f'data-n="{note["id"]}"' in str(b[1])]
        assert note['blocks'] == expected
    print(f"Research references: {len(data['sources'])}; covered blocks: "
          f"{sum(len(b['b']) for b in books.values())}; footnotes: {len(data['footnotes'])}. OK.")
    print('These checks establish reference integrity and coverage, not semantic correctness.')


if __name__ == '__main__':
    main()
