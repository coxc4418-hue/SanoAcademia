// SanoAcademia — Horario semanal: por aula, profesor o curso, y las clases de cada día
import { store } from '../store.js';
import { esc, emptyState, todayKey, dayKey, addDays, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { DAYS, DAYS_SHORT, WEEK, toMin, fmtHour, catOf, sheetStats } from '../academy.js';
import { printDoc } from '../shared.js';

export function mount(el, { navigate }) {
  let filter = '';
  let day = new Date().getDay();
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Horario</h1><p class="view-sub">La semana completa de la academia: qué grupo, en qué aula y con qué profesor.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="h-print">${icon('print')} Imprimir horario</button><button class="btn btn-primary" id="h-new">${icon('plus')} Nuevo grupo</button></div></div>
    <div class="card card-flush">
      <div class="toolbar"><select class="input" id="h-f" style="max-width:320px"></select><div class="grow"></div><div class="ag-legend hide-sm" id="h-leg"></div></div>
      <div class="day-tabs show-sm" id="h-days"></div>
      <div id="h-grid"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  $('#h-new').onclick = () => navigate('cursos', { newGroup: true });

  function options() {
    $('#h-f').innerHTML = `<option value="">Toda la academia</option>
      ${store.rooms.length ? `<optgroup label="Por aula">${store.rooms.map((r) => `<option value="r:${r.id}">${esc(r.name)}</option>`).join('')}</optgroup>` : ''}
      ${store.liveTeachers.length ? `<optgroup label="Por profesor">${store.liveTeachers.map((t) => `<option value="t:${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>` : ''}
      ${store.liveCourses.length ? `<optgroup label="Por curso">${store.liveCourses.map((c) => `<option value="c:${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>` : ''}`;
    $('#h-f').value = filter;
    $('#h-f').onchange = (e) => { filter = e.target.value; draw(); };
  }
  const groups = () => store.liveGroups.filter((g) => {
    if (!filter) return true;
    const [k, id] = filter.split(':');
    return k === 'r' ? g.room === id : k === 't' ? g.teacherId === id : g.courseId === id;
  });
  function blocks() {
    const out = [];
    for (const g of groups()) for (const s of g.schedule || []) out.push({ g, s, c: store.course(g.courseId) });
    return out;
  }

  function draw() {
    const list = blocks();
    const used = [...new Set(store.courses.filter((c) => list.some((b) => b.c?.id === c.id)))].slice(0, 8);
    $('#h-leg').innerHTML = used.map((c) => `<span><i style="background:${c.color || catOf(c.category).color}"></i>${esc(c.name)}</span>`).join('');
    if (!list.length) { $('#h-grid').innerHTML = `<div class="pd-3">${emptyState('calendar', 'Sin horario', store.liveGroups.length ? 'No hay clases para este filtro.' : 'Crea un grupo con sus días y horas de clase y aparecerá aquí.')}</div>`; $('#h-days').innerHTML = ''; return; }
    const days = WEEK.filter((d) => d !== 0 || list.some((b) => Number(b.s.day) === 0));
    let from = Math.min(...list.map((b) => toMin(b.s.from))); let to = Math.max(...list.map((b) => toMin(b.s.to)));
    from = Math.floor(from / 60) * 60; to = Math.ceil(to / 60) * 60;
    const PX = 0.9; // px por minuto
    const hours = []; for (let m = from; m < to; m += 60) hours.push(m);
    const todayDow = new Date().getDay();
    const col = (d) => {
      const items = list.filter((b) => Number(b.s.day) === d).sort((a, b) => toMin(a.s.from) - toMin(b.s.from));
      // Columnas para clases que se solapan (en aulas distintas)
      const lanes = [];
      for (const it of items) { let i = lanes.findIndex((end) => end <= toMin(it.s.from)); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = toMin(it.s.to); it.lane = i; }
      const n = Math.max(1, lanes.length);
      return `<div class="tt-col ${d === todayDow ? 'is-today' : ''}" style="height:${(to - from) * PX}px">${hours.map((m) => `<i class="tt-line" style="top:${(m - from) * PX}px"></i>`).join('')}
        ${items.map((b) => { const top = (toMin(b.s.from) - from) * PX; const hgt = Math.max(26, (toMin(b.s.to) - toMin(b.s.from)) * PX - 2); const color = b.c?.color || catOf(b.c?.category).color;
          return `<button class="tt-block" data-g="${b.g.id}" style="top:${top}px;height:${hgt}px;left:calc(${b.lane / n * 100}% + 2px);width:calc(${100 / n}% - 4px);--gc:${color}" title="${esc(store.groupLabel(b.g))}"><b>${esc(b.c?.name || 'Curso')}${b.g.name ? ` · ${esc(b.g.name)}` : ''}</b><small>${fmtHour(b.s.from)}–${fmtHour(b.s.to)}</small><small>${esc([store.roomName(b.g.room), (store.teacher(b.g.teacherId)?.name || '').split(' ')[0]].filter(Boolean).join(' · '))}</small></button>`; }).join('')}</div>`;
    };
    $('#h-grid').innerHTML = `<div class="tt hide-sm" style="--cols:${days.length}">
        <div class="tt-head"><span></span>${days.map((d) => `<b class="${d === todayDow ? 'is-today' : ''}">${DAYS[d]}</b>`).join('')}</div>
        <div class="tt-body"><div class="tt-hours" style="height:${(to - from) * PX}px">${hours.map((m) => `<span style="top:${(m - from) * PX}px">${fmtHour(`${Math.floor(m / 60)}:00`)}</span>`).join('')}</div>${days.map(col).join('')}</div>
      </div>
      <div class="show-sm" id="h-mobile"></div>`;
    $('#h-days').innerHTML = days.map((d) => `<button class="${d === day ? 'on' : ''}" data-d="${d}">${DAYS_SHORT[d]}</button>`).join('');
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { day = Number(b.dataset.d); draw(); });
    mobile(list);
    el.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => openGroupCard(b.dataset.g));
  }
  function mobile(list) {
    const items = list.filter((b) => Number(b.s.day) === day).sort((a, b) => toMin(a.s.from) - toMin(b.s.from));
    const date = (() => { const d = new Date(); const diff = (day - d.getDay() + 7) % 7; return dayKey(addDays(d, diff)); })();
    $('#h-mobile').innerHTML = items.length ? `<div class="list" style="padding:6px 10px">${items.map((b) => { const sh = store.sheet(b.g.id, date); const st = sh ? sheetStats(sh) : null;
      return `<button class="list-item class-row linkish" data-g="${b.g.id}" style="width:100%;text-align:left"><span class="class-time" style="--gc:${b.c?.color || catOf(b.c?.category).color}"><b>${fmtHour(b.s.from)}</b><small>${fmtHour(b.s.to)}</small></span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(store.groupLabel(b.g))}</b><div class="t-sub ellipsis">${esc(store.teacher(b.g.teacherId)?.name || 'Sin profesor')}${b.g.room ? ` · ${esc(store.roomName(b.g.room))}` : ''}</div></div>${st ? `<span class="badge badge-success">${st.present}/${st.n}</span>` : ''}</button>`; }).join('')}</div>`
      : `<div class="pd-3">${emptyState('calendar', `Sin clases el ${DAYS[day].toLowerCase()}`)}</div>`;
  }

  async function openGroupCard(id) {
    const { openGroup } = await import('./courses.js');
    openGroup(id, { navigate });
  }

  $('#h-print').onclick = () => {
    const list = blocks();
    const days = WEEK.filter((d) => d !== 0 || list.some((b) => Number(b.s.day) === 0));
    const slots = [...new Set(list.map((b) => `${b.s.from}-${b.s.to}`))].sort();
    const title = filter ? `Horario · ${$('#h-f').selectedOptions[0]?.textContent || ''}` : 'Horario de clases';
    printDoc(title, `<table class="tt-print"><tr><th>Hora</th>${days.map((d) => `<th>${DAYS[d]}</th>`).join('')}</tr>${slots.map((sl) => { const [a, b] = sl.split('-');
      return `<tr><td class="nowrap"><b>${fmtHour(a)}</b><br>${fmtHour(b)}</td>${days.map((d) => `<td>${list.filter((x) => Number(x.s.day) === d && x.s.from === a && x.s.to === b).map((x) => `<div class="tt-cell" style="border-left:3px solid ${x.c?.color || '#4338ca'}"><b>${esc(store.groupLabel(x.g))}</b><br><small>${esc([store.roomName(x.g.room), store.teacher(x.g.teacherId)?.name].filter(Boolean).join(' · '))}</small></div>`).join('')}</td>`).join('')}</tr>`; }).join('')}</table><p class="muted small">Actualizado el ${fmtDate(todayKey())}</p>`, { landscape: true });
  };

  options(); draw();
  const off = store.on('*', (e) => { if (['groups', 'courses', 'teachers', 'settings'].includes(e)) { options(); draw(); } if (e === 'attendance') draw(); });
  return () => off();
}
