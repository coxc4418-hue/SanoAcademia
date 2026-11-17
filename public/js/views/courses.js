// SanoAcademia — Cursos y grupos: catálogo, horarios, cupos, profesores y lista de cada grupo
import { store } from '../store.js';
import { esc, usd, emptyState, toast, openModal, setBusy, confirmDialog, parseNum, fmtDate, todayKey, normalize } from '../utils.js';
import { icon } from '../icons.js';
import { COURSE_CATS, catOf, LEVELS, DAYS, WEEK, GROUP_STATUS, badge, scheduleText, weeklyHours, groupFee, studentBalance, attendanceOf, studentAverage, scaleOf } from '../academy.js';
import { saveCourse, saveGroup, setGroupStatus, enroll, unenroll, scheduleConflicts } from '../ops.js';
import { studentAvatar, openStudent, pickStudent, debtBadge } from '../student.js';
import { printRoster, waStudent, printDoc } from '../shared.js';

// ======================================================================
// FORMULARIOS
// ======================================================================
export function courseForm(course = null) {
  return new Promise((resolve) => {
    const c = course || { category: 'idiomas', level: '', monthlyFee: '', enrollFee: '' };
    let done = false;
    const m = openModal({
      title: course ? 'Editar curso' : 'Nuevo curso', size: 'md', sub: 'El curso es lo que ofreces (ej. Inglés para niños). Después creas uno o varios grupos con su horario.',
      body: `<form class="stack" data-f>
        <div class="field"><label>Nombre del curso *</label><input class="input" name="name" value="${esc(c.name || '')}" placeholder="Ej.: Inglés conversacional, Guitarra, Robótica" required maxlength="80"></div>
        <div class="form-grid">
          <div class="field"><label>Categoría</label><select class="input" name="category">${Object.entries(COURSE_CATS).map(([k, v]) => `<option value="${k}" ${c.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
          <div class="field"><label>Nivel / edad</label><input class="input" name="level" list="lv" value="${esc(c.level || '')}" placeholder="Ej.: Niños 7-11, Intermedio"><datalist id="lv">${LEVELS.map((l) => `<option value="${l}">`).join('')}</datalist></div>
          <div class="field"><label>Mensualidad *</label><input class="input" name="monthlyFee" inputmode="decimal" value="${c.monthlyFee ?? ''}" placeholder="0,00"></div>
          <div class="field"><label>Inscripción</label><input class="input" name="enrollFee" inputmode="decimal" value="${c.enrollFee ?? ''}" placeholder="La general (${usd(store.settings.enrollFee || 0)})"></div>
          <div class="field"><label>Horas totales del curso</label><input class="input" name="hours" inputmode="numeric" value="${c.hours || ''}" placeholder="Ej.: 96 (sale en el certificado)"></div>
          <div class="field"><label>Duración (meses)</label><input class="input" name="months" inputmode="numeric" value="${c.months || ''}" placeholder="Ej.: 6"></div>
        </div>
        <div class="field"><label>Descripción (sale en la inscripción en línea)</label><textarea class="input" name="description" rows="3" maxlength="500" placeholder="Qué aprenderá el alumno, requisitos, materiales…">${esc(c.description || '')}</textarea></div>
        <div class="field"><label>Color en el horario</label><div class="color-pick">${['#4f46e5', '#db2777', '#ea580c', '#ca8a04', '#0891b2', '#7c3aed', '#16a34a', '#dc2626', '#0d9488', '#b45309', '#c026d3', '#475569'].map((col) => `<label><input type="radio" name="color" value="${col}" ${(c.color || catOf(c.category).color) === col ? 'checked' : ''}><i style="background:${col}"></i></label>`).join('')}</div></div>
        ${course ? `<label class="check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Curso activo (si lo desactivas no sale en la inscripción en línea)</label>` : ''}
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar curso</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]');
    F.category.onchange = () => { const col = catOf(F.category.value).color; const r = F.querySelector(`[name=color][value="${col}"]`); if (r) r.checked = true; };
    const go = async (e) => {
      e?.preventDefault();
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        const saved = await saveCourse({ name: F.name.value, category: F.category.value, level: F.level.value, monthlyFee: parseNum(F.monthlyFee.value), enrollFee: F.enrollFee.value.trim() === '' ? '' : parseNum(F.enrollFee.value), hours: F.hours.value, months: F.months.value, description: F.description.value, color: F.querySelector('[name=color]:checked')?.value, active: F.active ? F.active.checked : true }, course?.id);
        toast(course ? 'Curso actualizado' : 'Curso creado'); done = true; m.close(); resolve(saved);
      } catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(btn, false); }
    };
    F.onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

const slotRow = (s = { day: 1, from: '16:00', to: '17:30' }) => `<div class="slot-row"><select class="input" data-day>${WEEK.map((d) => `<option value="${d}" ${Number(s.day) === d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select><input class="input" type="time" data-from value="${s.from}"><span class="muted">a</span><input class="input" type="time" data-to value="${s.to}"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-rm title="Quitar">${icon('x')}</button></div>`;

export function groupForm(group = null, preset = {}) {
  return new Promise((resolve) => {
    if (!store.courses.length) { toast('Primero crea un curso.', 'warning'); courseForm().then((c) => (c ? groupForm(null, { courseId: c.id }).then(resolve) : resolve(null))); return; }
    const g = { status: 'en_curso', schedule: [{ day: 1, from: '16:00', to: '17:30' }, { day: 3, from: '16:00', to: '17:30' }], ...preset, ...(group || {}) };
    let done = false;
    const m = openModal({
      title: group ? 'Editar grupo' : 'Nuevo grupo', size: 'md', sub: 'Un grupo es una sección del curso con su horario, profesor, aula y cupo.',
      body: `<form class="stack" data-f>
        <div class="form-grid">
          <div class="field"><label>Curso *</label><select class="input" name="courseId">${store.courses.filter((c) => c.active !== false || c.id === g.courseId).map((c) => `<option value="${c.id}" ${g.courseId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Nombre del grupo</label><input class="input" name="name" value="${esc(g.name || '')}" placeholder="Ej.: Sección A, Tarde, Sábados"></div>
          <div class="field"><label>Profesor</label><select class="input" name="teacherId"><option value="">— Sin asignar —</option>${store.teachers.filter((t) => t.active !== false || t.id === g.teacherId).map((t) => `<option value="${t.id}" ${g.teacherId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Aula</label><select class="input" name="room"><option value="">— Sin aula —</option>${(store.settings.rooms || []).map((r) => `<option value="${r.id}" ${g.room === r.id ? 'selected' : ''}>${esc(r.name)}${r.capacity ? ` (${r.capacity})` : ''}</option>`).join('')}</select></div>
          <div class="field"><label>Cupo máximo</label><input class="input" name="capacity" inputmode="numeric" value="${g.capacity || ''}" placeholder="Sin límite"></div>
          <div class="field"><label>Mensualidad del grupo</label><input class="input" name="fee" inputmode="decimal" value="${g.fee ?? ''}" placeholder="La del curso"></div>
          <div class="field"><label>Inicio</label><input class="input" type="date" name="startDate" value="${g.startDate || ''}"></div>
          <div class="field"><label>Fin</label><input class="input" type="date" name="endDate" value="${g.endDate || ''}"></div>
        </div>
        <div class="field"><label>Horario de clases</label><div class="stack-sm" data-slots>${(g.schedule || []).map(slotRow).join('')}</div><button type="button" class="btn btn-ghost btn-sm mt-xs" data-add>${icon('plus')} Agregar día</button></div>
        <div class="field"><label>Estado</label><select class="input" name="status">${Object.entries(GROUP_STATUS).map(([k, v]) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        <div class="conflicts" data-conf hidden></div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar grupo</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]');
    const slots = m.el.querySelector('[data-slots]');
    const bindRm = () => slots.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { b.closest('.slot-row').remove(); check(); });
    m.el.querySelector('[data-add]').onclick = () => { const last = slots.lastElementChild; const d = last ? (Number(last.querySelector('[data-day]').value) % 6) + 1 : 1; slots.insertAdjacentHTML('beforeend', slotRow({ day: d, from: last?.querySelector('[data-from]').value || '16:00', to: last?.querySelector('[data-to]').value || '17:30' })); bindRm(); check(); };
    bindRm();
    const read = () => ({
      courseId: F.courseId.value, name: F.name.value, teacherId: F.teacherId.value, room: F.room.value, capacity: F.capacity.value, fee: F.fee.value.trim() === '' ? '' : parseNum(F.fee.value),
      startDate: F.startDate.value, endDate: F.endDate.value, status: F.status.value,
      schedule: [...slots.querySelectorAll('.slot-row')].map((r) => ({ day: Number(r.querySelector('[data-day]').value), from: r.querySelector('[data-from]').value, to: r.querySelector('[data-to]').value }))
    });
    const check = () => {
      const d = read();
      const c = scheduleConflicts({ ...d, schedule: d.schedule.filter((s) => s.from && s.to) }, group?.id);
      const box = m.el.querySelector('[data-conf]');
      box.hidden = !c.length;
      box.innerHTML = c.length ? `<b>${icon('alert')} Choque de horario</b><ul>${c.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
      return c;
    };
    F.addEventListener('change', check);
    if (!group && preset.courseId) F.courseId.value = preset.courseId;
    check();
    const go = async (e) => {
      e?.preventDefault();
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Guardando…');
      const d = read();
      if (!d.schedule.length && !(await confirmDialog({ title: 'Grupo sin horario', message: 'No agregaste días de clase. No aparecerá en el horario ni en la asistencia. ¿Guardar igual?', confirmText: 'Guardar' }))) { setBusy(btn, false); return; }
      try {
        let saved;
        try { saved = await saveGroup(d, group?.id); }
        catch (ex) {
          if (!ex.conflicts) throw ex;
          if (!(await confirmDialog({ title: 'Hay choques de horario', message: ex.conflicts.join('\n') + '\n\n¿Guardar de todas formas?', confirmText: 'Guardar igual', danger: true }))) { setBusy(btn, false); return; }
          saved = await saveGroup(d, group?.id, { force: true });
        }
        toast(group ? 'Grupo actualizado' : 'Grupo creado'); done = true; m.close(); resolve(saved);
      } catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(btn, false); }
    };
    F.onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

/** Inscribe a un alumno en un grupo (con aviso si está lleno) */
export async function enrollInto(s, g, { chargeEnroll = null } = {}) {
  const c = store.course(g.courseId);
  const fee = c?.enrollFee != null ? Number(c.enrollFee) : Number(store.settings.enrollFee) || 0;
  let charge = chargeEnroll;
  if (charge == null) charge = fee > 0 ? await confirmDialog({ title: 'Inscripción', message: `¿Cobrar la inscripción de ${usd(fee)} a ${s.name}?`, confirmText: 'Sí, cobrar', cancelText: 'No cobrar' }) : false;
  try { await enroll(s, g.id, { chargeEnroll: charge }); }
  catch (ex) {
    if (!ex.full) throw ex;
    if (!(await confirmDialog({ title: 'Grupo lleno', message: ex.message + ' ¿Inscribir de todas formas?', confirmText: 'Inscribir igual' }))) return false;
    await enroll(s, g.id, { chargeEnroll: charge, force: true });
  }
  toast(`${s.name} inscrito en ${store.groupLabel(g)}`);
  return true;
}

// ======================================================================
// FICHA DEL GRUPO
// ======================================================================
export function openGroup(id, { navigate } = {}) {
  const g0 = store.group(id);
  if (!g0) return;
  let off = null;
  const m = openModal({ title: store.groupLabel(g0), size: 'lg', body: '<div data-b></div>', onClose: () => off?.() });
  const body = m.el.querySelector('[data-b]');
  const draw = () => {
    const g = store.group(id); if (!g) { m.close(); return; }
    const c = store.course(g.courseId);
    const roster = store.roster(g.id);
    const sheets = store.sheetsOf(g.id);
    const sc = store.gradesOf(g.id);
    const scale = scaleOf(store.settings);
    m.el.querySelector('.modal-title') && (m.el.querySelector('.modal-title').textContent = store.groupLabel(g));
    body.innerHTML = `
      <div class="group-hero" style="--gc:${c?.color || catOf(c?.category).color}"><span class="kpi-icon">${icon(catOf(c?.category).icon)}</span><div class="grow"><b>${esc(c?.name || '')}${g.name ? ` · ${esc(g.name)}` : ''}</b><div class="t-sub">${esc(scheduleText(g))} · ${weeklyHours(g)} h/semana</div></div>${badge(GROUP_STATUS, g.status)}</div>
      <div class="kv mt">
        <div><span>Profesor</span><b>${esc(store.teacher(g.teacherId)?.name || 'Sin asignar')}</b></div>
        <div><span>Aula</span><b>${esc(store.roomName(g.room) || '—')}</b></div>
        <div><span>Alumnos</span><b>${roster.length}${g.capacity ? ` de ${g.capacity}` : ''}</b></div>
        <div><span>Mensualidad</span><b>${usd(groupFee(g, c))}</b></div>
        <div><span>Inicio</span><b>${g.startDate ? fmtDate(g.startDate) : '—'}</b></div>
        <div><span>Clases con lista</span><b>${sheets.length}</b></div>
      </div>
      <div class="row mt" style="gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-a="att">${icon('userCheck')} Pasar lista</button>
        <button class="btn btn-secondary btn-sm" data-a="grades">${icon('clipboard')} Notas</button>
        <button class="btn btn-secondary btn-sm" data-a="add">${icon('userPlus')} Inscribir alumno</button>
        <button class="btn btn-ghost btn-sm" data-a="print">${icon('print')} Lista</button>
        <button class="btn btn-ghost btn-sm" data-a="wa">${icon('whatsapp')} Mensaje al grupo</button>
        <button class="btn btn-ghost btn-sm" data-a="edit">${icon('edit')} Editar</button>
        ${g.status !== 'finalizado' ? `<button class="btn btn-ghost btn-sm" data-a="end">${icon('check')} Finalizar</button>` : `<button class="btn btn-ghost btn-sm" data-a="reopen">${icon('refresh')} Reabrir</button>`}
      </div>
      <div class="section-title mt-lg">${icon('users')} Alumnos del grupo</div>
      ${roster.length ? `<div class="list">${roster.map((s) => { const a = attendanceOf(s.id, sheets); const avg = studentAverage(g, sc, s.id);
        return `<div class="list-item">${studentAvatar(s)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-s="${s.id}"><b>${esc(s.name)}</b></button><div class="t-sub">${debtBadge(s)}${a.pct != null ? ` · asistencia ${a.pct}%` : ''}${avg != null ? ` · promedio <b class="${avg >= scale.pass ? 'text-success' : 'text-danger'}">${avg}</b>` : ''}</div></div>${studentBalance(s) > 0.009 ? `<b class="num text-danger hide-xs">${usd(studentBalance(s))}</b>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-out="${s.id}" title="Sacar del grupo">${icon('userX')}</button></div>`; }).join('')}</div>`
        : emptyState('users', 'Sin alumnos', 'Inscribe alumnos en este grupo.')}`;
    body.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s));
    body.querySelectorAll('[data-out]').forEach((b) => b.onclick = async () => {
      const s = store.student(b.dataset.out);
      if (!(await confirmDialog({ title: 'Sacar del grupo', message: `${s.name} dejará de estar en ${store.groupLabel(g)}. Su historial de asistencia y notas se conserva.`, confirmText: 'Sacar', danger: true }))) return;
      await unenroll(s, g.id); toast('Alumno retirado del grupo');
    });
    const act = {
      att: () => { m.close(); navigate?.('asistencia', { groupId: g.id, date: todayKey() }); },
      grades: () => { m.close(); navigate?.('notas', { groupId: g.id }); },
      add: async () => {
        const s = await pickStudent({ title: `Inscribir en ${store.groupLabel(g)}`, filter: (x) => !(x.groupIds || []).includes(g.id) && x.status !== 'retirado' });
        if (s) await enrollInto(s, g).catch((ex) => toast(ex.message, 'danger'));
      },
      print: () => printRoster(g),
      wa: () => {
        const list = roster;
        const mm = openModal({ title: 'Mensaje al grupo', size: 'md', sub: 'Escribe el mensaje y envíalo a cada alumno (o a su representante) por WhatsApp.',
          body: `<div class="stack"><textarea class="input" rows="4" data-t placeholder="Ej.: Mañana la clase será en el Aula 2. ¡Traigan su material!"></textarea><div class="list" style="max-height:40vh;overflow:auto">${list.map((s) => `<div class="list-item">${studentAvatar(s)}<b class="grow">${esc(s.name)}</b><button class="btn btn-whatsapp btn-sm" data-ws="${s.id}">${icon('whatsapp')} Enviar</button></div>`).join('')}</div></div>` });
        mm.el.querySelectorAll('[data-ws]').forEach((b) => b.onclick = () => { const t = mm.el.querySelector('[data-t]').value.trim(); if (!t) { toast('Escribe el mensaje.', 'warning'); return; } waStudent('libre', { student: store.student(b.dataset.ws), extra: `*${store.groupLabel(g)}*\n${t}` }); b.classList.replace('btn-whatsapp', 'btn-secondary'); b.innerHTML = `${icon('check')} Enviado`; });
      },
      edit: () => groupForm(g),
      end: async () => { if (await confirmDialog({ title: 'Finalizar grupo', message: 'El grupo deja de generar mensualidades y sale del horario. Podrás emitir los certificados de sus alumnos.', confirmText: 'Finalizar' })) { await setGroupStatus(g, 'finalizado'); toast('Grupo finalizado'); } },
      reopen: async () => { await setGroupStatus(g, 'en_curso'); toast('Grupo reabierto'); }
    };
    body.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => act[b.dataset.a]());
  };
  draw();
  off = store.on('*', (e) => { if (['groups', 'students', 'attendance', 'grades', 'teachers'].includes(e)) draw(); });
}

// ======================================================================
// VISTA
// ======================================================================
export function mount(el, { navigate, params }) {
  let q = '';
  let showEnded = false;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Cursos y grupos</h1><p class="view-sub">Lo que ofrece tu academia, sus grupos con horario, profesor, aula y cupos.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="cg-course">${icon('book')} Nuevo curso</button><button class="btn btn-primary" id="cg-group">${icon('plus')} Nuevo grupo</button></div></div>
    <div class="card card-flush"><div class="toolbar"><label class="search grow">${icon('search')}<input id="cg-q" placeholder="Buscar curso, grupo o profesor…"></label><label class="check small"><input type="checkbox" id="cg-ended"> Ver finalizados</label><button class="btn btn-ghost btn-sm" id="cg-print">${icon('print')} Oferta</button></div></div>
    <div id="cg-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#cg-course').onclick = () => courseForm();
  $('#cg-group').onclick = () => groupForm();
  $('#cg-q').oninput = (e) => { q = e.target.value; draw(); };
  $('#cg-ended').onchange = (e) => { showEnded = e.target.checked; draw(); };
  $('#cg-print').onclick = () => printDoc('Oferta de cursos', `<table><tr><th>Curso</th><th>Grupo</th><th>Horario</th><th>Profesor</th><th class="c">Cupos</th><th class="r">Mensualidad</th></tr>${store.liveGroups.map((g) => { const c = store.course(g.courseId); return `<tr><td><b>${esc(c?.name || '')}</b><br><small>${esc(c?.level || '')}</small></td><td>${esc(g.name || '')}</td><td>${esc(scheduleText(g))}</td><td>${esc(store.teacher(g.teacherId)?.name || '')}</td><td class="c">${g.capacity ? `${store.roster(g.id).length}/${g.capacity}` : store.roster(g.id).length}</td><td class="r">${usd(groupFee(g, c))}</td></tr>`; }).join('')}</table>`);

  function draw() {
    const t = normalize(q);
    const courses = store.courses.filter((c) => showEnded || c.active !== false);
    const cards = courses.map((c) => {
      const gs = store.groupsOf(c.id).filter((g) => showEnded || g.status !== 'finalizado');
      const match = !t || normalize(`${c.name} ${c.level} ${gs.map((g) => `${g.name} ${store.teacher(g.teacherId)?.name || ''}`).join(' ')}`).includes(t);
      if (!match) return '';
      const cat = catOf(c.category);
      const n = gs.reduce((a, g) => a + store.roster(g.id).length, 0);
      return `<div class="card course-card" style="--gc:${c.color || cat.color}">
        <div class="course-head"><span class="kpi-icon">${icon(cat.icon)}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.name)}</b><div class="t-sub">${esc(cat.label)}${c.level ? ` · ${esc(c.level)}` : ''}${c.active === false ? ' · <span class="text-danger">inactivo</span>' : ''}</div></div><div class="r"><b class="num">${usd(c.monthlyFee || 0)}</b><div class="t-sub">al mes</div></div><button class="btn btn-ghost btn-icon btn-sm" data-ec="${c.id}" title="Editar curso">${icon('edit')}</button></div>
        <div class="course-groups">${gs.length ? gs.map((g) => { const r = store.roster(g.id).length; const pct = g.capacity ? Math.min(100, Math.round(r / g.capacity * 100)) : 0;
          return `<button class="cgroup" data-g="${g.id}"><div class="between"><b>${esc(g.name || 'Grupo')}</b>${g.status !== 'en_curso' ? badge(GROUP_STATUS, g.status) : ''}</div><div class="t-sub">${icon('clock')} ${esc(scheduleText(g))}</div><div class="t-sub">${icon('user')} ${esc(store.teacher(g.teacherId)?.name || 'Sin profesor')}${g.room ? ` · ${esc(store.roomName(g.room))}` : ''}</div>
            <div class="between mt-xs"><span class="small"><b>${r}</b>${g.capacity ? ` / ${g.capacity} cupos` : ' alumnos'}</span>${g.capacity && r >= g.capacity ? '<span class="badge badge-danger">Lleno</span>' : ''}</div>${g.capacity ? `<div class="progress progress-sm"><span style="width:${pct}%"></span></div>` : ''}</button>`; }).join('') : '<p class="muted small" style="margin:0">Sin grupos todavía.</p>'}
          <button class="cgroup cgroup-add" data-ng="${c.id}">${icon('plus')} Agregar grupo</button></div>
        <div class="t-sub mt-xs">${n} alumno(s) inscritos${c.hours ? ` · ${c.hours} h` : ''}${c.months ? ` · ${c.months} meses` : ''}</div></div>`;
    }).filter(Boolean);
    $('#cg-body').innerHTML = cards.length ? `<div class="course-grid">${cards.join('')}</div>` : `<div class="card">${emptyState('book', store.courses.length ? 'Sin resultados' : 'Aún no tienes cursos', store.courses.length ? 'Prueba con otra búsqueda.' : 'Crea tu primer curso (por ejemplo «Inglés para niños») y después sus grupos con horario.')}</div>`;
    el.querySelectorAll('[data-ec]').forEach((b) => b.onclick = () => courseForm(store.course(b.dataset.ec)));
    el.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => openGroup(b.dataset.g, { navigate }));
    el.querySelectorAll('[data-ng]').forEach((b) => b.onclick = () => groupForm(null, { courseId: b.dataset.ng }));
  }
  draw();
  if (params?.new) courseForm();
  else if (params?.newGroup) groupForm();
  else if (params?.groupId) openGroup(params.groupId, { navigate });
  const off = store.on('*', (e) => { if (['courses', 'groups', 'students', 'teachers', 'settings'].includes(e)) draw(); });
  return () => off();
}
