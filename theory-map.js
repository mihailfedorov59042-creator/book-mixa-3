(() => {
  'use strict';
  const titles = {frye:'Нортроп Фрай · Анатомия критики', ne:'Аристотель · Никомахова этика', barthes:'Ролан Барт · Избранные работы'};
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'ib theory-open'; button.textContent = 'Схема';
  button.setAttribute('aria-label', 'Открыть схему теории');
  document.querySelector('#btn-sch').after(button);
  const dialog = document.createElement('dialog'); dialog.className = 'theory-dialog';
  dialog.setAttribute('aria-label', 'Схема теории');
  document.body.append(dialog);
  let data, currentBook, mode = 'thoughts', selected = null, detail = null, scale = 1;
  const inkKey = 'polka-theory-ink-v1';
  let ink = {}, inkTool = 'view', inkColor = 'ink', inkWidth = 3, undo = [], stroke = null, saveError = false, inkReadOnly = false;
  try { const value = JSON.parse(localStorage.getItem(inkKey) || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid ink'); ink = value; } catch (_) { saveError = true; inkReadOnly = true; }
  const inkPage = () => `${currentBook}:${mode}:${mode === 'thoughts' ? 'overview' : (selected || 'overview')}`;
  const inkStrokes = () => Array.isArray(ink[inkPage()]) ? ink[inkPage()] : [];
  function saveInk(strokes) {
    if (inkReadOnly) return false;
    const next = {...ink, [inkPage()]: strokes};
    try { localStorage.setItem(inkKey, JSON.stringify(next)); ink = next; saveError = false; }
    catch (_) { saveError = true; }
    const status = dialog.querySelector('.theory-ink-status');
    if (status) status.textContent = saveError ? 'Не удалось сохранить пометки на устройстве.' : 'Пометки сохранены на устройстве.';
    return !saveError;
  }
  function renderInk() {
    const svg = dialog.querySelector('.theory-ink'); if (!svg) return;
    svg.replaceChildren();
    for (const s of [...inkStrokes(), ...(stroke && stroke.points.length ? [stroke] : [])]) {
      if (!Array.isArray(s.points) || !s.points.length) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('points', s.points.map(p => `${p[0]},${p[1]}`).join(' '));
      path.setAttribute('class', `theory-ink-${['ink','cin','az','vert'].includes(s.color) ? s.color : 'ink'}`);
      path.setAttribute('stroke-width', String(Math.max(1, Math.min(8, Number(s.width) || 3))));
      path.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(path);
    }
  }
  function setupInk() {
    const svg = dialog.querySelector('.theory-ink'); if (!svg) return;
    svg.classList.toggle('drawing', inkTool !== 'view'); renderInk();
    let active = null, before = null;
    const point = e => { const r = svg.getBoundingClientRect(); return [Math.round((e.clientX-r.left)/r.width*10000), Math.round((e.clientY-r.top)/r.height*10000)]; };
    const erase = p => {
      const r = svg.getBoundingClientRect();
      const hit = s => s.points.some((q, i) => {
        const a = s.points[Math.max(0, i-1)];
        const ax = (a[0]-p[0])*r.width/10000, ay = (a[1]-p[1])*r.height/10000;
        const bx = (q[0]-p[0])*r.width/10000, by = (q[1]-p[1])*r.height/10000;
        const dx = bx-ax, dy = by-ay, length = dx*dx+dy*dy;
        const t = length ? Math.max(0, Math.min(1, -(ax*dx+ay*dy)/length)) : 0;
        return Math.hypot(ax+t*dx, ay+t*dy) < 18;
      });
      const old = inkStrokes(), next = old.filter(s => !hit(s));
      if (next.length !== old.length) { ink = {...ink, [inkPage()]: next}; renderInk(); }
    };
    svg.addEventListener('pointerdown', e => {
      if (inkTool === 'view' || active !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); active = e.pointerId; before = inkStrokes().slice(); svg.setPointerCapture(active);
      if (inkTool === 'erase') erase(point(e));
      else { stroke = {color:inkColor, width:inkWidth, points:[point(e)]}; renderInk(); }
    });
    svg.addEventListener('pointermove', e => {
      if (active !== e.pointerId) return;
      e.preventDefault();
      for (const event of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) {
        if (inkTool === 'erase') erase(point(event)); else if (stroke) stroke.points.push(point(event));
      }
      renderInk();
    });
    const finish = e => {
      if (active !== e.pointerId) return;
      active = null;
      if (e.type === 'pointercancel') { ink = {...ink, [inkPage()]: before}; stroke = null; renderInk(); return; }
      let next = inkStrokes();
      if (stroke) { if (stroke.points.length === 1) stroke.points.push([stroke.points[0][0]+1,stroke.points[0][1]+1]); next = next.concat([stroke]); }
      stroke = null;
      if (JSON.stringify(next) !== JSON.stringify(before)) {
        if (saveInk(next)) undo.push({page:inkPage(), strokes:before});
        else ink = {...ink, [inkPage()]: before};
      }
      renderInk();
    };
    svg.addEventListener('pointerup', finish); svg.addEventListener('pointercancel', finish);
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getTopic = id => data.topics.find(t => t.id === id);
  const sourceLinks = refs => (refs || []).map(id => data.sources[id]).filter(Boolean).map(s => `<a href="${escape(new URL(s.url).hash)}" data-source>${escape(s.note ? 'Примечание ' + s.note : (s.location || 'Место в тексте'))}</a>`).join(' · ');
  const topicLink = t => `<a href="${escape(new URL(t.url).hash)}" data-source>Открыть место в книге</a>`;
  const objectButton = (kind, id, label, extra = '') => `<button type="button" class="theory-node ${extra}" data-kind="${kind}" data-id="${escape(id)}">${escape(label)}</button>`;
  function card() {
    if (!detail) return '<p>Выберите круг, тему, произведение или связь.</p>';
    const {kind, id} = detail;
    const o = kind === 'cluster' ? data.clusters.find(x=>x.id===id) : kind === 'topic' ? getTopic(id) : kind === 'work' ? data.works.find(x=>x.id===id) : data.relations.find(x=>x.id===id);
    if (!o) return '';
    if (kind === 'cluster') return `<h3>${escape(o.title)}</h3><p>${escape(o.summary)}</p><p>${sourceLinks(o.evidence)}</p>`;
    if (kind === 'topic') return `<h3>${escape(o.title)}</h3><p>${escape(o.summary)}</p><small>${escape(o.attribution)} · ${escape(o.location)}</small><p>${topicLink(o)}</p>`;
    if (kind === 'work') return `<h3>${escape(o.title)}</h3>${o.author ? `<p>${escape(o.author)}</p>` : ''}<p>${escape(o.role)}</p><p>${sourceLinks(o.evidence)}</p>${o.libraryTarget ? `<p><a data-source href="${escape(new URL(o.libraryTarget.url).hash)}">Открыть произведение на полке</a></p>` : ''}`;
    const a = getTopic(o.from), b = getTopic(o.to);
    return `<h3>${escape(o.label)}</h3><p>${escape(a.title)} → ${escape(b.title)}</p><p>${escape(o.explanation)}</p><small>${escape(o.attribution)}</small><p>${topicLink(a)} · ${topicLink(b)}</p><p>${objectButton('topic', a.id, a.title)} ${objectButton('topic', b.id, b.title)}</p>`;
  }
  function render() {
    const previousScroll = dialog.querySelector('.theory-scroll');
    const position = previousScroll ? [previousScroll.scrollLeft, previousScroll.scrollTop] : [0, 0];
    const groups = data.clusters.filter(c=>c.book===currentBook).sort((a,b)=>(a.kind==='context')-(b.kind==='context'));
    const group = groups.find(c=>c.id===selected);
    let content = '';
    if (mode === 'thoughts') {
      content = `<div class="theory-circles">${groups.map(c=>objectButton('cluster', c.id, c.title, 'theory-large' + (c.kind==='context'?' theory-context':'') + (selected===c.id?' active':''))).join('')}</div>`;
    } else if (!group) {
      content = '<p>Сначала выберите крупную мысль.</p>' + `<div class="theory-circles">${groups.map(c=>objectButton('cluster',c.id,c.title,'theory-large')).join('')}</div>`;
    } else if (mode === 'topics') {
      const topics = group.topicIds.map(getTopic).filter(Boolean);
      const edges = data.relations.filter(r=>group.topicIds.includes(r.from) || group.topicIds.includes(r.to));
      content = `<div class="theory-group"><h2>${escape(group.title)}</h2><div class="theory-small theory-linked"><svg class="theory-lines" aria-hidden="true"></svg>${topics.map(t=>objectButton('topic',t.id,t.title,'theory-small-node')).join('')}</div></div><h3>Связи</h3><div class="theory-edges">${edges.map(r=>objectButton('relation',r.id,`${getTopic(r.from).title} — ${r.label} → ${getTopic(r.to).title}`,'theory-edge')).join('')}</div>`;
    } else if (mode === 'works') {
      const works = data.works.filter(w=>w.clusters.includes(group.id));
      content = `<div class="theory-group"><h2>${escape(group.title)}</h2><div class="theory-small">${works.map(w=>objectButton('work',w.id,w.title,'theory-small-node')).join('') || '<p>Проверенные примеры для этой мысли не выделены.</p>'}</div></div>`;
    } else {
      const h = data.hierarchies.find(h=>h.cluster===group.id);
      content = `<div class="theory-tree"><h2>${escape(group.title)}</h2>${h.branches.map(b=>`<section><h3>${escape(b.title)}</h3>${b.claimIds.map(id=>{const p=data.claims.find(x=>x.id===id);const t=getTopic(p.topic); return objectButton('topic',t.id,p.statement,'theory-claim') + data.relations.filter(r=>r.from===t.id).map(r=>objectButton('relation',r.id,`↳ ${r.label}: ${getTopic(r.to).title}`,'theory-tree-edge')).join('');}).join('')}</section>`).join('')}</div>`;
    }
    const nav = groups.map(c=>`<option value="${escape(c.id)}" ${c.id===selected?'selected':''}>${escape(c.title)}</option>`).join('');
    const modes = [['thoughts','Мысли'],['topics','Темы и связи'],['works','Произведения'],['claims','Положения']];
    dialog.innerHTML = `<header class="theory-head"><div><b>Схема теории</b><small>${escape(titles[currentBook])}</small></div><button type="button" data-close aria-label="Закрыть">✕</button></header><nav class="theory-modes" aria-label="Режим схемы">${modes.map(([key,label])=>`<button type="button" data-mode="${key}" aria-pressed="${mode===key}">${label}</button>`).join('')}</nav><div class="theory-controls"><label>Мысль <select data-group><option value="">Выберите мысль</option>${nav}</select></label><button type="button" data-zoom="-">−</button><button type="button" data-zoom="+">+</button><button type="button" data-zoom="reset">Обзор</button></div><div class="theory-draw-tools" aria-label="Инструменты пометок"><button type="button" data-ink-tool="view" aria-pressed="${inkTool==='view'}">Смотреть</button><button type="button" data-ink-tool="pen" aria-pressed="${inkTool==='pen'}">Перо</button><button type="button" data-ink-tool="erase" aria-pressed="${inkTool==='erase'}">Ластик</button><label>Цвет <select data-ink-color><option value="ink" ${inkColor==='ink'?'selected':''}>Чернила</option><option value="cin" ${inkColor==='cin'?'selected':''}>Красный</option><option value="az" ${inkColor==='az'?'selected':''}>Синий</option><option value="vert" ${inkColor==='vert'?'selected':''}>Зелёный</option></select></label><label>Толщина <select data-ink-width><option value="2" ${inkWidth===2?'selected':''}>Тонкая</option><option value="3" ${inkWidth===3?'selected':''}>Средняя</option><option value="6" ${inkWidth===6?'selected':''}>Толстая</option></select></label><button type="button" data-ink-undo>Отменить</button><button type="button" data-ink-clear>Стереть всё</button><small class="theory-ink-status" role="status">${saveError?'Не удалось сохранить пометки на устройстве.':'Пометки сохраняются на устройстве.'}</small></div><div class="theory-layout"><main class="theory-scroll" tabindex="0" aria-label="Содержание схемы"><div class="theory-canvas" style="zoom:${scale}">${content}<svg class="theory-ink" viewBox="0 0 10000 10000" preserveAspectRatio="none" aria-label="Поле для рисования"></svg></div></main><aside class="theory-detail" aria-live="polite">${card()}</aside></div>`;
    setupInk();
    const scroller = dialog.querySelector('.theory-scroll');
    scroller.scrollLeft = position[0]; scroller.scrollTop = position[1];
    if (mode === 'topics' && group) requestAnimationFrame(() => {
      const area = dialog.querySelector('.theory-linked'), svg = area && area.querySelector('svg');
      if (!svg) return;
      const bounds = area.getBoundingClientRect();
      const nodes = new Map([...area.querySelectorAll('[data-kind="topic"]')].map(n => [n.dataset.id,n]));
      const ns = 'http://www.w3.org/2000/svg';
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
      for (const edge of data.relations) {
        const a=nodes.get(edge.from), b=nodes.get(edge.to); if (!a || !b) continue;
        const x=a.getBoundingClientRect(), y=b.getBoundingClientRect(), line=document.createElementNS(ns,'line');
        line.setAttribute('x1',x.left+x.width/2-bounds.left); line.setAttribute('y1',x.top+x.height/2-bounds.top);
        line.setAttribute('x2',y.left+y.width/2-bounds.left); line.setAttribute('y2',y.top+y.height/2-bounds.top);
        line.setAttribute('class','theory-thread'); line.dataset.kind='relation'; line.dataset.id=edge.id;
        const title=document.createElementNS(ns,'title'); title.textContent=edge.label; line.append(title); svg.append(line);
      }
    });
  }
  button.addEventListener('click', async () => {
    const book = document.body.dataset.book; if (!titles[book]) return;
    try {
      if (!data) { const response = await fetch('./data/theory-map.json'); if (!response.ok) throw Error(); data = await response.json(); }
      if (currentBook !== book) { currentBook=book; selected=null; detail=null; mode='thoughts'; scale=1; }
      render(); dialog.showModal();
    } catch (error) { console.error('Theory map:', error); alert('Не удалось открыть данные схемы. Обновите приложение при подключении к сети.'); }
  });
  dialog.addEventListener('click', e => {
    const close = e.target.closest('[data-close]'); if (close) {dialog.close(); return;}
    const link = e.target.closest('[data-source]'); if (link) { dialog.close(); return; }
    const tool = e.target.closest('[data-ink-tool]'); if (tool) { inkTool=tool.dataset.inkTool; render(); return; }
    if (e.target.closest('[data-ink-undo]')) {
      let i = undo.length - 1; while (i >= 0 && undo[i].page !== inkPage()) i--;
      if (i >= 0 && saveInk(undo[i].strokes)) { undo.splice(i, 1); renderInk(); }
      return;
    }
    if (e.target.closest('[data-ink-clear]')) {
      const before = inkStrokes().slice();
      if (before.length && confirm('Стереть все пометки на этом представлении схемы?') && saveInk([])) { undo.push({page:inkPage(), strokes:before}); renderInk(); }
      return;
    }
    const m = e.target.closest('[data-mode]'); if(m) {mode=m.dataset.mode; render(); return;}
    const z=e.target.closest('[data-zoom]'); if(z) {scale=z.dataset.zoom==='reset'?1:Math.max(.7,Math.min(1.6,scale+(z.dataset.zoom==='+'?.15:-.15))); render(); return;}
    const node=e.target.closest('[data-kind]'); if(!node)return;
    detail={kind:node.dataset.kind,id:node.dataset.id};
    if(detail.kind==='cluster') selected=detail.id;
    if(detail.kind==='topic') {const t=getTopic(detail.id); if(!t.clusters.includes(selected)) selected=t.clusters.find(id=>data.clusters.some(c=>c.id===id && c.kind!=='context')) || selected;}
    render();
  });
  dialog.addEventListener('change', e=>{
    if(e.target.matches('[data-group]')) {selected=e.target.value || null; detail=selected?{kind:'cluster',id:selected}:null; render();}
    else if(e.target.matches('[data-ink-color]')) {inkColor=e.target.value;}
    else if(e.target.matches('[data-ink-width]')) {inkWidth=Number(e.target.value);}
  });
  dialog.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
})();
