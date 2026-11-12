#!/usr/bin/env python3
"""Prepare compact, source-linked data for the future offline theory map."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'docs/theory-map/map-data.json').read_text())
keys = ('clusters', 'topics', 'claims', 'relations', 'hierarchies', 'works')
data = {key: source[key] for key in keys}
data['sources'] = {
    key: {field: value for field, value in item.items()
          if field in ('book', 'block', 'note', 'url', 'location', 'attribution')
          or (field == 'text' and 'note' in item)}
    for key, item in source['sources'].items()
}
# Full source texts remain in the books already installed on the device.
for topic in data['topics']:
    topic.pop('evidence', None)
    topic.pop('originalSections', None)
for cluster in data['clusters']:
    cluster.pop('coverageRanges', None)
out = ROOT / 'data/theory-map.json'
rendered = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
if parser.parse_args().check:
    if out.read_text() != rendered:
        raise SystemExit('Stale theory map data')
else:
    out.write_text(rendered)
print(f'{out.relative_to(ROOT)}: {out.stat().st_size} bytes')
