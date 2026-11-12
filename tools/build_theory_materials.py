#!/usr/bin/env python3
"""Compile reviewed editorial inputs; never infer literary relations from keywords."""
import copy
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/theory-map'
INPUT = DOC / 'materials'
BASE = 'https://mihailfedorov59042-creator.github.io/book-mixa-3/'
BOOKS = ('frye', 'ne', 'barthes')
CHECK = False
RELATIONS = {
    'grounds': 'даёт основание', 'develops': 'развивает',
    'qualifies': 'уточняет или ограничивает', 'classifies': 'различает виды',
    'applies': 'применяет', 'contrasts': 'противопоставляет',
    'parallel': 'сопоставляет контексты', 'explains': 'объясняет',
    'distinguishes': 'требует различения', 'responds': 'отвечает на затруднение',
    'method': 'задаёт способ работы', 'revises': 'показывает изменение позиции',
}


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', str(value)))).strip()


def records(path):
    return [line.split('\t') for line in path.read_text().splitlines()
            if line and not line.startswith('#')]


def write_json(path, value):
    write_document(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def write_document(path, value):
    if CHECK:
        assert path.read_text() == value, f'Stale generated file: {path.relative_to(ROOT)}'
    else:
        path.write_text(value)


def compile_materials():
    old = json.loads((DOC / 'research.json').read_text())
    books, inventory = {}, []
    for name in BOOKS:
        path = ROOT / f'data/b-{name}.js'
        raw = path.read_bytes()
        text = raw.decode()
        books[name], _ = json.JSONDecoder().raw_decode(text[text.index('={') + 1:])
        inventory.append({'id': name, 'file': str(path.relative_to(ROOT)),
                          'sha256': hashlib.sha256(raw).hexdigest(),
                          'blocks': len(books[name]['b']), 'notes': len(books[name]['n'])})

    def attribution(name, block):
        if name == 'frye':
            return ('Редакторский аппарат и учебные применения' if block < 18 or block >= 371
                    else 'Редакторский пересказ Фрая; не русский перевод оригинала')
        if name == 'ne':
            return 'Контекст издания' if block < 5 else 'Аристотель в переводе Радлова; учитывать цитаты и вставки'
        if block < 9 or block >= 1316:
            return 'Издательский аппарат'
        if block < 135:
            return 'Введение Г. К. Косикова'
        return 'Барт; внутри фрагмента возможны цитаты других авторов'

    def location(name, block):
        path = []
        for i, value in enumerate(books[name]['b'][:block + 1]):
            kind = value[0]
            if kind not in ('h1', 'h2') and not (name == 'ne' and i in (365, 385)):
                continue
            label = plain(value[1])
            if kind == 'h1':
                path = [label]
            elif kind == 'h2':
                path = path[:1] + [label]
            elif name == 'ne' and i in (365, 385):
                path = path[:1] + [re.match(r'§\s*\d+', label).group()]
        if name == 'barthes' and 320 <= block < 324:
            return 'Фрагмент о языке-объекте и метаязыке; 1959, Phantomas; заголовок редакторский'
        return ' / '.join(path)

    sources = {}

    def source(name, block=None, note=None):
        key = f'{name}:note:{note}' if note else f'{name}:{block}'
        if key not in sources:
            if note:
                text = plain(' '.join(books[name]['n'][note]))
                refs = [i for i, b in enumerate(books[name]['b']) if f'data-n="{note}"' in str(b[1])]
                sources[key] = {'book': name, 'note': note, 'text': text,
                                'referringBlocks': refs, 'attribution': 'Примечание издания',
                                'url': BASE + f'#{name}@{refs[0]}'}
            else:
                text = plain(books[name]['b'][block][1])
                sources[key] = {'book': name, 'block': block, 'text': text[:480],
                                'isExcerpt': len(text) > 480, 'sourceLength': len(text),
                                'normalizedSha256': hashlib.sha256(text.encode()).hexdigest(),
                                'location': location(name, block),
                                'attribution': attribution(name, block),
                                'url': BASE + f'#{name}@{block}'}
        return key

    topics, topic_index, block_topics = [], {}, {}
    for name in BOOKS:
        sections = json.loads((INPUT / f'{name}-sections.json').read_text())
        summaries = {int(start): value for start, value in records(INPUT / f'{name}-summaries.tsv')}
        assert len(summaries) == len(sections)
        visited = []
        for row in sections:
            start, end = row['start'], row['endExclusive']
            assert start in summaries and start < end <= len(books[name]['b'])
            ident = f'{name}-{start}'
            # Full span is the evidence. Preview is an excerpt, not proof of every clause.
            substantive = [i for i in range(start, end)
                           if books[name]['b'][i][0] not in ('h1', 'h2', 'h3', 'img')
                           and len(plain(books[name]['b'][i][1])) > 60]
            preview = substantive[0] if substantive else start
            refs = [source(name, i) for i in range(start, end)]
            footnotes = sorted({note for i in range(start, end)
                                for note in re.findall(r'data-n="([^"]+)"', str(books[name]['b'][i][1]))})
            note_refs = [source(name, note=n) for n in footnotes]
            topic = {'id': ident, 'book': name, 'title': row['label'],
                     'summary': summaries[start], 'clusters': row['clusters'],
                     'start': start, 'endExclusive': end,
                     'location': location(name, preview), 'url': BASE + f'#{name}@{start}',
                     'attribution': attribution(name, preview),
                     'editorialStatus': 'Редакторский пересказ и группировка; не авторская цитата',
                     'evidence': refs, 'previewSource': source(name, preview), 'footnotes': note_refs}
            if name == 'frye':
                # A section reference, not independent confirmation of each paraphrase.
                topic['originalSections'] = [o for o in old['fryeOriginalOutline']
                                             if start <= o['summaryBlock'] < end]
            topics.append(topic)
            topic_index[ident] = topic
            for i in range(start, end):
                block_topics[(name, i)] = ident
            visited.extend(range(start, end))
        assert visited == list(range(len(books[name]['b']))), name

    clusters = []
    for original in old['clusters']:
        cluster = copy.deepcopy(original)
        members = [t for t in topics if cluster['id'] in t['clusters']]
        cluster['topicIds'] = [t['id'] for t in members]
        cluster['coverageRanges'] = [[t['start'], t['endExclusive']] for t in members]
        for ref in cluster['evidence']:
            name, block = ref.split(':')
            source(name, int(block))
        clusters.append(cluster)

    relations = []
    for i, (a, z, kind, explanation) in enumerate(records(INPUT / 'relations.tsv'), 1):
        assert a in topic_index and z in topic_index and kind in RELATIONS
        assert topic_index[a]['book'] == topic_index[z]['book']
        relations.append({'id': f'relation-{i:03}', 'from': a, 'to': z,
                          'type': kind, 'label': RELATIONS[kind], 'explanation': explanation,
                          'evidenceTopics': [a, z],
                          'attribution': 'Редакторская реконструкция отношения по указанным фрагментам; не цитата',
                          'directionIsImplication': False})
        if kind == 'revises':
            assert (a, z) == ('barthes-569', 'barthes-1303')
            relations[-1]['datedContexts'] = [
                {'title': 'Что такое критика?', 'year': 1963, 'dateSource': source('barthes', 580)},
                {'title': 'Лекция', 'year': 1977, 'dateSource': source('barthes', 1315)},
            ]

    hierarchies = []
    for cluster in clusters:
        members = [t for t in topics if cluster['id'] in t['clusters']]
        branches, assigned = [], []
        for group, label, ranges in records(INPUT / 'branches.tsv'):
            if group != cluster['id']:
                continue
            spans = [tuple(map(int, r.split('-'))) for r in ranges.split(',')]
            children = [t['id'] for t in members if any(a <= t['start'] <= z for a, z in spans)]
            assert children, (group, label)
            branches.append({'id': f'{group}-branch-{len(branches) + 1}', 'title': label,
                             'claimIds': ['p-' + t for t in children],
                             'relationToParent': 'Редакторская тематическая детализация, не логическое следствие'})
            assigned += children
        assert sorted(assigned) == sorted(t['id'] for t in members), (cluster['id'], 'branch coverage')
        hierarchies.append({'cluster': cluster['id'], 'branches': branches,
                            'relationIds': [r['id'] for r in relations
                                            if r['from'] in assigned or r['to'] in assigned],
                            'layout': 'vertical', 'layoutOrderIsArgumentOrder': False})

    works = []
    for item in old['works']:
        work = copy.deepcopy(item)
        work['topicIds'] = sorted({block_topics[(sources[r]['book'], sources[r]['block'])]
                                  for r in work['evidence'] if 'block' in sources[r]})
        # Notes can be extra evidence in addition to the referring paragraph.
        for ref in work['evidence']:
            if ':note:' in ref:
                name, _, note = ref.split(':')
                source(name, note=note)
        work['libraryTarget'] = None
        work['libraryTargetStatus'] = 'Не связывать с локальной книгой без проверки её идентификатора и издания'
        works.append(work)
    for item in json.loads((INPUT / 'additional-works.json').read_text()):
        work = copy.deepcopy(item)
        name, block = work.pop('book'), work.pop('block')
        assert f'«{work["sourceTitle"]}»' in plain(books[name]['b'][block][1]), work['id']
        topic = topic_index[block_topics[(name, block)]]
        work.update(evidence=[source(name, block)], topicIds=[topic['id']],
                    clusters=topic['clusters'], status='confirmed_contextual_mention',
                    libraryTarget=None, libraryTargetStatus='Не сопоставлено с книгой библиотеки')
        if name == 'ne' and block == 253:
            work['evidence'].append(source(name, note='r6'))
        works.append(work)

    work_index = {w['id']: w for w in works}
    for link in json.loads((INPUT / 'library-links.json').read_text()):
        target = ROOT / f'data/b-{link["book"]}.js'
        assert target.is_file() and link['work'] in work_index
        work = work_index[link['work']]
        work['libraryTarget'] = {k: v for k, v in link.items() if k != 'work'}
        work['libraryTarget']['url'] = BASE + '#' + link['book']
        work['libraryTarget']['relationship'] = 'То же произведение в издании библиотеки; не ссылка на тождественную страницу'
        work['libraryTargetStatus'] = 'Проверено по каталогу index.html и наличию файла книги'

    glossary = []
    for block, targets in records(INPUT / 'glossary-links.tsv'):
        block = int(block)
        ids = targets.split(',')
        assert all(t in topic_index for t in ids)
        glossary.append({'source': source('frye', block),
                         'term': plain(books['frye']['b'][block][1]).split(' — ')[0],
                         'topicIds': ids, 'relation': 'см. соответствующие контексты, не тождество значений',
                         'attribution': 'Редакторский словарь сайта, не глоссарий Фрая'})
    claims = [{'id': 'p-' + t['id'], 'topic': t['id'], 'statement': t['summary'],
               'evidenceTopics': [t['id']], 'attribution': t['editorialStatus']}
              for t in topics]
    data = {'schemaVersion': 1, 'date': '2026-11-12',
            'status': 'Подготовленные редакторские материалы для реализации четырёх режимов',
            'scope': 'Все блоки трёх текстов сайта; выборочный каталог проверенных произведений. Фрай — конспект.',
            'inventory': inventory, 'clusters': clusters, 'topics': topics, 'claims': claims,
            'relations': relations, 'relationTypes': RELATIONS, 'hierarchies': hierarchies,
            'works': works, 'sources': sources, 'glossaryLinks': glossary,
            'footnotes': old['footnotes'], 'fryeOriginalOutline': old['fryeOriginalOutline'],
            'fryeOriginalParatext': old['fryeOriginalParatext'],
            'prohibitedInferences': [
                'Структурный охват не доказывает полноты каждой интерпретации.',
                'Редакторская ветвь не означает авторского логического вывода.',
                'Совпадение слова не доказывает тождества понятия или влияния между авторами.',
                'Полный диапазон источника не означает, что каждое предложение в нём принадлежит автору книги.',
                'Проверенные примеры не являются полным библиографическим указателем всех упоминаний.',
                'Нельзя достраивать отсутствующие части «Мифологий» или «О Расине» по памяти.',
                'Нельзя превращать конспект Фрая в полный перевод или считать все его дополнения авторскими.',
            ]}
    write_json(DOC / 'map-data.json', data)

    for name in BOOKS:
        lines = [f'# Темы и положения: {name}', '',
                 'Заголовки и сводки ниже — редакторский пересказ. Ссылка открывает источник; граница диапазона исключительная.', '']
        for t in (x for x in topics if x['book'] == name):
            lines += [f'## {t["id"]}. {t["title"]}', '', t['summary'], '',
                      f'Круги: {", ".join(t["clusters"])}. [Источник: блоки {t["start"]}–{t["endExclusive"] - 1}]({t["url"]}).', '',
                      f'Расположение: {t["location"]}. Статус: {t["attribution"]}.', '']
        write_document(DOC / f'topics-{name}.md', '\n'.join(lines))
    lines = ['# Охват подготовленной карты', '',
             'Это проверка разделения источников, а не доказательство единственности интерпретации. '
             'Все 2220 блоков и 25 примечаний имеют адрес; тематические фрагменты непрерывны и не перекрываются внутри книги. '
             'Один фрагмент может входить в несколько крупных кругов.', '',
             'Структурный указатель заголовков хранится в research.json. Здесь показаны 336 смысловых фрагментов из map-data.json. '
             'В VIII книге Аристотеля учтены встроенные в абзацы § 4 и § 13; '
             'у Барта фрагмент 320–323 отделён от «Мифа сегодня» под редакторским названием.', '']
    for name in BOOKS:
        lines += [f'## {name}', '', '| Тема | Блоки включительно | Круги |', '|---|---|---|']
        for t in (x for x in topics if x['book'] == name):
            lines.append(f'| [{t["title"]}]({t["url"]}) | {t["start"]}–{t["endExclusive"]-1} | {", ".join(t["clusters"])} |')
        lines += ['']
    lines += ['## Примечания Аристотеля', '', '| Примечание | Блоки с отсылками |', '|---|---|']
    for n in old['footnotes']:
        lines.append(f'| {n["id"]} | ' + ', '.join(f'[{i}]({BASE}#ne@{i})' for i in n['blocks']) + ' |')
    lines += ['', '## Разделы английского оригинала Фрая', '',
              'Это навигация по оригиналу и соответствующему конспекту; диапазон раздела не означает построчной сверки перевода.', '',
              '| Раздел | Печатные страницы | Страницы PDF | Конспект |', '|---|---|---|---|']
    for o in old['fryeOriginalOutline']:
        lines.append(f'| {o["title"]} | {o["printedPages"][0]}–{o["printedPages"][1]} | {o["pdfPages"][0]}–{o["pdfPages"][1]} | [блок {o["summaryBlock"]}]({BASE}#frye@{o["summaryBlock"]}) |')
    write_document(DOC / 'coverage.md', '\n'.join(lines) + '\n')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify generated files without writing')
    CHECK = parser.parse_args().check
    data = compile_materials()
    print({k: len(data[k]) for k in ('clusters', 'topics', 'claims', 'relations', 'hierarchies', 'works', 'sources')})
