#!/usr/bin/env python3
"""Build a deterministic versioned, completely offline-capable static PWA.

Run after editing any book, index.html, image, stylesheet or script.
No packages beyond Python 3 standard library are required.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
SCRIPT_TAG = re.compile(r'(<script\s+src="data/[^"?]+\.js\?v=)[^"&]+("></script>)')
DATA_FILES = sorted((ROOT / 'data').glob('*.js'))
ASSETS = ['index.html','pwa.js','pwa.css','manifest.webmanifest',
          'icons/icon.svg','icons/icon-192.png','icons/icon-512.png',
          'icons/icon-maskable-512.png','icons/apple-touch-icon.png']

def build():
    source = INDEX.read_text(encoding='utf-8')
    canonical, count = SCRIPT_TAG.subn(r'\g<1>BUILD_ID\g<2>', source)
    if count != len(DATA_FILES):
        raise RuntimeError(f'Expected {len(DATA_FILES)} book/image script tags, found {count}')
    hash_ = hashlib.sha256()
    for name in ASSETS:
        item = ROOT / name
        content = canonical.encode('utf-8') if name == 'index.html' else item.read_bytes()
        hash_.update(name.encode('utf-8') + b'\x00' + content + b'\x00')
    hash_.update(b'tools/sw.template.js\x00' + (ROOT / 'tools/sw.template.js').read_bytes() + b'\x00')
    for file in DATA_FILES:
        hash_.update(file.relative_to(ROOT).as_posix().encode('utf-8') + b'\x00' + file.read_bytes() + b'\x00')
    build_id = hash_.hexdigest()[:16]
    html = canonical.replace('?v=BUILD_ID', '?v='+build_id)
    if html != source:
        INDEX.write_text(html, encoding='utf-8')
    files = ['./' + name + ('?v=' + build_id if name == 'index.html' else '') for name in ASSETS if name != 'icons/icon.svg']
    files += ['./data/' + file.name + '?v=' + build_id for file in DATA_FILES]
    template = (ROOT / 'tools/sw.template.js').read_text(encoding='utf-8')
    sw = template.replace('__BUILD_ID__',build_id).replace('__PRECACHE_FILES__',json.dumps(files,ensure_ascii=False,indent=2))
    (ROOT / 'sw.js').write_text(sw,encoding='utf-8')
    print(f'PWA generated: {build_id}, {len(files)} files cached, {count} data scripts versioned')

if __name__ == '__main__': build()
