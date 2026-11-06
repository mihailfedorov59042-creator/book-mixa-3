#!/usr/bin/env python3
"""Convert an FB2 body to the reader's blocks without rewriting its text.

Usage: python3 tools/import_fb2.py source.fb2 --id barthes --output data/b-barthes.js
Only the Python standard library is needed. Images stay inside the data script,
so the existing PWA build includes them in its versioned offline cache.
"""
import argparse
import base64
import hashlib
from html import escape
import json
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET

NS = '{http://www.gribuser.ru/xml/fictionbook/2.0}'
XLINK = '{http://www.w3.org/1999/xlink}href'
INLINE = {'emphasis': 'i', 'strong': 'b', 'sup': 'sup', 'sub': 'sub',
          'strikethrough': 's', 'code': 'code'}
# The supplied anthology has flat FB2 sections, including these subchapters.
OUTLINES = {'barthes': {
    'I. Мифологии': 2, 'II. Миф сегодня': 2,
    'Литература и Мину Друэ': 2, 'Мозг Эйнштейна': 2,
    'Бедняк и пролетарий': 2, 'Фото-шоки': 2, 'Романы и дети': 2,
    'Марсиане': 2, 'Затерянный континент': 2,
    'I. Расиновский человек 1. Структура': 2,
    'III. История или литература?': 2,
}}


def plain(element):
    return ' '.join(''.join(element.itertext()).split())


def inline(element):
    result = escape(element.text or '', quote=False)
    for child in element:
        name = child.tag.removeprefix(NS)
        if name not in INLINE:
            raise ValueError(f'Unsupported inline FB2 element: {name}')
        tag = INLINE[name]
        result += f'<{tag}>' + inline(child) + f'</{tag}>'
        result += escape(child.tail or '', quote=False)
    return result


def dimensions(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data) >= 24:
        return struct.unpack('>II', data[16:24])
    if data.startswith(b'\xff\xd8'):
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 0xff:
                raise ValueError('Invalid JPEG marker')
            while offset < len(data) and data[offset] == 0xff:
                offset += 1
            marker = data[offset]
            offset += 1
            if marker in (0x01, *range(0xd0, 0xda)):
                continue
            length = int.from_bytes(data[offset:offset + 2], 'big')
            if length < 2 or offset + length > len(data):
                raise ValueError('Invalid JPEG segment')
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
                          0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                height, width = struct.unpack('>HH', data[offset + 3:offset + 7])
                return width, height
            offset += length
    raise ValueError('Only PNG and JPEG book images are supported')


def table_html(table):
    rows = []
    for row in table:
        if row.tag != NS + 'tr':
            raise ValueError('Unsupported table row')
        cells = []
        for cell in row:
            tag = cell.tag.removeprefix(NS)
            if tag not in ('td', 'th'):
                raise ValueError('Unsupported table cell')
            attrs = ''
            for attr in ('colspan', 'rowspan'):
                value = cell.get(attr)
                if value is not None:
                    if not value.isdigit() or not 1 <= int(value) <= 20:
                        raise ValueError('Invalid table span')
                    attrs += f' {attr}="{int(value)}"'
            cells.append(f'<{tag}{attrs}>' + inline(cell) + f'</{tag}>')
        rows.append('<tr>' + ''.join(cells) + '</tr>')
    return ''.join(rows)


def convert(source, book_id):
    if not re.fullmatch(r'[a-z][a-z0-9_]*', book_id):
        raise ValueError('Invalid book ID')
    root = ET.fromstring(source)
    if root.tag != NS + 'FictionBook':
        raise ValueError('Expected an FB2 FictionBook')
    bodies = root.findall(NS + 'body')
    if len(bodies) != 1 or bodies[0].get('name'):
        raise ValueError('This converter requires one main body; separate notes need explicit conversion')
    blocks, images = [], {}

    def image(ref):
        if not ref or not ref.startswith('#'):
            raise ValueError('Only embedded FB2 images are supported')
        binary = next((b for b in root.findall(NS + 'binary') if b.get('id') == ref[1:]), None)
        if binary is None:
            raise ValueError('Missing embedded image')
        mime = binary.get('content-type')
        if mime not in ('image/jpeg', 'image/png'):
            raise ValueError('Unsupported image type')
        encoded = ''.join((binary.text or '').split())
        raw = base64.b64decode(encoded, validate=True)
        width, height = dimensions(raw)
        if width <= 0 or height <= 0:
            raise ValueError('Invalid image dimensions')
        key = book_id + '-' + re.sub(r'[^a-zA-Z0-9_-]', '-', ref[1:])
        images[key] = {'w': width, 'h': height, 'src': f'data:{mime};base64,{encoded}'}
        return key

    cover = root.find(NS + 'description/' + NS + 'title-info/' + NS + 'coverpage/' + NS + 'image')
    if cover is not None:
        blocks.append(['fig', image(cover.get(XLINK))])

    def walk(parent, depth=0):
        for element in parent:
            name = element.tag.removeprefix(NS)
            if name == 'section':
                if element.find(NS + 'title') is None and depth == 0:
                    blocks.append(['h1', 'Об издании'])
                walk(element, depth + 1)
            elif name == 'title':
                text = '<br>'.join(inline(p) for p in element if plain(p))
                level = OUTLINES.get(book_id, {}).get(plain(element), min(3, max(1, depth)))
                if text:
                    blocks.append(['h' + str(level), text])
            elif name == 'p':
                if plain(element):
                    blocks.append(['p', inline(element)])
            elif name == 'table':
                blocks.append(['table', table_html(element)])
            elif name == 'image':
                blocks.append(['fig', image(element.get(XLINK))])
            elif name == 'empty-line':
                continue  # The reader gives section headings their own spacing.
            else:
                raise ValueError(f'Unsupported block FB2 element: {name}')

    walk(bodies[0])
    paragraphs = [plain(p) for p in bodies[0].iter(NS + 'p') if plain(p)]
    text_digest = hashlib.sha256(json.dumps(paragraphs, ensure_ascii=False,
                                           separators=(',', ':')).encode()).hexdigest()
    book = {'b': blocks, 'n': {}, 'mainEnd': len(blocks), 'c': [], 'source': {
        'format': 'FB2', 'sha256': hashlib.sha256(source).hexdigest(),
        'paragraphs': len(paragraphs), 'paragraphsSha256': text_digest}}
    return book, images


def javascript(book_id, book, images):
    def encode(value):
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return (f'(window.__BOOKS=window.__BOOKS||{{}})[{encode(book_id)}]={encode(book)};\n'
            f'Object.assign(window.__IMG=window.__IMG||{{}},{encode(images)});\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--id', required=True, dest='book_id')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    book, images = convert(args.source.read_bytes(), args.book_id)
    args.output.write_text(javascript(args.book_id, book, images), encoding='utf-8')
    print(f'{args.book_id}: {len(book["b"])} blocks, {book["source"]["paragraphs"]} paragraphs, {len(images)} images')
