// SanoAcademia — Asistencia: pasar lista en segundos, avisar inasistencias y ver quién falta mucho
import { store } from '../store.js';
import { esc, emptyState, toast, todayKey, fmtDate, setBusy, confirmDialog, dayKey, addDays, openModal } from '../utils.js';
import { icon } from '../icons.js';
import { ATT, fmtHour, sheetStats, attendanceOf, slotsOn, DAYS, catOf, scheduleText } from '../academy.js';
import { saveAttendance, deleteAttendance } from '../ops.js';
import { studentAvatar, openStudent, groupOptions } from '../student.js';
import { waStudent, printDoc } from '../shared.js';

export function mount(el, { params }) {
  let date = params?.date || todayKey();
  let groupId = params?.groupId || '';
  let tab = 'lista';
  let marks = {};
  let dirty = false;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Asistencia</h1><p class="view-sub">Pasa la lista con un toque por alumno. Los profesores también pueden pasarla desde su portal.</p></div>
      <div class="view-actions"><div class="tabs tabs-sm" id="a-tabs"></div></div></div>
    <div id="a-body"></div>`;
  const $ = (s) => el.querySelector(s);

  function tabs() {
    $('#a-tabs').innerHTML = [['lista', `${icon('userCheck')} Pasar lista`], ['historial', `${icon('history')} Historial`], ['alertas', `${icon('alert')} Faltas`]].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = async () => { if (dirty && !(await confirmDialog({ title: 'Lista sin guardar', message: '¿Salir sin guardar los cambios?', confirmText: 'Salir' }))) return; dirty = false; tab = b.dataset.t; tabs(); draw(); });
  }
  const classes = () => store.classesOn(date);
  function pickDefault() {
    const cl = classes();
    if (groupId && store.group(groupId)) return;
    if (!cl.length) { groupId = store.liveGroups[0]?.id || ''; return; }
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const pending = cl.find((x) => !store.sheet(x.group.id, date) && toM(x.slot.from) <= now + 30) || cl.find((x) => !store.sheet(x.group.id, date)) || cl[0];
    groupId = pending.group.id;
  }
  function loadMarks() {
    const sh = store.sheet(groupId, date);
    marks = { ...(sh?.marks || {}) };
    dirty = false;
  }

  function lista() {
    pickDefault(); loadMarks();
    const cl = classes();
    const g = store.group(groupId);
    $('#a-body').innerHTML = `
      <div class="card card-flush">
        <div class="toolbar"><input class="input" type="date" id="a-date" value="${date}" max="${todayKey()}" style="max-width:170px"><select class="input grow" id="a-group" style="max-width:420px"><option value="">— Elige el grupo —</option>${groupOptions(groupId)}</select></div>
        ${cl.length ? `<div class="class-chips">${cl.map(({ group: x, slot }) => { const sh = store.sheet(x.id, date); const c = store.course(x.courseId);
          return `<button class="class-chip ${x.id === groupId ? 'on' : ''} ${sh ? 'done' : ''}" data-cg="${x.id}" style="--gc:${c?.color || catOf(c?.category).color}"><b>${fmtHour(slot.from)}</b> ${esc(store.groupLabel(x))}${sh ? ` ${icon('check')}` : ''}</button>`; }).join('')}</div>` : `<div class="hint" style="padding:0 16px 12px">No hay clases programadas el ${DAYS[new Date(date + 'T12:00:00').getDay()].toLowerCase()} ${fmtDate(date)}. Puedes elegir cualquier grupo para pasar lista (clase extra o recuperación).</div>`}
      </div>
      <div id="a-sheet" class="mt"></div>`;
    $('#a-date').onchange = (e) => { if (!e.target.value) return; date = e.target.value; groupId = ''; lista(); };
    $('#a-group').onchange = (e) => { groupId = e.target.value; loadMarks(); sheet(); };
    el.querySelectorAll('[data-cg]').forEach((b) => b.onclick = async () => { if (dirty && !(await confirmDialog({ title: 'Lista sin guardar', message: '¿Cambiar de grupo sin guardar?', confirmText: 'Cambiar' }))) return; groupId = b.dataset.cg; lista(); });
    if (g) sheet(); else $('#a-sheet').innerHTML = `<div class="card">${emptyState('userCheck', 'Elige un grupo', store.liveGroups.length ? 'Selecciona la clase para pasar la lista.' : 'Crea tus grupos en «Cursos y grupos».')}</div>`;
  }

  function sheet() {
    const g = store.group(groupId);
    if (!g) { $('#a-sheet').innerHTML = ''; return; }
    const roster = store.roster(g.id);
    const sh = store.sheet(g.id, date);
    const sl = slotsOn(g, new Date(date + 'T12:00:00').getDay());
    const sheets = store.sheetsOf(g.id);
    const count = () => { const v = Object.values(marks); return { P: v.filter((x) => x === 'P').length, T: v.filter((x) => x === 'T').length, A: v.filter((x) => x === 'A').length, J: v.filter((x) => x === 'J').length, n: v.length }; };
    $('#a-sheet').innerHTML = `<div class="card">
      <div class="card-head"><div><div class="card-title">${icon('userCheck')} ${esc(store.groupLabel(g))}</div><div class="t-sub">${fmtDate(date)}${sl.length ? ` · ${sl.map((s) => `${fmtHour(s.from)}–${fmtHour(s.to)}`).join(', ')}` : ' · clase fuera de horario'} · ${esc(store.teacher(g.teacherId)?.name || 'Sin profesor')}${sh ? ` · <span class="text-success">${sh.via === 'profesor' ? 'pasada por el profesor' : 'guardada'}</span>` : ''}</div></div>
        <div class="row" style="gap:6px"><button class="btn btn-secondary btn-sm" id="a-allp">${icon('check')} Todos presentes</button></div></div>
      <div class="att-count" id="a-count"></div>
      ${roster.length ? `<div class="att-list">${roster.map((s) => { const a = attendanceOf(s.id, sheets);
        return `<div class="att-row" data-sid="${s.id}">${studentAvatar(s)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-s="${s.id}"><b>${esc(s.name)}</b></button><div class="t-sub">${a.pct != null ? `asistencia ${a.pct}% · ${a.A} falta(s)` : 'primera clase'}</div></div>
          <div class="att-btns">${Object.entries(ATT).map(([k, v]) => `<button class="att-b att-${k} ${marks[s.id] === k ? 'on' : ''}" data-m="${k}" title="${v.label}">${v.short}</button>`).join('')}</div></div>`; }).join('')}</div>`
        : emptyState('users', 'Grupo sin alumnos', 'Inscribe alumnos en este grupo desde «Cursos y grupos» o la ficha del alumno.')}
      ${roster.length ? `<div class="field mt"><label>Tema de la clase (opcional)</label><input class="input" id="a-topic" value="${esc(sh?.topic || '')}" maxlength="200" placeholder="Ej.: Unidad 3 · pasado simple"></div>
      <div class="row mt" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-lg grow" id="a-save">${icon('check')} Guardar lista</button>${sh ? `<button class="btn btn-ghost" id="a-del">${icon('trash')} Borrar</button>` : ''}</div>` : ''}
    </div>`;
    const drawCount = () => { const c = count(); $('#a-count').innerHTML = `${Object.entries(ATT).map(([k, v]) => `<span class="badge badge-${v.tone}">${v.label}: ${c[k]}</span>`).join('')}<span class="badge badge-neutral">Sin marcar: ${roster.length - c.n}</span>`; };
    drawCount();
    el.querySelectorAll('#a-sheet [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s, { tab: 'academico' }));
    el.querySelectorAll('.att-row').forEach((row) => row.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
      const sid = row.dataset.sid; const k = b.dataset.m;
      marks[sid] = marks[sid] === k ? undefined : k; if (!marks[sid]) delete marks[sid];
      row.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', marks[sid] === x.dataset.m));
      dirty = true; drawCount();
    }));
    $('#a-allp')?.addEventListener('click', () => { roster.forEach((s) => { if (!marks[s.id]) marks[s.id] = 'P'; }); el.querySelectorAll('.att-row').forEach((row) => row.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', marks[row.dataset.sid] === x.dataset.m))); dirty = true; drawCount(); });
    $('#a-save')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const unmarked = roster.filter((s) => !marks[s.id]);
      if (unmarked.length && !(await confirmDialog({ title: 'Alumnos sin marcar', message: `${unmarked.length} alumno(s) sin marcar. ¿Marcarlos como ausentes?`, confirmText: 'Sí, ausentes', cancelText: 'Revisar' }))) return;
      unmarked.forEach((s) => { marks[s.id] = 'A'; });
      setBusy(btn, true, 'Guardando…');
      try {
        await saveAttendance(g.id, date, marks, { topic: $('#a-topic')?.value || '' });
        dirty = false;
        toast('Lista guardada');
        const absent = roster.filter((s) => marks[s.id] === 'A');
        if (absent.length) notifyAbsent(g, absent);
        lista();
      } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
    });
    $('#a-del')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Borrar lista', message: 'Se borra la asistencia de esta clase.', confirmText: 'Borrar', danger: true }))) return;
      await deleteAttendance(sh); toast('Lista borrada'); lista();
    });
  }

  function notifyAbsent(g, absent) {
    const m = openModal({ title: 'Avisar inasistencias', size: 'md', sub: 'Envía un mensaje a cada alumno ausente (o a su representante si es menor).',
      body: `<div class="list">${absent.map((s) => `<div class="list-item">${studentAvatar(s)}<b class="grow">${esc(s.name)}</b><button class="btn btn-whatsapp btn-sm" data-w="${s.id}">${icon('whatsapp')} Avisar</button></div>`).join('')}</div>`,
      footer: '<button class="btn btn-secondary" data-close>Listo</button>' });
    m.el.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { waStudent('inasistencia', { student: store.student(b.dataset.w), group: g, date }); b.classList.replace('btn-whatsapp', 'btn-secondary'); b.innerHTML = `${icon('check')} Avisado`; });
  }

  function historial() {
    if (!groupId) pickDefault();
    const g = store.group(groupId);
    const sheets = g ? store.sheetsOf(g.id) : [];
    const roster = g ? store.roster(g.id) : [];
    $('#a-body').innerHTML = `<div class="card card-flush"><div class="toolbar"><select class="input grow" id="a-group" style="max-width:420px">${groupOptions(groupId, { includeEnded: true })}</select>${g ? `<button class="btn btn-ghost btn-sm" id="a-print">${icon('print')} Imprimir planilla</button>` : ''}</div>
      ${g && sheets.length ? `<div class="table-wrap"><table class="table att-matrix"><thead><tr><th>Alumno</th>${sheets.slice(0, 16).reverse().map((sh) => `<th class="c" title="${esc(sh.topic || '')}">${esc(sh.date.slice(8))}/${esc(sh.date.slice(5, 7))}</th>`).join('')}<th class="c">%</th></tr></thead><tbody>
        ${roster.map((s) => { const a = attendanceOf(s.id, sheets); return `<tr><td><button class="linkish" data-s="${s.id}">${esc(s.name)}</button></td>${sheets.slice(0, 16).reverse().map((sh) => { const mk = sh.marks?.[s.id]; return `<td class="c">${mk ? `<span class="att-dot att-${mk}">${mk}</span>` : '<span class="muted">·</span>'}</td>`; }).join('')}<td class="c"><b class="${a.pct != null && a.pct < 75 ? 'text-danger' : ''}">${a.pct ?? '—'}</b></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="list" style="padding:6px 10px">${sheets.slice(0, 10).map((sh) => { const st = sheetStats(sh); return `<div class="list-item"><span class="kpi-icon tone-${st.pct >= 80 ? 'success' : st.pct >= 60 ? 'warning' : 'danger'}" style="width:34px;height:34px">${icon('userCheck')}</span><div class="grow"><b>${fmtDate(sh.date)}</b>${sh.topic ? ` · ${esc(sh.topic)}` : ''}<div class="t-sub">${st.present} de ${st.n} presentes · ${st.absent} ausente(s)${sh.via === 'profesor' ? ' · desde el portal del profesor' : ''}</div></div><button class="btn btn-ghost btn-sm" data-open="${sh.date}">${icon('edit')}</button></div>`; }).join('')}</div>`
        : `<div class="pd-3">${emptyState('history', 'Sin listas todavía', 'Cuando pases la lista de este grupo, aquí verás la planilla completa.')}</div>`}</div>`;
    $('#a-group').onchange = (e) => { groupId = e.target.value; historial(); };
    el.querySelectorAll('#a-body [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s, { tab: 'academico' }));
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { date = b.dataset.open; tab = 'lista'; tabs(); lista(); });
    $('#a-print')?.addEventListener('click', () => printDoc(`Planilla de asistencia · ${store.groupLabel(g)}`, `<p class="muted">${esc(scheduleText(g))} · Profesor: ${esc(store.teacher(g.teacherId)?.name || '—')}</p><table><tr><th>Alumno</th>${sheets.slice(0, 20).reverse().map((sh) => `<th class="c">${sh.date.slice(8)}/${sh.date.slice(5, 7)}</th>`).join('')}<th class="c">%</th></tr>${roster.map((s) => { const a = attendanceOf(s.id, sheets); return `<tr><td>${esc(s.name)}</td>${sheets.slice(0, 20).reverse().map((sh) => `<td class="c">${sh.marks?.[s.id] || ''}</td>`).join('')}<td class="c"><b>${a.pct ?? ''}</b></td></tr>`; }).join('')}</table><p class="small muted">P = presente · T = tarde · A = ausente · J = justificado</p>`, { landscape: true }));
  }

  function alertas() {
    const since = dayKey(addDays(new Date(), -30));
    const recent = store.attendance.filter((a) => a.date >= since);
    const rows = [];
    for (const s of store.activeStudents) {
      for (const gid of s.groupIds || []) {
        const g = store.group(gid); if (!g || g.status === 'finalizado') continue;
        const a = attendanceOf(s.id, recent.filter((x) => x.groupId === gid));
        if (a.A >= 3 || (a.total >= 4 && a.pct < 70)) rows.push({ s, g, a });
      }
    }
    rows.sort((x, y) => y.a.A - x.a.A);
    $('#a-body').innerHTML = `<div class="card"><div class="card-head"><div class="card-title">${icon('alert')} Alumnos con muchas faltas (últimos 30 días)</div></div><p class="hint" style="margin-top:0">3 o más ausencias, o menos de 70% de asistencia. Escríbeles antes de que abandonen el curso.</p>
      ${rows.length ? `<div class="list">${rows.map(({ s, g, a }) => `<div class="list-item">${studentAvatar(s)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-s="${s.id}"><b>${esc(s.name)}</b></button><div class="t-sub">${esc(store.groupLabel(g))} · <b class="text-danger">${a.A} falta(s)</b> · asistencia ${a.pct}%</div></div><button class="btn btn-whatsapp btn-sm" data-w="${s.id}" data-g="${g.id}" data-n="${a.A}">${icon('whatsapp')} Escribir</button></div>`).join('')}</div>`
        : emptyState('checkCircle', '¡Buena asistencia!', 'Ningún alumno acumula faltas en los últimos 30 días.')}</div>`;
    el.querySelectorAll('#a-body [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s, { tab: 'academico' }));
    el.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => waStudent('ausencias', { student: store.student(b.dataset.w), group: store.group(b.dataset.g), extra: `${b.dataset.n} inasistencias en el último mes` }));
  }

  function draw() { if (tab === 'lista') lista(); else if (tab === 'historial') historial(); else alertas(); }
  tabs(); draw();
  const off = store.on('*', (e) => {
    if (dirty) return;
    if (['attendance', 'groups', 'students'].includes(e) && !el.querySelector('#a-topic:focus')) draw();
  });
  return () => off();
}
