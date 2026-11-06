import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest

from tools.import_fb2 import convert, dimensions, javascript

ROOT = Path(__file__).resolve().parent.parent
SOURCE_SHA = 'c96a208d1504de7ac55de2fe824720adce69361a31561075471ad569c8668631'
TEXT_SHA = '884a9345d80cfaa0df1253474a2f9292a99758fb377a8f33e7525d2c18ed6022'


class Text(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.feed(html)

    def handle_data(self, data):
        self.parts.append(data)

    def value(self):
        return ' '.join(''.join(self.parts).split())


def generated_book():
    source = (ROOT / 'data/b-barthes.js').read_text(encoding='utf-8')
    book, _ = json.JSONDecoder().raw_decode(source.split('["barthes"]=', 1)[1])
    images = json.loads(source.split('Object.assign(window.__IMG=window.__IMG||{},', 1)[1].removesuffix(');\n'))
    return book, images


def fb2(body, description=''):
    return ('<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" '
            'xmlns:l="http://www.w3.org/1999/xlink">' + description +
            '<body>' + body + '</body></FictionBook>').encode()


class FB2ImportTests(unittest.TestCase):
    def test_complete_anthology_preserves_every_nonempty_source_paragraph_in_order(self):
        book, _ = generated_book()
        paragraphs = [Text(block[1]).value() for block in book['b']
                      if block[0] in ('p', 'h1', 'h2', 'h3') and block != ['h1', 'Об издании']]
        self.assertEqual(len(paragraphs), 1315)
        digest = hashlib.sha256(json.dumps(paragraphs, ensure_ascii=False,
                                          separators=(',', ':')).encode()).hexdigest()
        # These fingerprints were measured independently from the uploaded FB2.
        self.assertEqual(digest, TEXT_SHA)
        self.assertEqual(book['source']['sha256'], SOURCE_SHA)
        self.assertEqual(book['source']['paragraphsSha256'], TEXT_SHA)
        self.assertEqual(book['mainEnd'], len(book['b']))
        self.assertIn('Рождение читателя'.lower(), '\n'.join(paragraphs).lower())

    def test_anthology_navigation_and_semantic_table_are_preserved(self):
        book, _ = generated_book()
        headings = [Text(b[1]).value() for b in book['b'] if b[0] in ('h1', 'h2')]
        self.assertEqual(len(headings), 35)  # 34 source titles and the edition information.
        for title in ('Смерть автора', 'Риторика образа', 'Удовольствие от текста',
                      'Лекция', 'Фото-шоки', 'II. Миф сегодня'):
            self.assertIn(title, headings)
        tables = [b[1] for b in book['b'] if b[0] == 'table']
        self.assertEqual(len(tables), 1)
        self.assertEqual(tables[0].count('<tr>'), 3)
        self.assertIn('colspan="2"', tables[0])
        self.assertIn('colspan="3"', tables[0])
        self.assertIn('III. ЗНАК', Text(tables[0]).value())

    def test_original_cover_is_embedded_for_offline_reading(self):
        book, images = generated_book()
        key = book['b'][0][1]
        self.assertEqual(book['b'][0][0], 'fig')
        cover = images[key]
        self.assertEqual((cover['w'], cover['h']), (702, 973))
        self.assertTrue(cover['src'].startswith('data:image/jpeg;base64,'))
        raw = base64.b64decode(cover['src'].split(',', 1)[1], validate=True)
        self.assertEqual(dimensions(raw), (702, 973))

    def test_inline_formatting_escaping_and_table_spans_round_trip(self):
        source = fb2('<section><title><p>Глава</p></title>'
                     '<p>&lt;script&gt; &amp; <strong>жирный <emphasis>курсив</emphasis></strong>'
                     ' x<sup>2</sup> y<sub>1</sub></p>'
                     '<table><tr><td colspan="2">Знак</td><td>Смысл</td></tr></table></section>')
        book, images = convert(source, 'example')
        self.assertEqual(book['b'][1][1], '&lt;script&gt; &amp; <b>жирный <i>курсив</i></b> x<sup>2</sup> y<sub>1</sub>')
        self.assertEqual(Text(book['b'][1][1]).value(), '<script> & жирный курсив x2 y1')
        self.assertIn('colspan="2"', book['b'][2][1])
        self.assertEqual(images, {})
        self.assertEqual(javascript('example', book, images), javascript('example', *convert(source, 'example')))

    def test_unsupported_elements_and_external_images_fail_without_silently_losing_text(self):
        for source in (fb2('<section><p>Текст<script>bad()</script></p></section>'),
                       fb2('<section><image l:href="https://example.com/image.jpg"/></section>'),
                       fb2('<table><tr><td colspan="999">Текст</td></tr></table>')):
            with self.assertRaises(ValueError):
                convert(source, 'example')


if __name__ == '__main__':
    unittest.main()
