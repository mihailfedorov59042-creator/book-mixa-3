"""Import the supplied 1978 volume V. Run with the path to its FB2."""
import hashlib
import html
import json
import math
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
# Character event anchors were checked against this particular edition.
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != 'c7124d392869e95efc8271ff40b8e134b113e5865ac0afec3cfb6d126c016c15':
    raise SystemExit('Another FB2 edition: verify the text and event anchors before importing.')
root = ET.parse(source).getroot()
for node in root.iter():
    node.tag = node.tag.split('}')[-1]

def plain(node):
    return ''.join(node.itertext()).strip()

def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))

main, notes = root.findall('body')
novel, plays, sketches, variants, commentary, imprint = main.findall('section')
works = [novel, *plays.findall('section'), *sketches.findall('section')]
books, anchors, links = {}, {}, []
work_ids = {s.get('id'): 'push_' + s.get('id') for s in works}
titles = {work_ids[s.get('id')]:plain(s.find('title')).rstrip('*') for s in works}
footnotes = {s.get('id'):s for s in notes.findall('section')}
def inline(e):
    content = html.escape(e.text or '')
    for child in e:
        body = inline(child)
        if child.tag == 'a':
            href = child.get('{http://www.w3.org/1999/xlink}href','')
            if href.startswith('#n_'):
                num = href[3:]
                foot = footnotes[href[1:]]
                book['n'][num] = ['', '<br>'.join(inline(p) for p in foot if p.tag!='title')]
                body = f'<a class="nr" href="#n-{num}" data-n="{num}">{body}</a>'
            elif href.startswith('#'):
                links.append(href[1:])
                body = f'<a href="@@ref{len(links)-1}@@">{body}</a>'
        elif child.tag in ('strong','emphasis','sup'):
            tag = 'em' if child.tag=='emphasis' else child.tag
            body=f'<{tag}>{body}</{tag}>'
        content += body + html.escape(child.tail or '')
    return content

def blocks(e, heading=None):
    rows=book['b']
    if e.get('id'): anchors[e.get('id')]=(bid,len(rows))
    if e.tag in ('p','v','subtitle','text-author'):
        for child in e.iter():
            if child.get('id'): anchors[child.get('id')]=(bid,len(rows))
        txt=plain(e)
        kind=heading or {'v':'v','subtitle':'h2','text-author':'va'}.get(e.tag,'p')
        if kind=='p' and re.fullmatch(r'[IVXLCDM]+',txt): kind='str'
        if kind=='p' and e.find('strong') is not None and len(txt)<45: kind='sp'
        if kind=='p' and txt.startswith('(') and txt.endswith(')'):kind='sd'
        if kind=='p' and txt.isupper() and len(txt)>8 and len(txt)<80:kind='h2'
        rows.append([kind,inline(e).strip()])
    elif e.tag=='empty-line':rows.append(['v',''])
    else:
        for child in e:blocks(child,'h1' if e.tag=='title' else None)
        if e.tag=='stanza' and rows:rows.append(['v',''])

for section in works:
    bid=work_ids[section.get('id')]
    book=books[bid]={'b':[], 'n':{},'c':[]}
    blocks(section)
    book['mainEnd']=len(book['b'])

# Keep the reading order of each apparatus and its original link targets.
by_title={title.upper():key for key,title in titles.items()}
for elem in variants:
    if elem.tag=='title':continue
    if plain(elem) in by_title:
        bid=by_title[plain(elem)];book=books[bid]
        if bid==work_ids['s001']:anchors['s004']=(bid,len(book['b']))
        book['b'].append(['h1','Из ранних редакций'])
    blocks(elem)
for elem in commentary:
    if elem.tag=='title':continue
    sid=(elem.get('id') or '').replace('c','s',1)
    if sid in work_ids:
        bid=work_ids[sid];book=books[bid];book['b'].append(['h1','Комментарии издания'])
    elif sid=='s004':
        bid=work_ids['s001'];book=books[bid];book['b'].append(['h1','Комментарии к ранним редакциям тома'])
    blocks(elem)
for bid,book in books.items():blocks(imprint)

def resolve(m):
    target=links[int(m[1])]
    key,i=anchors[target]
    return f'#{key}@{i}'

research=json.loads((ROOT/'tools/pushkin-characters.json').read_text())
schemes={}
def speaker_id(label, people):
    aliases = {'Вальсингам':['Председатель'], 'Григорий Отрепьев':['Григорий','Самозванец'], 'Борис Годунов':['Борис','Царь'], 'Статуя командора':['Статуя'], 'Слепой старик':['Старик']}
    for j,(name,_,_) in enumerate(people):
        if label in [name, *aliases.get(name,[])]: return f'c{j}'
    return None

for bid,book in books.items():
    book['b']=json.loads(re.sub(r'@@ref(\d+)@@',resolve,dump(book['b'])))
    text=[html.unescape(re.sub('<[^>]+>','',b[1])) for b in book['b'][:book['mainEnd']]]
    spec=research[bid]
    nodes=[]
    for j,(name,role,events) in enumerate(spec['people']):
        stages=[]
        for i,title in events:
            assert i<len(text) and text[i],(bid,i)
            excerpt=text[i]
            stages.append(dict(i=i,t=title,d=excerpt[:220]+('…' if len(excerpt)>220 else ''),l=titles[bid],p=round(100*sum(map(len,text[:i+1]))/max(1,sum(map(len,text))))))
        cid=f'c{j}'
        book['c'].append(dict(id=cid,name=name,role=role,intro=role,arc=' → '.join(s['t'] for s in stages),st=stages))
        angle=2*math.pi*j/len(spec['people'])
        nodes.append([cid,name,role,round(math.cos(angle)*max(1.05,len(spec['people'])*.28),3),round(math.sin(angle)*max(1,len(spec['people'])*.22),3)])
    for block in book['b'][:book['mainEnd']]:
        if block[0]=='sp':
            label = html.unescape(re.sub('<[^>]+>', '', block[1])).rstrip('.').strip()
            speaker = speaker_id(label, spec['people'])
            if speaker: block[1]=f'<span class="ch" data-ch="{speaker}">{block[1]}</span>'
    schemes[bid]=dict(nodes=nodes,edges=[[f'c{a}',f'c{b}',typ,label] for a,b,typ,label in spec['edges']])
# Verify textual completeness independently of the rendering/tag classification.
for section in works:
    book = books[work_ids[section.get('id')]]
    original = [' '.join(plain(e).split()) for e in section.iter()
                if e.tag in {'v','p','subtitle','text-author'} and plain(e)]
    rendered = [' '.join(html.unescape(re.sub('<[^>]*>', '', row[1])).split())
                for row in book['b'][:book['mainEnd']]]
    if original != [line for line in rendered if line]:
        raise ValueError(f'Text mismatch in {section.get("id")}')
out=ROOT/'data/b-pushkin.js'
out.write_text('Object.assign(window.__BOOKS,'+dump(books)+');\nObject.assign(window.__SCH,'+dump(schemes)+');\nwindow.__PUSHKIN='+dump(titles)+';\n')
print(len(books),'books;',len(links),'internal references;',source.name,hashlib.sha256(source.read_bytes()).hexdigest())
