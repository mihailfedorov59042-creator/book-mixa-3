"""Build the offline theory maps, resolving editorial citations in the actual reader blocks."""
import argparse
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'


def normalize(text):
    text = re.sub(r'<a\b[^>]*class="nr"[^>]*>.*?</a>', '', text)
    text = html.unescape(re.sub(r'<[^>]+>', '', text)).replace('\xad', '')
    return ' '.join(text.split())


def load_readers():
    files = sorted(DATA.glob('b-bakhtin*.js'))
    if not files:
        raise ValueError('Import the Bakhtin books before building the maps')
    # Load the same scripts as the reader, including the metadata declarations.
    js = """global.window={__BOOKS:{},__BAKHTIN:{},__IMG:{}};
    process.argv.slice(1).forEach(f=>require(f));
    process.stdout.write(JSON.stringify([window.__BOOKS,window.__BAKHTIN]));"""
    return json.loads(subprocess.check_output(['node', '-e', js, *files]))


def compile_maps(books, manuscripts):
    result = {key: [] for key in ('clusters', 'topics', 'claims', 'relations', 'works', 'hierarchies')}
    sources = result['sources'] = {}
    for book, clusters in manuscripts.items():
        rows = [normalize(row[1]) if isinstance(row[1], str) else '' for row in books[book]['b']]

        def cite(quote):
            needle = normalize(quote)
            matches = [i for i, text in enumerate(rows) if needle and needle in text]
            if len(matches) != 1:
                raise ValueError(f'{book}: {len(matches)} matches for {quote!r}')
            block = matches[0]
            key = f'{book}:{block}'
            url = f'#{book}@{block}'
            sources.setdefault(key, dict(book=book, block=block, url=url, excerpt=needle))
            return key, url

        for i, group in enumerate(clusters, 1):
            gid = f'{book}-g{i}'
            topic_ids, evidence, claim_ids = [], [], []
            for j, (title, summary, quote) in enumerate(group['topics'], 1):
                source, url = cite(quote)
                tid = f'{gid}-t{j}'
                topic_ids.append(tid)
                claim_ids.append(f'{tid}-claim')
                evidence.append(source)
                result['topics'].append(dict(id=tid, book=book, title=title, summary=summary,
                                             attribution='Тематический пересказ', url=url, clusters=[gid]))
                result['claims'].append(dict(id=claim_ids[-1], topic=tid, statement=summary))
            if not topic_ids:
                raise ValueError(f'{gid}: no topics')
            result['clusters'].append(dict(id=gid, book=book, title=group['title'], summary=group['summary'],
                                           topicIds=topic_ids, evidence=evidence))
            branches = group.get('branches', [['Положения', list(range(len(topic_ids)))]])
            indices = [n for _, seq in branches for n in seq]
            if sorted(indices) != list(range(len(topic_ids))):
                raise ValueError(f'{gid}: each topic must appear in exactly one branch')
            result['hierarchies'].append(dict(cluster=gid, branches=[
                dict(title=title, claimIds=[claim_ids[n] for n in seq]) for title, seq in branches
            ]))
            for j, (a,b,label,explanation) in enumerate(group['relations'],1):
                if not (0 <= a < len(topic_ids) and 0 <= b < len(topic_ids) and a != b):
                    raise ValueError(f'{gid}: invalid relation endpoints {a}, {b}')
                result['relations'].append({'id':f'{gid}-r{j}', 'from':topic_ids[a], 'to':topic_ids[b],
                                            'label':label, 'explanation':explanation, 'type':'association',
                                            'attribution':'Связь по указанным фрагментам'})
            for j, (title,author,role,quote) in enumerate(group['works'],1):
                source, _ = cite(quote)
                result['works'].append(dict(id=f'{gid}-w{j}', title=title, author=author, role=role,
                                            clusters=[gid], evidence=[source]))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    inputs = {}
    for volume in ('3','4'):
        manuscripts = json.loads((ROOT / 'tools' / f'bakhtin-map{volume}.json').read_text())
        if set(inputs) & set(manuscripts):
            raise ValueError('A work was assigned to both volumes')
        inputs.update(manuscripts)
    books, catalog = load_readers()
    expected = {book for book, meta in catalog.items() if meta.get('kind') != 'Материалы издания'}
    if set(inputs) != expected:
        raise ValueError(f'Missing maps: {sorted(expected - set(inputs))}; '
                         f'maps outside author works: {sorted(set(inputs) - expected)}')
    maps = compile_maps(books, inputs)
    out = DATA / 'bakhtin-maps.js'
    rendered = 'window.__BAKHTIN_MAPS=' + json.dumps(maps, ensure_ascii=False, separators=(',', ':')) + ';\n'
    if args.check:
        if out.read_text() != rendered:
            raise SystemExit('Stale Bakhtin maps')
    else:
        out.write_text(rendered)
    print(f'{len(inputs)} works, {len(maps["clusters"])} key thoughts, {len(maps["topics"])} verified topics')
