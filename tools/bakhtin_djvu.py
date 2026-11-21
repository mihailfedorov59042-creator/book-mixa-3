"""Read the complete 2008 edition's DjVu OCR layer, retaining printed notes and editorial documents."""
import hashlib
import html
import json
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


def page_paragraphs(page, opening=False):
    """Reflow the positioned OCR lines; a compound DjVu often has one PARAGRAPH per page."""
    lines = []
    for line in page.iter('LINE'):
        words = []
        for word in line.iter('WORD'):
            text = word.text or ''
            if text:
                coords = tuple(map(int, word.get('coords').split(',')))
                words.append((text, coords))
        if not words:
            continue
        left, bottom, _, top = words[0][1]
        # Running heads and folios in this scan occupy the top margin.
        if not opening and max(w[1][1] for w in words) < int(page.get('height')) * .067:
            continue
        lines.append((left, top, bottom, words[-1][1][2], ' '.join(w[0] for w in words)))
    if not lines:
        return []
    width = int(page.get('width'))
    left_margin = sorted(line[0] for line in lines)[len(lines)//5]
    right_margin = sorted(line[3] for line in lines)[4*len(lines)//5]
    output = []
    previous = None
    for left, top, bottom, right, text in lines:
        new_paragraph = previous is None
        if previous:
            prev_left, prev_bottom, prev_right = previous
            new_paragraph = (prev_right < right_margin-width*.09
                             or left-prev_left > width*.028 and left-left_margin > width*.028
                             or top-prev_bottom > width*.05)
        if new_paragraph:
            output.append(text)
        elif re.search(r'[^\W\d_]-$', output[-1]) and text[:1].islower():
            output[-1] = output[-1][:-1] + text
        else:
            output[-1] += ' ' + text
        previous = left, bottom, right
    return output


def add_full_source(books, catalog, source):
    # Numbered scan ranges and header coordinates were checked against this exact OCR layer.
    if hashlib.sha256(source.read_bytes()).hexdigest() != '401b83f050b1f070d51c8f659be6cd53298c023fa2c3d55c4625703d2bb79953':
        raise ValueError('The scan plan requires the supplied 2008 DjVu (see SHA-256 in README)')
    plan = json.loads(Path(__file__).with_name('bakhtin-41-scans.json').read_text())
    with tempfile.TemporaryDirectory() as tmp:
        xml = Path(tmp)/'pages.xml'
        subprocess.run(['djvutoxml', '--without-anno', str(source), str(xml)], check=True)
        pages = ET.parse(xml).findall('.//OBJECT')
    if len(pages) != 1102:
        raise ValueError('Expected the supplied 1102-image DjVu of the 2008 edition')
    for i, (first, key, title, *author) in enumerate(plan):
        stop = plan[i+1][0] if i+1<len(plan) else len(pages)+1
        rows = []
        for scan in range(first, stop):
            # Divider leaves preceding the actual title pages are also part of the edition.
            paragraphs = page_paragraphs(pages[scan-1], opening=scan==first or scan in (594,815))
            if not paragraphs:
                raise ValueError(f'OCR text missing on scan {scan}')
            for para in paragraphs:
                kind = 'h2' if para.isupper() and 4<len(para)<120 else 'p'
                rows.append([kind, html.escape(para)])
        id_ = 'bakhtin41_'+key
        books[id_] = dict(b=rows, c=[], n={}, mainEnd=len(rows))
        meta = dict(title=title, volume='4', part=1, year='2008')
        if author:
            meta.update(author=author[0], kind='Материалы издания')
        catalog[id_] = meta
