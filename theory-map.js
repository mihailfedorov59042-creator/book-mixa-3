/* Full-screen SVG workspace. Coordinates of nodes and ink are independent of the screen. */
(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg', KEY='polka-theory-ink-v2';
  const titles={frye:'Нортроп Фрай · Анатомия критики',ne:'Аристотель · Никомахова этика',barthes:'Ролан Барт · Избранные работы'};
  const modes=[['thoughts','Мысли'],['topics','Темы и связи'],['works','Произведения'],['claims','Положения']];
  const colors={ink:'Чернила',cin:'Киноварь',az:'Лазурь',vert:'Зелёный'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const el=(tag,attrs,body='')=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${esc(v)}"`).join(' ')}>${body}</${tag}>`;
  const action=(kind,id,label)=>`<button type="button" data-kind="${kind}" data-id="${esc(id)}">${esc(label)}</button>`;
  const launch=document.createElement('button'); launch.type='button'; launch.className='ib theory-open'; launch.textContent='Схема'; launch.setAttribute('aria-label','Открыть схему теории'); document.querySelector('#btn-sch').after(launch);
  const dialog=document.createElement('dialog'); dialog.className='tm'; dialog.setAttribute('aria-label','Схема теории'); document.body.append(dialog);
  let data, topics, works, groups, relations, book, mode='thoughts', selected=null, detail=null, scene, svg, viewport;
  let tool='view',color='ink',width=2.8, vb, full, undo=[], pending=null, penSeen=false, pointerState=null, suppressClick=false;
  const views=new Map(), scenes=new Map(), pointers=new Map();
  let cachedInk={}, inkBlocked=false;
  function readInk() {
    const value=JSON.parse(localStorage.getItem(KEY)||'{}');
    if (!value || Array.isArray(value) || typeof value!=='object') throw Error('Invalid ink');
    for (const strokes of Object.values(value)) {
      if (!Array.isArray(strokes) || strokes.some(s=>!s || !Object.hasOwn(colors,s.color) || !Number.isFinite(s.width) || !Array.isArray(s.points) || s.points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))) throw Error('Invalid stroke');
    }
    return value;
  }
  try { cachedInk=readInk(); } catch (_) { inkBlocked=true; }
  const pageKey=()=>`${book}:${mode}:${mode==='thoughts'?'overview':selected||'overview'}`;
  const strokes=()=>cachedInk[pageKey()]||[];
  function status(message='') { const node=dialog.querySelector('[data-status]'); if(node){node.textContent=message;node.hidden=!message;} }
  function commitInk(next,before) {
    if(inkBlocked){status('Пометки не сохранены: не удалось прочитать хранилище. Существующие данные сохранены без изменений.');return false;}
    try {
      const latest=readInk();
      if(JSON.stringify(latest[pageKey()]||[])!==JSON.stringify(before)) {cachedInk=latest;status('Пометки изменились в другой вкладке. Загружена сохранённая версия; повторите действие.');return false;}
      const update={...latest,[pageKey()]:next}; localStorage.setItem(KEY,JSON.stringify(update));cachedInk=update;status();return true;
    } catch (_) {status('Не удалось сохранить пометки на устройстве. Предыдущие рисунки сохранены.');return false;}
  }
  function legacyAvailable(){try{return Object.values(JSON.parse(localStorage.getItem('polka-theory-ink-v1')||'{}')).some(x=>Array.isArray(x)&&x.length);}catch(_){return true;}}
  const sourceLink=(url,label)=>`<a data-source href="${esc(new URL(url,location.href).hash)}">${esc(label)}</a>`;
  function sources(refs) {
    const unique=[...new Set(refs||[])].map(id=>data.sources[id]).filter(Boolean);
    return `<details class="tm-sources"><summary>Места в тексте · ${unique.length}</summary><ol>${unique.map(s=>`<li>${sourceLink(s.url,s.note?'Примечание '+s.note:`${s.book==='frye'?'Фрай':s.book==='ne'?'Аристотель':'Барт'} · фрагмент ${s.block}`)}${s.note?`<p>${esc(s.text||'')}</p>`:''}</li>`).join('')}</ol></details>`;
  }
  function detailContent() {
    if(!detail)return '';
    const {kind,id}=detail, item=kind==='cluster'?groups.get(id):kind==='topic'?topics.get(id):kind==='work'?works.get(id):relations.get(id);
    if(!item)return '';
    let body='';
    if(kind==='cluster')body=`<h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><button type="button" data-explore="${esc(id)}">Раскрыть темы →</button>${sources(item.evidence)}`;
    if(kind==='topic'){
      body=`<h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><p class="tm-attribution">${esc(item.attribution)}</p><p>${sourceLink(item.url,'Открыть в книге →')}</p>`;
      const edges=data.relations.filter(r=>r.from===id||r.to===id);
      if(edges.length)body+=`<h4>Связи</h4>${edges.map(r=>action('relation',r.id,`${r.label} · ${topics.get(r.from===id?r.to:r.from).title}`)).join('')}`;
    }
    if(kind==='work')body=`<h3>${esc(item.title)}</h3>${item.author?`<p class="tm-attribution">${esc(item.author)}</p>`:''}<p>${esc(item.role)}</p>${sources(item.evidence)}${item.libraryTarget?`<p>${sourceLink(item.libraryTarget.url,'Произведение на полке →')}</p>`:''}`;
    if(kind==='relation')body=`<h3>${esc(item.label)}</h3><p>${esc(item.explanation)}</p>${[item.from,item.to].map(id=>{const t=topics.get(id);return `<p>${action('topic',id,t.title)} ${sourceLink(t.url,'Источник →')}</p>`;}).join('')}<small>${esc(item.attribution)}</small>${(item.datedContexts||[]).map(c=>`<p>${esc(c.title)} · ${c.year}</p>`).join('')}`;
    return `<button type="button" class="tm-card-close" data-card-close aria-label="Закрыть карточку">✕</button>${body}`;
  }
  function showDetail(value) {
    detail=value; const card=dialog.querySelector('.tm-card');card.innerHTML=detailContent();card.hidden=!detail;card.scrollTop=0;
    const active=detail?.kind==='topic'?detail.id:null;
    svg.querySelectorAll('.tm-edge').forEach(g=>g.classList.toggle('dim',!!active&&g.dataset.from!==active&&g.dataset.to!==active));
    svg.querySelectorAll('.tm-node').forEach(g=>g.classList.toggle('chosen',!!detail&&g.dataset.kind===detail.kind&&g.dataset.id===detail.id));
  }
  function wrap(text,limit=21) {
    const result=[]; let row='';
    for(const word of text.split(/\s+/).flatMap(w=>w.length>limit?(w.match(new RegExp('.{1,'+limit+'}', 'g'))||[w]):[w])) {if(row.length+word.length>limit && row){result.push(row);row='';}row+=(row?' ':'')+word;}
    if(row)result.push(row);return result;
  }
  function label(text,x,y,limit=21,size=18) {
    const rows=wrap(text,limit), step=size*1.18;
    return el('text',{x,y, 'text-anchor':'middle','font-size':size},rows.map((row,i)=>el('tspan',{x,y:y+(i-(rows.length-1)/2)*step+size*.32},esc(row))).join(''));
  }
  const measure=document.createElement('canvas').getContext('2d');
  function circleLabel(n) {
    const family=getComputedStyle(dialog).getPropertyValue('--f-disp').trim();
    let size=n.r>115?24:20, rows;
    for(;size>=12;size--){
      measure.font=`${size}px ${family}`;
      const max=n.r*1.65; rows=[];let row='';
      const words=n.title.replace(/-/g,'- ').split(/\s+/);
      for(const word of words){
        if(row&&measure.measureText(row+' '+word).width>max){rows.push(row);row='';}
        if(measure.measureText(word).width>max){
          for(const char of word){if(measure.measureText(row+char+'-').width>max){rows.push(row+'-');row='';}row+=char;}
        }else row+=(row?' ':'')+word;
      }
      if(row)rows.push(row);
      if(rows.every((row,i)=>{const y=(i-(rows.length-1)/2)*size*1.18;return Math.hypot(measure.measureText(row).width/2,Math.abs(y)+size*.65)<n.r-11;}))break;
    }
    return el('text',{'text-anchor':'middle','font-size':size},rows.map((row,i)=>el('tspan',{x:0,y:(i-(rows.length-1)/2)*size*1.18+size*.32},esc(row))).join(''));
  }
  function nodeSvg(n) {
    return el('g',{class:`tm-node ${n.kind==='cluster'?'tm-cluster':''} ${n.context?'tm-context':''}`,transform:`translate(${n.x} ${n.y})`,'data-kind':n.kind,'data-id':n.id,tabindex:0,role:'button','aria-label':n.title},
      el('circle',{r:n.r,class:'outer'})+el('circle',{r:n.r-5,class:'inner'})+circleLabel(n)+el('circle',{cx:n.r*.65,cy:-n.r*.65,r:3,class:'dot'}));
  }
  function routeEdge(edge,nodes,labels) {
    const a=nodes.find(n=>n.id===edge.from),b=nodes.find(n=>n.id===edge.to);
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    const obstacles=nodes.filter(n=>n!==a&&n!==b);
    let best;
    // Route around circles, then find a free position for the label on that curve.
    for(const bend of [0,70,-70,140,-140,230,-230,350,-350,500,-500,700,-700]){
      const cx=(a.x+b.x)/2-dy/L*bend,cy=(a.y+b.y)/2+dx/L*bend;
      const la=Math.hypot(cx-a.x,cy-a.y)||1,lb=Math.hypot(cx-b.x,cy-b.y)||1;
      const sx=a.x+(cx-a.x)/la*(a.r+4),sy=a.y+(cy-a.y)/la*(a.r+4),tx=b.x+(cx-b.x)/lb*(b.r+4),ty=b.y+(cy-b.y)/lb*(b.r+4);
      const point=t=>({x:(1-t)**2*sx+2*t*(1-t)*cx+t*t*tx,y:(1-t)**2*sy+2*t*(1-t)*cy+t*t*ty});
      let score=Math.abs(bend)*.04;
      for(let i=1;i<40;i++){const p=point(i/40);for(const n of obstacles)score+=Math.max(0,n.r+15-Math.hypot(p.x-n.x,p.y-n.y))*5;}
      let labelBest;
      const hw=edge.label.length*3.6+6;
      for(const t of [.5,.35,.65,.23,.77]){
        const p=point(t);p.y-=10;let cost=Math.abs(t-.5)*20;
        for(const n of nodes){const ex=Math.max(Math.abs(p.x-n.x)-hw,0),ey=Math.max(Math.abs(p.y-n.y)-10,0);cost+=Math.max(0,n.r+10-Math.hypot(ex,ey))*30;}
        for(const l of labels)if(Math.abs(p.x-l.x)<hw+l.hw&&Math.abs(p.y-l.y)<30)cost+=1000;
        if(!labelBest||cost<labelBest.cost)labelBest={...p,hw,cost};
      }
      score+=labelBest.cost;
      if(!best||score<best.score)best={score,points:Array.from({length:41},(_,i)=>point(i/40)),path:`M${sx},${sy} Q${cx},${cy} ${tx},${ty}`,label:labelBest};
    }
    labels.push(best.label);return {...edge,...best,a,b};
  }
  function edgeSvg(edge) {
    const {a,b}=edge;
    const family=['contrasts','distinguishes','qualifies'].includes(edge.type)?'contrast':edge.type==='revises'?'revision':'relation';
    return el('g',{class:`tm-edge ${family}`,'data-kind':'relation','data-id':edge.id,'data-from':edge.from,'data-to':edge.to,tabindex:0,role:'button','aria-label':`${a.title}: ${edge.labelText}: ${b.title}`},
      el('path',{d:edge.path,class:'edge-hit'})+el('path',{d:edge.path,class:'edge-line'})+el('text',{x:edge.label.x,y:edge.label.y,'text-anchor':'middle',class:'edge-label'},esc(edge.labelText)));
  }
  // Deterministic spring layout. Node coordinates never depend on viewport width or device.
  function arrange(nodes,edges) {
    if(!nodes.length)return;
    const radius=Math.max(260,Math.sqrt(nodes.length)*140);
    nodes.forEach((n,i)=>{const a=i*2.3999632297; const r=radius*Math.sqrt((i+.5)/nodes.length);n.x=Math.cos(a)*r*1.5;n.y=Math.sin(a)*r*.8;});
    const lookup=new Map(nodes.map(n=>[n.id,n]));
    for(let step=0;step<350;step++){
      const forces=nodes.map(n=>({x:-n.x*.003,y:-n.y*.03}));
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
        const f=Math.max(0,(a.r+b.r+110-d)*.23)+8000/(d*d);
        forces[i].x-=dx/d*f;forces[i].y-=dy/d*f;forces[j].x+=dx/d*f;forces[j].y+=dy/d*f;
      }
      for(const e of edges){const a=lookup.get(e.from),b=lookup.get(e.to);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,f=(d-390)*.05;const i=nodes.indexOf(a),j=nodes.indexOf(b);forces[i].x+=dx/d*f;forces[i].y+=dy/d*f;forces[j].x-=dx/d*f;forces[j].y-=dy/d*f;}
      nodes.forEach((n,i)=>{n.x+=clamp(forces[i].x,-20,20);n.y+=clamp(forces[i].y,-20,20);});
    }    // Resolve the few remaining collisions independently of spring forces.
    for(let pass=0;pass<80;pass++){
      let moved=false;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,gap=a.r+b.r+40-d;
        if(gap>0.1){const shift=gap/2+.1;a.x-=dx/d*shift;a.y-=dy/d*shift;b.x+=dx/d*shift;b.y+=dy/d*shift;moved=true;}
      }
      if(!moved)break;
    }
  }
  function buildScene() {
    const key=pageKey();if(scenes.has(key))return scenes.get(key);
    const gs=data.clusters.filter(c=>c.book===book).sort((a,b)=>(a.kind==='context')-(b.kind==='context'));
    let nodes=[],edges=[],decorations='', structural='';
    if(mode==='thoughts'||!selected){
      gs.forEach((g,i)=>{const a=(i/gs.length)*Math.PI*2-Math.PI/2;nodes.push({id:g.id,kind:'cluster',title:g.title,x:Math.cos(a)*700,y:Math.sin(a)*440,r:137,context:g.kind==='context'});});
      decorations=el('text',{x:0,y:0,'text-anchor':'middle',class:'tm-center'},mode==='thoughts'?'Ключевые мысли':'Выберите мысль');
    } else {
      const g=groups.get(selected);
      if(mode==='topics'){
        nodes=g.topicIds.map(id=>{const t=topics.get(id);return {id,kind:'topic',title:t.title,r:89};});
        edges=data.relations.filter(e=>g.topicIds.includes(e.from)&&g.topicIds.includes(e.to));
        arrange(nodes,edges);
      }else if(mode==='works'){
        nodes=data.works.filter(w=>w.clusters.includes(g.id)).map(w=>({id:w.id,kind:'work',title:w.title,r:95}));arrange(nodes,[]);
      }else{
        const h=data.hierarchies.find(h=>h.cluster===g.id);
        const gap=320, top=210;
        nodes.push({id:g.id,kind:'cluster',title:g.title,x:0,y:0,r:130});
        h.branches.forEach((branch,j)=>{
          const x=(j-(h.branches.length-1)/2)*gap;
          structural+=el('path',{d:`M0 135 V${top-65} H${x} V${top-25}`,class:'tm-structural'});
          decorations+=label(branch.title,x,top,24,17);
          branch.claimIds.forEach((id,i)=>{const claim=data.claims.find(c=>c.id===id),t=topics.get(claim.topic),y=top+175+i*240;nodes.push({id:t.id,kind:'topic',title:t.title,x,y,r:91});structural+=el('path',{d:`M${x} ${i?y-240+91:top+45} V${y-91}`,class:'tm-structural'});});
        });
        edges=data.relations.filter(e=>g.topicIds.includes(e.from)&&g.topicIds.includes(e.to));
      }
      if(!nodes.length)decorations+=label('Проверенные примеры здесь не выделены',0,0,35,22);
    }
    const bounds=nodes.length?{x:Math.min(...nodes.map(n=>n.x-n.r))-100,y:Math.min(...nodes.map(n=>n.y-n.r))-75,w:Math.max(...nodes.map(n=>n.x+n.r))-Math.min(...nodes.map(n=>n.x-n.r))+200,h:Math.max(...nodes.map(n=>n.y+n.r))-Math.min(...nodes.map(n=>n.y-n.r))+150}:{x:-400,y:-200,w:800,h:400};
    if(selected&&mode!=='thoughts'&&mode!=='claims'){
      const x=bounds.x+bounds.w/2,y=bounds.y+bounds.h/2;
      decorations=el('ellipse',{cx:x,cy:y,rx:bounds.w/2-20,ry:bounds.h/2-20,class:'tm-boundary'})+decorations;
    }
    const labels=[];edges=edges.map(e=>({...routeEdge(e,nodes,labels),labelText:e.label}));
    // Include routed curves and their captions in “Fit”; no edge may be clipped.
    const points=edges.flatMap(e=>e.points.concat([{x:e.label.x-e.label.hw,y:e.label.y-20},{x:e.label.x+e.label.hw,y:e.label.y+20}]));
    if(points.length){const right=Math.max(bounds.x+bounds.w,...points.map(p=>p.x+50)),bottom=Math.max(bounds.y+bounds.h,...points.map(p=>p.y+50));bounds.x=Math.min(bounds.x,...points.map(p=>p.x-50));bounds.y=Math.min(bounds.y,...points.map(p=>p.y-50));bounds.w=right-bounds.x;bounds.h=bottom-bounds.y;}
    const result={nodes,edges,bounds,decorations,structural};scenes.set(key,result);return result;
  }
  function drawScene() {
    scene=buildScene();full=scene.bounds;
    svg.innerHTML=`<g class="tm-decorations">${scene.decorations}${scene.structural}</g><g class="tm-edges">${scene.edges.map(e=>edgeSvg(e)).join('')}</g><g class="tm-nodes">${scene.nodes.map(nodeSvg).join('')}</g><g class="tm-ink" aria-label="Рисунки"></g>`;
    drawInk();
    const old=views.get(pageKey());if(old){vb={...old};resizeView();}else fit(true);
    showDetail(detail); updateTools();
  }
  function setVB(){if(!vb)return;svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);views.set(pageKey(),{...vb});}
  function fit(initial=false){const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;let s=Math.max(full.w/r.width,full.h/r.height);if(initial&&r.width<650)s=Math.min(s,2.1);if(initial&&mode==='claims')s=Math.min(s,1.3);vb={x:full.x+full.w/2-r.width*s/2,y:full.y+full.h/2-r.height*s/2,w:r.width*s,h:r.height*s};if(initial&&mode==='claims')vb.y=full.y;setVB();}
  function resizeView(){if(!vb)return;const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;const h=vb.w*r.height/r.width;vb.y+=(vb.h-h)/2;vb.h=h;setVB();}
  function world(x,y){const r=svg.getBoundingClientRect();return {x:vb.x+(x-r.left)/r.width*vb.w,y:vb.y+(y-r.top)/r.height*vb.h};}
  function zoom(f,x,y){if(!vb)return;const p=x==null?{x:vb.x+vb.w/2,y:vb.y+vb.h/2}:world(x,y);const k=clamp(vb.w/f,160,Math.max(full.w,full.h)*4)/vb.w;vb={x:p.x-(p.x-vb.x)*k,y:p.y-(p.y-vb.y)*k,w:vb.w*k,h:vb.h*k};setVB();}
  function drawInk(){const g=svg?.querySelector('.tm-ink');if(!g)return;const all=pending?.erase?pending.result:strokes();g.innerHTML=[...all,...(pending?.stroke?[pending.stroke]:[])].map(s=>el('polyline',{points:s.points.map(p=>`${p[0]},${p[1]}`).join(' '),class:`k-${s.color}`,'stroke-width':s.width})).join('');updateTools();}
  function updateTools(){dialog.dataset.tool=tool;dialog.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===tool));dialog.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.color===color));dialog.querySelectorAll('[data-width]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.width)===width));const u=dialog.querySelector('[data-undo]'),c=dialog.querySelector('[data-clear]');if(u)u.disabled=!undo.some(x=>x.page===pageKey());if(c)c.disabled=!strokes().length;}
  function toolbar(){
    const gs=data.clusters.filter(c=>c.book===book);
    dialog.innerHTML=`<header class="sch-bar tm-bar"><div class="sch-t"><span class="gb-seal sch-seal" aria-hidden="true"><span class="emb emb-shield"></span></span><span><b>Схема связей</b><small>${esc(titles[book])}</small></span></div><div class="sch-tools"><button type="button" class="sch-b" data-tool="view">☞ Смотреть</button><button type="button" class="sch-b" data-tool="pen">✎ Перо</button><div class="sch-colors" aria-label="Цвет">${Object.entries(colors).map(([key,name])=>`<button type="button" class="sch-c" data-sc="${key}" data-color="${key}" aria-label="${name}"></button>`).join('')}</div><div class="sch-ws" aria-label="Толщина">${[1.5,2.8,5].map(w=>`<button type="button" class="sch-w" data-width="${w}" aria-label="Толщина ${w}"><i style="width:${w*2}px;height:${w*2}px"></i></button>`).join('')}</div><button type="button" class="sch-b" data-tool="erase">♢ Ластик</button><button type="button" class="sch-b" data-undo>↶ Отменить</button><button type="button" class="sch-b" data-clear>Стереть всё</button></div><button type="button" class="sch-b tm-close" data-close aria-label="Закрыть схему">✕</button></header><nav class="tm-nav" aria-label="Режим схемы">${modes.map(([key,title])=>`<button class="sch-b" type="button" data-mode="${key}" aria-pressed="${mode===key}">${title}</button>`).join('')}<label class="tm-group-label">Мысль <select data-group aria-label="Выбрать мысль"><option value="">Все мысли</option>${gs.map(g=>`<option value="${g.id}" ${selected===g.id?'selected':''}>${esc(g.title)}</option>`).join('')}</select></label><button type="button" class="sch-b" data-list>Список</button>${legacyAvailable()?'<button type="button" class="sch-b" data-legacy>Прежние пометки</button>':''}</nav><main class="tm-viewport"><svg class="tm-svg" xmlns="${NS}" tabindex="0" aria-label="Полотно схемы: двигайте, увеличивайте и нажимайте узлы"></svg><aside class="tm-card" aria-label="Карточка выбранного объекта" aria-live="polite" hidden></aside><aside class="tm-list" aria-label="Список узлов и связей" hidden></aside><div class="tm-legend">${mode==='claims'?'<span class="structure">Детализация, не вывод</span>':''}<span class="line">Связь</span><span class="contrast">Различие / уточнение</span><span class="revision">Изменение позиции</span></div><div class="sch-zoom"><button type="button" class="sch-b" data-zoom="-" aria-label="Уменьшить">−</button><button type="button" class="sch-b" data-zoom="fit">Вписать</button><button type="button" class="sch-b" data-zoom="+" aria-label="Увеличить">+</button></div><p class="tm-status" data-status role="status" hidden></p></main>`;
    for(const name of ['view','pen','erase']){const button=dialog.querySelector(`[data-tool="${name}"]`),original=document.querySelector(`#scheme [data-st="${name}"]`);button.innerHTML=original.innerHTML;button.setAttribute('aria-label',original.textContent.trim());button.title=original.title;}
    dialog.querySelector('[data-undo]').innerHTML=document.querySelector('#sch-undo').innerHTML;dialog.querySelector('[data-undo]').setAttribute('aria-label','Отменить');
    viewport=dialog.querySelector('.tm-viewport');svg=dialog.querySelector('.tm-svg');bindCanvas();drawScene();if(inkBlocked)status('Хранилище рисунков недоступно. Исходные данные не изменены.');
  }
  function openList(){const panel=dialog.querySelector('.tm-list');panel.hidden=!panel.hidden;if(panel.hidden)return;const ids=scene.nodes.map(n=>n.id);const edges=data.relations.filter(r=>ids.includes(r.from)||ids.includes(r.to));panel.innerHTML=`<button type="button" data-list class="tm-card-close" aria-label="Закрыть список">✕</button><h3>Узлы и связи</h3>${scene.nodes.map(n=>action(n.kind,n.id,n.title)).join('')}<h4>Связи</h4>${edges.map(e=>action('relation',e.id,`${topics.get(e.from).title} — ${e.label} → ${topics.get(e.to).title}`)).join('')}`;}
  function choose(kind,id){
    const item=kind==='cluster'?groups.get(id):kind==='topic'?topics.get(id):kind==='work'?works.get(id):relations.get(id);if(!item)return;
    if(kind==='cluster'){selected=id;dialog.querySelector('[data-group]').value=id;if(mode!=='thoughts'){detail={kind,id};toolbar();return;}}
    showDetail({kind,id});
  }
  function eraseAt(p){const threshold=vb.w/svg.getBoundingClientRect().width*14;pending.result=pending.result.filter(s=>!s.points.some((b,i)=>{const a=s.points[Math.max(0,i-1)],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/l,0,1):0;return Math.hypot(a[0]+t*dx-p.x,a[1]+t*dy-p.y)<threshold;}));}
  function cancelGesture(){pending=null;pointerState=null;pointers.clear();drawInk();}
  function bindCanvas(){
    svg.addEventListener('pointerdown',e=>{
      if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();if(e.pointerType==='pen')penSeen=true;
      // Palm contacts cannot interrupt an active stylus stroke.
      if(pending&&e.pointerType==='touch'&&penSeen)return;
      svg.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});suppressClick=false;
      if(pointers.size===2){pending=null;drawInk();const [a,b]=[...pointers.values()];pointerState={pinch:true,d:Math.hypot(a.x-b.x,a.y-b.y),vb:{...vb},center:world((a.x+b.x)/2,(a.y+b.y)/2)};return;}
      const p=world(e.clientX,e.clientY);
      if(tool!=='view'&&(e.pointerType!=='touch'||!penSeen)){
        const before=strokes().slice();pending=tool==='erase'?{erase:true,before,result:before.slice()}:{before,stroke:{color,width,points:[[p.x,p.y,e.pressure||.5]]}};if(pending.erase)eraseAt(p);drawInk();
      }else pointerState={x:e.clientX,y:e.clientY,vb:{...vb}};
    });
    svg.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pending){const batch=e.getCoalescedEvents?.();for(const v of batch?.length?batch:[e]){const p=world(v.clientX,v.clientY);if(pending.erase)eraseAt(p);else pending.stroke.points.push([p.x,p.y,v.pressure||.5]);}suppressClick=true;drawInk();return;}
      const r=svg.getBoundingClientRect(),state=pointerState;if(!state)return;
      if(state.pinch&&pointers.size===2){const [a,b]=[...pointers.values()],k=clamp(state.d/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),160/state.vb.w,Math.max(full.w,full.h)*4/state.vb.w);const w=state.vb.w*k,h=state.vb.h*k;vb={x:state.center.x-((a.x+b.x)/2-r.left)/r.width*w,y:state.center.y-((a.y+b.y)/2-r.top)/r.height*h,w,h};suppressClick=true;setVB();}
      else if(!state.pinch){const dx=e.clientX-state.x,dy=e.clientY-state.y;if(Math.abs(dx)+Math.abs(dy)>3){suppressClick=true;vb={...state.vb,x:state.vb.x-dx/r.width*state.vb.w,y:state.vb.y-dy/r.height*state.vb.h};setVB();}}
    });
    const end=e=>{
      if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);
      if(e.type==='pointercancel'){cancelGesture();suppressClick=true;return;}
      if(pending){const p=pending;pending=null;if(p.stroke&&p.stroke.points.length===1){const a=p.stroke.points[0];p.stroke.points.push([a[0]+.1,a[1],a[2]]);}const next=p.erase?p.result:p.before.concat([p.stroke]);if(JSON.stringify(next)!==JSON.stringify(p.before)&&commitInk(next,p.before))undo.push({page:pageKey(),before:p.before,after:next});drawInk();suppressClick=true;}
      pointerState=null;if(pointers.size===1){const a=[...pointers.values()][0];pointerState={x:a.x,y:a.y,vb:{...vb}};}
      if(!pointers.size && !suppressClick && tool==='view'){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-kind]');if(target)choose(target.dataset.kind,target.dataset.id);else showDetail(null);}
    };
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
    svg.addEventListener('keydown',e=>{const n=e.target.closest('[data-kind]');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose(n.dataset.kind,n.dataset.id);}else if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key.startsWith('Arrow')){e.preventDefault();const d=vb.w*.08;vb.x+=e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0;vb.y+=e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0;setVB();}});
  }
  async function open(){const id=document.body.dataset.book;if(!titles[id])return;try{
    if(!data){const response=await fetch('./data/theory-map.json');if(!response.ok)throw Error();data=await response.json();topics=new Map(data.topics.map(x=>[x.id,x]));groups=new Map(data.clusters.map(x=>[x.id,x]));works=new Map(data.works.map(x=>[x.id,x]));relations=new Map(data.relations.map(x=>[x.id,x]));}
    if(book!==id){book=id;selected=null;detail=null;mode='thoughts';}tool='view';penSeen=false;
    if(!dialog.open)dialog.showModal();toolbar();
  }catch(_){if(dialog.open)dialog.close();alert('Не удалось открыть схему. Обновите приложение при подключении к сети.');}}
  launch.addEventListener('click',open);
  document.fonts?.addEventListener('loadingdone',()=>{if(dialog.open)svg.querySelector('.tm-nodes').innerHTML=scene.nodes.map(nodeSvg).join('');});
  dialog.addEventListener('click',async e=>{
    const target=e.target.closest('button,a');if(!target)return;
    if(target.hasAttribute('data-close')){cancelGesture();dialog.close();launch.focus();return;}
    if(target.hasAttribute('data-card-close')){showDetail(null);return;}
    if(target.hasAttribute('data-source')){dialog.close();return;}
    if(target.hasAttribute('data-list')){openList();return;}
    if(target.dataset.kind){choose(target.dataset.kind,target.dataset.id);return;}
    if(target.dataset.tool){cancelGesture();tool=target.dataset.tool;penSeen=false;updateTools();return;}
    if(target.dataset.color){color=target.dataset.color;updateTools();return;}
    if(target.dataset.width){width=Number(target.dataset.width);updateTools();return;}
    if(target.dataset.zoom){if(target.dataset.zoom==='fit')fit();else zoom(target.dataset.zoom==='+'?1.25:.8);return;}
    if(target.dataset.mode){cancelGesture();mode=target.dataset.mode;toolbar();return;}
    if(target.dataset.explore){selected=target.dataset.explore;mode='topics';detail=null;toolbar();return;}
    if(target.hasAttribute('data-undo')){let i=undo.length-1;while(i>=0&&undo[i].page!==pageKey())i--;if(i>=0&&commitInk(undo[i].before,undo[i].after))undo.splice(i,1);drawInk();return;}
    if(target.hasAttribute('data-clear')){const before=strokes();if(before.length&&confirm('Стереть пометки на этом представлении?')&&commitInk([],before)){undo.push({page:pageKey(),before,after:[]});drawInk();}return;}
    if(target.hasAttribute('data-legacy')){
      try{if(!window.PolkaLegacyTheoryOpen)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./theory-map-legacy.js';s.onload=resolve;s.onerror=reject;document.body.append(s);});dialog.close();window.PolkaLegacyTheoryOpen();}catch(_){status('Не удалось открыть прежнюю схему. Исходные рисунки сохранены.');}
    }
  });
  dialog.addEventListener('change',e=>{if(e.target.matches('[data-group]')){cancelGesture();selected=e.target.value||null;detail=null;toolbar();}});
  dialog.addEventListener('cancel',()=>cancelGesture());
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();dialog.querySelector('[data-undo]').click();}});
  new ResizeObserver(()=>{if(dialog.open&&vb)resizeView();}).observe(dialog);
  window.addEventListener('storage',e=>{if(e.key===KEY&&!pending){try{cachedInk=readInk();inkBlocked=false;if(dialog.open)drawInk();}catch(_){inkBlocked=true;status('Не удалось прочитать обновлённые пометки.');}}});
})();
