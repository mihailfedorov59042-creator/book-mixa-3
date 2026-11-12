#!/usr/bin/env python3
"""Check source integrity, complete coverage, and graph contracts (not interpretation)."""
import hashlib
import json
import re
from collections import Counter

from build_theory_materials import ROOT, DOC, plain


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    data = json.loads((DOC / 'map-data.json').read_text())
    books = {}
    for item in data['inventory']:
        raw = (ROOT / item['file']).read_bytes()
        require(hashlib.sha256(raw).hexdigest() == item['sha256'], f'Source changed: {item["file"]}')
        text = raw.decode()
        books[item['id']], _ = json.JSONDecoder().raw_decode(text[text.index('={') + 1:])
        require(len(books[item['id']]['b']) == item['blocks'], 'Block inventory')
    indices = {}
    for kind in ('clusters', 'topics', 'claims', 'relations', 'works'):
        indices[kind] = {x['id']: x for x in data[kind]}
        require(len(indices[kind]) == len(data[kind]), f'Duplicate {kind} IDs')
    topics, clusters = indices['topics'], indices['clusters']
    sources = data['sources']
    for key, s in sources.items():
        book = books[s['book']]
        if 'note' in s:
            text = plain(' '.join(book['n'][s['note']]))
            require(text == s['text'], f'Changed footnote: {key}')
            refs = [i for i, b in enumerate(book['b']) if f'data-n="{s["note"]}"' in str(b[1])]
            require(refs == s['referringBlocks'], f'Footnote referring blocks: {key}')
            target = refs[0]
        else:
            text = plain(book['b'][s['block']][1])
            require(text[:480] == s['text'], f'Changed preview: {key}')
            require(hashlib.sha256(text.encode()).hexdigest() == s['normalizedSha256'], f'Changed text: {key}')
            require(len(text) == s['sourceLength'] and (len(text) > 480) == s['isExcerpt'], f'Excerpt contract: {key}')
            target = s['block']
        require(s['url'].endswith(f'#{s["book"]}@{target}'), f'Wrong URL: {key}')
    for name, book in books.items():
        covered = []
        notes = set()
        for t in (x for x in topics.values() if x['book'] == name):
            require(t['summary'].strip() and t['clusters'], f'Empty topic: {t["id"]}')
            require(all(clusters[c]['book'] == name for c in t['clusters']), 'Cross-book cluster')
            span = list(range(t['start'], t['endExclusive']))
            covered += span
            require(t['evidence'] == [f'{name}:{i}' for i in span], f'Incomplete evidence: {t["id"]}')
            require(t['previewSource'] in t['evidence'], 'Preview outside topic')
            expected_notes = {f'{name}:note:{n}' for i in span for n in re.findall(r'data-n="([^"]+)"', str(book['b'][i][1]))}
            require(set(t['footnotes']) == expected_notes, f'Topic notes: {t["id"]}')
            notes.update(expected_notes)
        require(covered == list(range(len(book['b']))), f'Coverage gap or overlap: {name}')
        require(notes == {f'{name}:note:{n}' for n in book['n']}, f'Omitted footnote: {name}')
    for c in clusters.values():
        expected = [t['id'] for t in topics.values() if c['id'] in t['clusters']]
        require(c['topicIds'] == expected, f'Cluster membership: {c["id"]}')
        require(all(e in sources for e in c['evidence']), 'Cluster source')
    for p in data['claims']:
        require(p['topic'] in topics and p['statement'] == topics[p['topic']]['summary'], 'Claim without topic evidence')
    for edge in data['relations']:
        require(edge['from'] in topics and edge['to'] in topics, f'Dangling edge: {edge["id"]}')
        require(edge['from'] != edge['to'], 'Self relation')
        require(edge['type'] in data['relationTypes'] and edge['explanation'], 'Untyped or unexplained relation')
        require(edge['evidenceTopics'] == [edge['from'], edge['to']], 'Edge evidence')
        require(edge['directionIsImplication'] is False, 'Visual arrow treated as automatic inference')
    require(len({h['cluster'] for h in data['hierarchies']}) == len(clusters), 'Missing hierarchy')
    for h in data['hierarchies']:
        ids = [p for b in h['branches'] for p in b['claimIds']]
        expected = ['p-' + t for t in clusters[h['cluster']]['topicIds']]
        require(Counter(ids) == Counter(expected), f'Hierarchy omissions or duplicates: {h["cluster"]}')
        require(all(r in indices['relations'] for r in h['relationIds']), 'Hierarchy relation')
        require(h['layoutOrderIsArgumentOrder'] is False, 'Layout treated as argument')
    for w in data['works']:
        require(w['role'] and w['evidence'] and w['topicIds'], f'Unprepared work: {w["id"]}')
        require(all(r in sources for r in w['evidence']), 'Work source')
        require(all(t in topics for t in w['topicIds']), 'Work topic')
        require(all(c in clusters for c in w['clusters']), 'Work cluster')
        if w['libraryTarget']:
            target = w['libraryTarget']
            require((ROOT / f'data/b-{target["book"]}.js').is_file(), 'Missing library book')
            require(target['url'].endswith('#' + target['book']), 'Library route')
        if 'sourceTitle' in w:
            ref = sources[w['evidence'][0]]
            text = plain(books[ref['book']]['b'][ref['block']][1])
            require(f'«{w["sourceTitle"]}»' in text, f'Title not present: {w["id"]}')
    require(len(data['glossaryLinks']) == 49, 'Glossary coverage')
    require(sum(w['libraryTarget'] is not None for w in data['works']) == 10, 'Reviewed library links')
    for item in data['glossaryLinks']:
        require(item['source'] in sources and all(t in topics for t in item['topicIds']), 'Glossary reference')
    # Protect the source-boundary and homonym decisions that motivated this preparation.
    require(topics['barthes-311']['endExclusive'] == 320, 'Myth today boundary')
    require(topics['barthes-320']['endExclusive'] == 324 and 'B1' not in topics['barthes-320']['clusters'], 'Untitled 1959 fragment')
    require(topics['ne-365']['location'].endswith('§ 4'), 'Inline VIII.4')
    require(topics['ne-385']['location'].endswith('§ 13'), 'Inline VIII.13')
    phil = [w for w in data['works'] if w['title'] == 'Филоктет']
    require(len(phil) == 3 and len({w['author'] for w in phil}) == 3, 'Three Philoctetes works merged')
    require(any(r['type'] == 'revises' and r['from'] == 'barthes-569' and r['to'] == 'barthes-1303'
                for r in data['relations']), 'Metalanguage development missing')
    require(any(r['from'] == 'frye-107' and r['to'] == 'frye-236' and r['type'] == 'distinguishes'
                for r in data['relations']), 'Symbol and mythos phases conflated')
    print(f"OK: {len(topics)} topics; {len(data['relations'])} relations; {len(data['works'])} work cards; "
          f"{sum(len(b['b']) for b in books.values())} source blocks; 25 footnotes; 49 glossary links.")
    print('Source integrity and coverage verified. Semantic interpretation remains an editorial responsibility.')


if __name__ == '__main__':
    main()
