"""Import one Bakhtin DOC/DOCX using the edition-specific paragraph plan.

python tools/import_bakhtin.py 3 volume.doc
python tools/import_bakhtin.py 41 volume.docx --dump /tmp/41.tsv
DOC input requires LibreOffice (soffice). Pillow encodes local facsimiles.
Paragraph numbers in plans include only nonempty Word paragraphs, in body order.
"""
import argparse
import html
import io
import json
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
EDITION = {'3': ('3', 0, '2012'), '41': ('4', 1, '2008'), '42': ('4', 2, '2010')}


def paragraph_text(p):
    return ''.join(t.text or '' for t in p.iter(W+'t')).strip()


def export(part, path, dump, complete=None):
    volume, number, year = EDITION[part]
    with ZipFile(path) as doc:
        body = ET.fromstring(doc.read('word/document.xml')).find(W+'body')
        paragraphs = [p for p in body.iter(W+'p') if paragraph_text(p)]
        indices = {p: i for i, p in enumerate(paragraphs)}
        if dump:
            with dump.open('w', encoding='utf-8') as out:
                for i, p in enumerate(paragraphs):
                    style = p.find(W+'pPr/'+W+'pStyle')
                    print(i, style.get(W+'val', '') if style is not None else '',
                          paragraph_text(p), sep='\t', file=out)
            return

        plan = json.loads((ROOT/'tools'/f'bakhtin-{part}.json').read_text())
        starts = [record['start'] for record in plan]
        if starts != sorted(set(starts)) or not starts or starts[0] != 0 or starts[-1] >= len(paragraphs):
            raise ValueError(f'Invalid work boundaries for volume {part}')
        rels = ET.fromstring(doc.read('word/_rels/document.xml.rels'))
        targets = {rel.get('Id'): rel.get('Target') for rel in rels
                   if rel.get('Type').endswith('/hyperlink')}
        images = {}
        for rel in rels:
            if not rel.get('Type').endswith('/image'):
                continue
            target = rel.get('Target')
            src = Path('art/bakhtin') / f"{part}-{Path(target).stem}.webp"
            (DATA/src).parent.mkdir(parents=True, exist_ok=True)
            with Image.open(io.BytesIO(doc.read('word/'+target))) as im:
                im.save(DATA/src, 'WEBP', quality=92, method=6)
            images[rel.get('Id')] = 'data/'+src.as_posix()

        def inline(p):
            # Word also auto-linked bibliographic names ending in '.de' and a
            # local Windows path. Preserve these as printed, unlinked text.
            links = {}
            for link in p.iter(W+'hyperlink'):
                target = targets.get(link.get(R+'id'), '')
                label = paragraph_text(link)
                if ((target.startswith(('https://', 'http://')) and label.startswith(('https://','http://')))
                        or target.startswith('mailto:')):
                    for run in link.iter(W+'r'):
                        links[run] = target
            fragments = []
            for run in p.iter(W+'r'):
                content = []
                for el in run:
                    if el.tag == W+'t':
                        content.append(html.escape(el.text or ''))
                    elif el.tag == W+'tab':
                        content.append(' ')
                    elif el.tag in (W+'br', W+'cr') and el.get(W+'type') != 'page':
                        content.append('<br>')
                    elif el.tag == W+'drawing':
                        for blip in el.iter(A+'blip'):
                            src = images[blip.get(R+'embed')]
                            content.append(f'<img class="bakhtin-facsimile" src="{src}" alt="Иллюстрация из печатного издания">')
                text = ''.join(content)
                for tag, prop in [('em','i'), ('strong','b')]:
                    setting = run.find(W+'rPr/'+W+prop)
                    if setting is not None and setting.get(W+'val') not in ('0','false','off'):
                        text = f'<{tag}>{text}</{tag}>'
                if text and run in links:
                    text = f'<a class="ed-ref" href="{html.escape(links[run], quote=True)}">{text}</a>'
                fragments.append(text)
            return ''.join(fragments).strip()

        def table_rows(table):
            # Keep cells side by side while allowing the reader to paginate
            # long lists of editorial corrections one source row at a time.
            for row in table.findall(W+'tr'):
                cells = []
                for cell in row.findall(W+'tc'):
                    cells.append('<td>'+'<br>'.join(filter(None,(inline(p) for p in cell.iter(W+'p'))))+'</td>')
                ordinals = [indices[p] for p in row.iter(W+'p') if p in indices]
                if cells and ordinals:
                    yield ordinals[0], 'table', '<tr>'+''.join(cells)+'</tr>'

        blocks = []
        ordinal = -1
        for el in body:
            if el.tag == W+'tbl':
                blocks.extend(table_rows(el))
                ordinal = max((indices[p] for p in el.iter(W+'p') if p in indices), default=ordinal)
            elif el.tag == W+'p':
                ordinal = indices.get(el, ordinal)
                fields = [f.text.strip() for f in el.iter(W+'instrText') if f.text]
                if fields and all(field == 'PAGE' for field in fields):
                    continue
                content = inline(el)
                if content and content.strip().replace('<br>','').strip():
                    blocks.append((max(0,ordinal), 'p', content))

        books, catalog = {}, {}
        for pos, item in enumerate(plan):
            start = item['start']
            stop = starts[pos+1] if pos+1 < len(plan) else len(paragraphs)
            headings = set(item.get('headings', []))
            subheadings = set(item.get('subheadings', []))
            skip = set(item.get('skip', []))
            if any(i < start or i >= stop for i in headings | subheadings | skip):
                raise ValueError(f'Paragraph outside {item["id"]}')
            rows = []
            end = 0
            for i, kind, content in blocks:
                if i < start or i >= stop or (i in skip and kind != 'table' and '<img' not in content):
                    continue
                if kind == 'p' and '<img' not in content:
                    if i in headings:
                        kind = 'h1'
                    elif i in subheadings:
                        kind = 'h2'
                rows.append([kind, content])
                if i < item.get('endMain', stop):
                    end = len(rows)
            if not rows or item['id'] in books:
                raise ValueError(f'Invalid work {item["id"]}')
            meta = {k:item[k] for k in ('title','author','kind','sourceNote') if k in item}
            meta.update(volume=volume, part=number, year=year)
            if item.get('sourceNote'):
                rows.append(['ed','Примечание электронной полки. '+html.escape(item['sourceNote'])])
            books[item['id']] = dict(b=rows, c=[], n={}, mainEnd=end)
            catalog[item['id']] = meta

        if part == '41':
            from bakhtin_djvu import add_full_source
            add_full_source(books, catalog, complete)

        def encode(value):
            return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

        js = (f'Object.assign(window.__BOOKS,{encode(books)});\n'
              f'Object.assign(window.__BAKHTIN ||= {{}},{encode(catalog)});\n')
        (DATA/f'b-bakhtin{part}.js').write_text(js, encoding='utf-8')
        print(f'{part}: {len(books)} works, {len(paragraphs)} source paragraphs, {len(images)} images')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('part', choices=EDITION)
    parser.add_argument('file', type=Path)
    parser.add_argument('--dump', type=Path, help='write a numbered paragraph inventory and exit')
    parser.add_argument('--djvu', type=Path, help='complete OCR DjVu of volume 4, book 1')
    args = parser.parse_args()
    if args.part == '41' and not args.dump and not args.djvu:
        parser.error('the complete 2008 DjVu is required (--djvu)')
    with tempfile.TemporaryDirectory(prefix='bakhtin-') as tmp:
        source = args.file.resolve()
        if source.suffix.lower() == '.doc':
            subprocess.run(['soffice', '-env:UserInstallation='+(Path(tmp)/'profile').as_uri(),
                            '--headless', '--convert-to', 'docx', '--outdir', tmp, str(source)], check=True)
            source = Path(tmp)/source.with_suffix('.docx').name
        export(args.part, source, args.dump, args.djvu)


if __name__ == '__main__':
    main()
