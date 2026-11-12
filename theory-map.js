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
    dialog.innerHTML = `<header class="theory-head"><div><b>Схема теории</b><small>${escape(titles[currentBook])}</small></div><button type="button" data-close aria-label="Закрыть">✕</button></header><nav class="theory-modes" aria-label="Режим схемы">${modes.map(([key,label])=>`<button type="button" data-mode="${key}" aria-pressed="${mode===key}">${label}</button>`).join('')}</nav><div class="theory-controls"><label>Мысль <select data-group><option value="">Выберите мысль</option>${nav}</select></label><button type="button" data-zoom="-">−</button><button type="button" data-zoom="+">+</button><button type="button" data-zoom="reset">Обзор</button></div><div class="theory-layout"><main class="theory-scroll" tabindex="0" aria-label="Содержание схемы"><div class="theory-canvas" style="zoom:${scale}">${content}</div></main><aside class="theory-detail" aria-live="polite">${card()}</aside></div>`;
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
    const m = e.target.closest('[data-mode]'); if(m) {mode=m.dataset.mode; render(); return;}
    const z=e.target.closest('[data-zoom]'); if(z) {scale=z.dataset.zoom==='reset'?1:Math.max(.7,Math.min(1.6,scale+(z.dataset.zoom==='+'?.15:-.15))); render(); return;}
    const node=e.target.closest('[data-kind]'); if(!node)return;
    detail={kind:node.dataset.kind,id:node.dataset.id};
    if(detail.kind==='cluster') selected=detail.id;
    if(detail.kind==='topic') {const t=getTopic(detail.id); if(!t.clusters.includes(selected)) selected=t.clusters.find(id=>data.clusters.some(c=>c.id===id && c.kind!=='context')) || selected;}
    render();
  });
  dialog.addEventListener('change', e=>{if(e.target.matches('[data-group]')) {selected=e.target.value || null; detail=selected?{kind:'cluster',id:selected}:null; render();}});
})();
