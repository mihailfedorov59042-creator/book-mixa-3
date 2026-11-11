#!/usr/bin/env python3
"""Check the 40 displayed English quotations against the user-supplied PDF.

Usage: python3 tools/check_frye_source.py /path/to/Anatomy.pdf --report /tmp/report.json
Requires the local pdftotext utility; does not upload the PDF or call a service.
This checks quoted text and pagination, NOT the correctness of the Russian paraphrase.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(text):
    # OCR line breaks, hyphenation, punctuation, case, and typographic spacing.
    return re.sub(r'[^a-z0-9]', '', text.lower())


def check(pdf):
    text = subprocess.run(
        ['pdftotext', '-layout', str(pdf), '-'],
        check=True, capture_output=True, text=True,
    ).stdout
    pages = text.split('\f')
    if not pages[-1].strip():
        pages.pop()
    if len(pages) != 401:
        raise ValueError('Expected the supplied 401-page edition; pagination needs review.')
    # Printed p. 3 is PDF page 21. Never infer printed pages from OCR numerals.
    if 'Polemical Introduction' not in pages[20]:
        raise ValueError('Printed/PDF page alignment does not match the checked edition.')
    source = (ROOT / 'data/b-frye.js').read_text()
    book = json.loads(source[source.index('={') + 1:].rstrip(';\n'))
    results = []
    for index, block in enumerate(book['b']):
        if block[0] != 'fq':
            continue
        numbers = [int(n) for n in re.findall(r'\d+', block[3])]
        first, last = numbers[0], numbers[-1]
        fragments = re.split(r'\s*…\s*', block[1])
        if index == 299:
            # The word presentation straddles p. 246/247, with a running title between.
            fragments = [block[1][:-7], 'tation.']
            if (first, last) != (246, 247):
                raise ValueError('Quotation 299 must cite both printed pages 246–247.')
        haystack = ''.join(normalize(pages[n + 17]) for n in range(first, last + 1))
        position = 0
        found = []
        for fragment in fragments:
            needle = normalize(fragment)
            at = haystack.find(needle, position)
            found.append(at >= 0)
            if at >= 0:
                position = at + len(needle)
        results.append({
            'block': index, 'printedPages': [first, last],
            'pdfPages': [first + 18, last + 18],
            'english': block[1], 'fragments': fragments,
            'method': 'normalized fragments in source order',
            'passed': all(found),
        })
    return {
        'source': {'file': pdf.name, 'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
                   'pdfPages': len(pages), 'printedToPdfOffset': 18},
        'scope': 'English quotation wording and printed pagination only; not semantic verification.',
        'quotes': results,
        'passed': len(results) == 40 and all(r['passed'] for r in results),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = check(args.pdf)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    passed = sum(row['passed'] for row in report['quotes'])
    print(f"English quotations verified: {passed}/{len(report['quotes'])}")
    for row in report['quotes']:
        if not row['passed']:
            print(f"REVIEW block {row['block']}, printed pages {row['printedPages']}")
    raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':
    main()
