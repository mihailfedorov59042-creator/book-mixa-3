"""Build both epics and standalone edition glossaries from the supplied FB2 files."""
import html
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data'
# Name, attested inflection stem(s), role, related character and relationship.
CAST = {
'iliad': """Ахиллес|Ахилл[еэ]с,Пелид|сын Пелея|Гектор|поединок
Гектор|Гектор|защитник Трои|Приам|сын
Агамемнон|Агамемнон|предводитель ахейцев|Ахиллес|спор о награде
Патрокл|Патрокл|друг Ахиллеса|Ахиллес|дружба
Приам|Приам(?!ид)|царь Трои|Ахиллес|выкуп Гектора
Зевс|Зевс,Зевес|владыка Олимпа|Фетида|просьба о помощи
Андромаха|Андромах|жена Гектора|Гектор|супруги
Фетида|Фетид|морская богиня|Ахиллес|мать
Менелай|Менела|царь Спарты|Агамемнон|брат
Парис|Парис,Александр|сын Приама|Менелай|поединок
Елена|Елен|жена Менелая|Парис|уход в Трою
Афина|Афин(?!ах)[ауыое],Паллад|богиня|Ахиллес|удерживает от удара
Одиссей|Одиссе,Лаэртид|царь Итаки|Ахиллес|посольство
Диомед|Диомед,Тидид|сын Тидея|Одиссей|ночная вылазка
Нестор|Нестор(?!ид)|пилосский царь|Агамемнон|совет
Брисеида|Брисеид|пленница|Ахиллес|разлука
Аполлон|Аполлон,Феб(?:а,ом,у)?(?![а-яё])|бог-лучник|Гектор|покровительство
Гефест|Гефест|бог-кузнец|Фетида|оружие для сына
Сарпедон|Сарпедон|ликийский вождь|Патрокл|поединок
Эней|Эне[йяюе]|сын Анхиса|Ахиллес|поединок
Гекуба|Гекуб|царица Трои|Гектор|мать
Гера|Гер(?:ою,ой,[аеуы])(?![а-яё])|царица богов|Зевс|супруги
Ирида|Ирид|вестница богов|Зевс|служба
Хрисеида|Хрисеид|дочь жреца Хриса|Агамемнон|возвращение из плена
Гермес|Гермес|вестник богов|Приам|проводник""",
'odyssey': """Одиссей|Одиссе,Лаэртид|царь Итаки|Пенелопа|супруги
Телемак|Телемак|сын Одиссея|Одиссей|сын
Пенелопа|Пенелоп|царица Итаки|Телемак|мать
Афина|Афин(?!ах)[ауыое],Паллад|богиня|Одиссей|покровительство
Посидон|Посидон|бог моря|Одиссей|преследование
Антиной|Антино|один из женихов|Пенелопа|сватовство
Эвмей|Эвме(?!л)|свинопас|Одиссей|приют на Итаке
Эвриклея|Эврикле|кормилица|Одиссей|узнавание по рубцу
Алкиной|Алкино|царь феаков|Одиссей|возвращение на корабле
Навзикая|Навзика,Навсика|царевна феаков|Алкиной|дочь
Полифем|Полифем|киклоп|Посидон|сын
Цирцея|Цирце|волшебница|Одиссей|остров Эя
Калипсо|Калипсо|нимфа|Одиссей|остров Огигия
Лаэрт|Лаэрт(?!ид)|отец Одиссея|Одиссей|отец
Менелай|Менела|царь Спарты|Телемак|приём в Спарте
Нестор|Нестор(?!ид)|царь Пилоса|Телемак|приём в Пилосе
Эвримах|Эвримах|один из женихов|Антиной|женихи
Зевс|Зевс,Зевес,Ди[йю](?![а-яё])|владыка Олимпа|Афина|совет богов
Филотий|Филоти|пастух|Одиссей|союз против женихов
Эрмий|Эрми(?!он)|вестник богов|Калипсо|приносит волю Зевса
Тирезий|Тирези|фиванский прорицатель|Одиссей|пророчество
Антиклея|Антикле(?!с)|тень матери Одиссея|Одиссей|мать
Демодок|Демодок|певец феаков|Одиссей|песнь о Трое
Арета|Арет(?:ою,ой,[ауые])(?![а-яё])|царица феаков|Алкиной|супруги
Эвпейт|Эвпейт|отец Антиноя|Антиной|отец"""}
EVENTS = {'iliad': {}, 'odyssey': {}}
for record in Path(__file__).with_name('homer-chronicles.txt').read_text(encoding='utf-8').splitlines():
    if record and not record.startswith('#'):
        book, person, song, phrase, caption = record.split('|')
        EVENTS[book].setdefault(person, []).append((int(song), phrase, caption))

def verse_text(line):
    without_notes = re.sub(r'<a class="nr"[^>]*>.*?</a>', '', line)
    return html.unescape(re.sub(r'<[^>]*>', '', without_notes))

RELATION_TYPES = {
    'супруги':'mar', 'брат':'kin', 'отец':'kin', 'мать':'kin', 'сын':'kin', 'дочь':'kin',
    'поединок':'foe', 'преследование':'foe', 'спор о награде':'foe',
    'дружба':'ally', 'союз против женихов':'ally', 'покровительство':'ally',
    'ночная вылазка':'ally', 'совет':'ally',
}
EXTRA_EDGES = {
    'iliad': [
        ('Гектор','Патрокл','foe','гибель Патрокла'), ('Приам','Парис','kin','отец и сын'),
        ('Аполлон','Патрокл','foe','удар Аполлона'), ('Зевс','Сарпедон','kin','отец и сын'),
        ('Менелай','Елена','mar','супруги'),
    ],
    'odyssey': [
        ('Одиссей','Полифем','foe','ослепление киклопа'), ('Афина','Телемак','ally','помощь в пути'),
        ('Эвмей','Филотий','ally','защита дома'), ('Навзикая','Одиссей','ally','помощь на берегу'),
        ('Одиссей','Антиной','foe','гибель жениха'),
    ],
}
PLATES={'iliad':[(1,'il04','Брисеида покидает шатёр Ахиллеса'),(6,'il21','Гектор укоряет Париса'),(17,'il51','Бой за тело Патрокла')], 'odyssey':[(12,'illus-176-plate','Одиссей и сирены'),(21,'illus-262','Лук Одиссея')]}
def plain(e): return ''.join(e.itertext()).strip() if e is not None else ''
def dump(x): return json.dumps(x,ensure_ascii=False,separators=(',',':'))
books,schemes,plates,glossaries={},{},{},{}
for filename in sys.argv[1:]:
    root=ET.parse(filename).getroot()
    for e in root.iter(): e.tag=e.tag.split('}')[-1]
    title=plain(root.find('.//book-title'))
    key={'Илиада':'iliad','Одиссея':'odyssey'}[title]
    body,notes=root.findall('body')
    songs=[e for e in body.iter('section') if plain(e.find('title')).startswith('ПЕСНЬ')]
    assert len(songs)==24
    dictionary=next(e for e in body.iter('section') if plain(e.find('title')).startswith('СЛОВАРЬ'))
    people=[line.split('|') for line in CAST[key].splitlines()]
    names=[v[0] for v in people]
    pattern=re.compile(r'(?<!\w)(?:'+'|'.join(f'(?P<c{i}>(?:'+p[1].replace(',','|')+')[а-яё]*)' for i,p in enumerate(people))+r')(?!\w)')
    lookup={e.get('id'):str(i+1) for i,e in enumerate(notes.findall('section'))}
    def inline(e,mark=False,web=False):
        def literal(s):
            s=html.escape(s or '')
            def link(match):
                # The accusative of Athens and the daughter of Phorbas coincide
                # with inflections of Athena and Diomedes in these editions.
                prefix = s[:match.start()]
                if match[0] == 'Афины' and re.search(r'(?:[Вв] |град велелепный )$', prefix):
                    return match[0]
                if match[0] == 'Диомеда' and 'Форбаса дочь' in prefix:
                    return match[0]
                return f'<span class="ch" data-ch="{match.lastgroup}" role="button" tabindex="0">{match[0]}</span>'
            return pattern.sub(link, s) if mark else s
        result=literal(e.text)
        for child in e:
            inner=inline(child,mark,web)
            if child.tag=='a':
                target=next((v[1:] for k,v in child.attrib.items() if k.endswith('href') and v.startswith('#')),None)
                if target in lookup:
                    n=lookup[target]
                    inner=f'<a href="#n{n}">{inner}</a>' if web else f'<a class="nr" href="#n-{n}" data-n="{n}">{inner}</a>'
            elif child.tag in ('emphasis','sup','strong'):
                t='em' if child.tag=='emphasis' else child.tag
                inner=f'<{t}>{inner}</{t}>'
            if child.tag in ('v','text-author') and e.tag in ('stanza','poem') and result.strip():
                result += '<br>'
            result+=inner+literal(child.tail)
        return result.strip() if e.tag in ('v','p','subtitle') else result
    defs={lookup[e.get('id')]:['','<br>'.join(inline(p) for p in e if p.tag!='title')] for e in notes.findall('section')}
    rows=[]; stages=[[] for x in people]; anchors=[]
    def walk(e,song=0):
        if e is dictionary or (not song and e in songs):return
        if e.tag in ('p','v','subtitle','text-author'):
            ishead=e in headings or e.tag=='subtitle'
            line=inline(e,song and not ishead)
            if not line:return
            idx=len(rows)
            rows.append(['h1' if ishead else 'v' if song or e.tag=='v' else 'p',line])
            if e in stanza_starts and rows[-1][0] == 'v':
                rows[-1].append('g')
            if song and not ishead:
                for cid in set(re.findall('data-ch="c([0-9]+)"',line)):
                    seq=stages[int(cid)]
                    if not seq or seq[-1][0]!=song:seq.append((song,idx))
        else:
            for child in e:walk(child,song)
    # A stanza boundary is layout metadata on an existing verse row, so all
    # saved passage, note and character offsets remain stable.
    stanza_starts = set()
    for song in songs:
        for parent in song.iter():
            for previous, current in zip(parent, list(parent)[1:]):
                if previous.tag == 'empty-line' and current.tag in ('p', 'v'):
                    stanza_starts.add(current)
                if previous.tag == 'stanza' and current.tag == 'stanza':
                    first = current.find('v')
                    if first is not None:
                        stanza_starts.add(first)
    headings={p for h in body.iter('title') for p in h.iter('p')}
    for n,s in enumerate(songs,1):
        anchors.append(len(rows));walk(s,n)
    end=len(rows)
    for s in body.findall('section'):
        if s in songs:continue
        if any(c in songs for c in s):continue
        walk(s)
    cards=[]; nodes=[]; edges=[]
    for i,((name,_,role,other,rel),seq) in enumerate(zip(people,stages)):
        assert seq,(key,name)
        st=[]
        for n, phrase, caption in EVENTS[key][name]:
            stop = anchors[n] if n < 24 else end
            matches = [j for j in range(anchors[n-1], stop)
                       if rows[j][0] == 'v' and phrase in verse_text(rows[j][1])]
            if len(matches) != 1:
                raise ValueError(f'{key}, {name}, песнь {n}: {phrase!r} ({len(matches)} совпадений)')
            idx = matches[0]
            excerpt = [verse_text(rows[idx][1])]
            if idx + 1 < stop and rows[idx + 1][0] == 'v':
                excerpt.append(verse_text(rows[idx + 1][1]))
            fragment = ' / '.join(re.sub(r'^\d+\s+', '', line) for line in excerpt)
            st.append(dict(i=idx,t=caption,d=f'Песнь {n}. {fragment}',l=title,p=round(idx/end*100)))
        st.sort(key=lambda stage: stage['i'])
        cards.append(dict(id=f'c{i}',name=name,role=role,intro=f'{name} — {role}.',arc=f'{rel.capitalize()} · {other}',st=st))
        ring=0 if i<6 else 1 if i<13 else 2
        start=[0,6,13][ring]; size=[6,7,len(people)-13][ring]
        angle=2*math.pi*(i-start)/size+ring*.27
        nodes.append([f'c{i}',name,role,round((1.6+1.6*ring)*math.cos(angle),3),round((1.25+1.25*ring)*math.sin(angle),3)])
        edge=[f'c{i}',f'c{names.index(other)}',RELATION_TYPES.get(rel,'oth'),rel]
        if not any(set(x[:2])==set(edge[:2]) for x in edges):edges.append(edge)
    for a,b,kind,label in EXTRA_EDGES[key]:
        edges.append([f'c{names.index(a)}',f'c{names.index(b)}',kind,label])
    books[key]=dict(b=rows,c=cards,n=defs,mainEnd=end)
    schemes[key]=dict(nodes=nodes,edges=edges)
    artist,work=('По композициям Джона Флаксмана','6130') if key=='iliad' else ('Вилли Погани','16867')
    plates[key]=[[anchors[n-1],f'data/art/homer/{f}.webp',caption,artist,'https://www.gutenberg.org/ebooks/'+work] for n,f,caption in PLATES[key]]
    glossary=''.join('<p>'+inline(p,web=True)+'</p>' for p in dictionary if p.tag!='title')
    refs=set(re.findall('href="#n(\\d+)"',glossary))
    for e in notes.findall('section'):
        n=lookup[e.get('id')]
        if n in refs:glossary+=f'<p id="n{n}"><b>{n}.</b> '+ ' '.join(inline(p,web=True) for p in e if p.tag!='title')+'</p>'
    label=plain(dictionary.find('title'))
    glossary=glossary.replace('href="#n',f'href="#{key}-n').replace('id="n',f'id="{key}-n')
    glossaries[key]=f'<section id="{key}"><h2>{title} · {label.capitalize()}</h2>{glossary}<a href="#top">К оглавлению ↑</a></section>'
assert len(books)==2
(OUT/'b-homer.js').write_text('Object.assign(window.__BOOKS,'+dump(books)+');\nObject.assign(window.__SCH,'+dump(schemes)+');\nwindow.__HOMER_PLATES='+dump(plates)+';\n', encoding='utf-8')

(OUT/'homer-dictionary.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Гомер · Словари двух поэм</title><style>body{margin:auto;padding:2em 1em;max-width:48em;background:#f3ead3;color:#362819;font:18px/1.55 Georgia,serif}a{color:#863c2d}h2{font-size:1.5em}</style><main id="top"><a href="../#shelf/homer">← Полка Гомера</a><h1>Словари двух поэм</h1><nav><a href="#iliad">Илиада · Имена и названия</a> · <a href="#odyssey">Одиссея · Мифологические сюжеты</a></nav>'+glossaries['iliad']+glossaries['odyssey']+'</main></html>', encoding='utf-8')
