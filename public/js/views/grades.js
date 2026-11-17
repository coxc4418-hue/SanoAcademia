// SanoAcademia — Notas: plan de evaluación por grupo, planilla de notas, promedios y boletines
import { store } from '../store.js';
import { esc, emptyState, toast, setBusy, openModal, confirmDialog, num, fmtDate, todayKey } from '../utils.js';
import { icon } from '../icons.js';
import { scaleOf, studentAverage, weightTotal, attendanceOf } from '../academy.js';
import { saveEvals, saveScores } from '../ops.js';
import { studentAvatar, openStudent, groupOptions } from '../student.js';
import { printReportCard, waStudent, printDoc } from '../shared.js';

const PRESETS = [
  { name: 'Clásico (3 parciales + final)', evals: [['Parcial 1', 20], ['Parcial 2', 20], ['Parcial 3', 20], ['Examen final', 40]] },
  { name: 'Idiomas (oral, escrito, tareas)', evals: [['Expresión oral', 30], ['Prueba escrita', 30], ['Tareas y participación', 20], ['Examen final', 20]] },
  { name: 'Práctico (talleres)', evals: [['Práctica 1', 25], ['Práctica 2', 25], ['Proyecto final', 50]] },
  { name: 'Música / danza (presentación)', evals: [['Técnica', 30], ['Ensayos y participación', 30], ['Presentación final', 40]] }
];

export function evalsEditor(g) {
  return new Promise((resolve) => {
    let done = false;
    const row = (e = { name: '', weight: '', date: '' }) => `<div class="eval-row" data-id="${e.id || ''}"><input class="input" data-n value="${esc(e.name)}" placeholder="Nombre de la evaluación"><div class="input-suffix"><input class="input" data-w inputmode="decimal" value="${e.weight}" placeholder="Peso"><span>%</span></div><input class="input" type="date" data-d value="${e.date || ''}"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-rm>${icon('x')}</button></div>`;
    const m = openModal({
      title: 'Plan de evaluación', sub: `${esc(store.groupLabel(g))} · los pesos deben sumar 100%.`, size: 'md',
      body: `<div class="stack">
        <div class="chips">${PRESETS.map((p, i) => `<button type="button" class="chip" data-p="${i}">${esc(p.name)}</button>`).join('')}</div>
        <div class="stack-sm" data-rows>${(g.evals?.length ? g.evals : [{ name: '', weight: '' }]).map(row).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-add style="align-self:flex-start">${icon('plus')} Agregar evaluación</button>
        <div class="between"><span class="muted">Total de pesos</span><b data-tot></b></div>
        <p class="hint" style="margin:0">Si cambias o quitas una evaluación que ya tiene notas, esas notas dejan de contar en el promedio.</p>
      </div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar plan</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const rows = m.el.querySelector('[data-rows]');
    const tot = () => { const t = [...rows.querySelectorAll('[data-w]')].reduce((a, i) => a + (Number(String(i.value).replace(',', '.')) || 0), 0); const el = m.el.querySelector('[data-tot]'); el.textContent = `${num(t, t % 1 ? 1 : 0)}%`; el.className = Math.abs(t - 100) < 0.01 ? 'text-success' : 'text-danger'; return t; };
    const bind = () => { rows.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { b.closest('.eval-row').remove(); tot(); }); rows.querySelectorAll('[data-w]').forEach((i) => i.oninput = tot); };
    m.el.querySelector('[data-add]').onclick = () => { rows.insertAdjacentHTML('beforeend', row()); bind(); tot(); };
    m.el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { rows.innerHTML = PRESETS[b.dataset.p].evals.map(([name, weight]) => row({ name, weight })).join(''); bind(); tot(); });
    bind(); tot();
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const t = tot();
      if (Math.abs(t - 100) > 0.01 && !(await confirmDialog({ title: 'Los pesos no suman 100%', message: `Suman ${num(t, 1)}%. El promedio se calcula igual en proporción. ¿Guardar así?`, confirmText: 'Guardar' }))) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      const list = [...rows.querySelectorAll('.eval-row')].map((r) => ({ id: r.dataset.id || '', name: r.querySelector('[data-n]').value, weight: Number(String(r.querySelector('[data-w]').value).replace(',', '.')) || 0, date: r.querySelector('[data-d]').value }));
      const saved = await saveEvals(g, list);
      toast('Plan de evaluación guardado'); done = true; m.close(); resolve(saved);
    };
  });
}

export function mount(el, { params }) {
  let groupId = params?.groupId || store.liveGroups.find((g) => store.roster(g.id).length)?.id || store.liveGroups[0]?.id || '';
  let edits = {};
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Notas y boletines</h1><p class="view-sub">Define cómo se evalúa cada grupo, carga las notas y entrega boletines. Los profesores también cargan notas desde su portal.</p></div></div>
    <div class="card card-flush"><div class="toolbar"><select class="input grow" id="n-group" style="max-width:440px"></select><div class="row" style="gap:6px" id="n-acts"></div></div></div>
    <div id="n-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);

  function draw() {
    $('#n-group').innerHTML = `<option value="">— Elige el grupo —</option>${groupOptions(groupId, { includeEnded: true })}`;
    $('#n-group').onchange = async (e) => { if (Object.keys(edits).length && !(await confirmDialog({ title: 'Notas sin guardar', message: '¿Cambiar de grupo sin guardar?', confirmText: 'Cambiar' }))) { e.target.value = groupId; return; } groupId = e.target.value; edits = {}; draw(); };
    const g = store.group(groupId);
    $('#n-acts').innerHTML = g ? `<button class="btn btn-secondary btn-sm" id="n-plan">${icon('settings')} Plan de evaluación</button><button class="btn btn-ghost btn-sm" id="n-print">${icon('print')} Boletines</button><button class="btn btn-ghost btn-sm hide-xs" id="n-sheet">${icon('file')} Acta</button>` : '';
    if (!g) { $('#n-body').innerHTML = `<div class="card">${emptyState('clipboard', 'Elige un grupo', store.liveGroups.length ? 'Selecciona el grupo para ver y cargar sus notas.' : 'Crea tus grupos en «Cursos y grupos».')}</div>`; return; }
    $('#n-plan').onclick = () => evalsEditor(g);
    const scale = scaleOf(store.settings);
    const roster = store.roster(g.id);
    const evals = g.evals || [];
    const sc = store.gradesOf(g.id);
    $('#n-print').onclick = () => roster.length ? printReportCard(roster, { groupId: g.id }) : toast('El grupo no tiene alumnos.', 'warning');
    $('#n-sheet').onclick = () => printDoc(`Acta de notas · ${store.groupLabel(g)}`, `<p class="muted">Profesor(a): ${esc(store.teacher(g.teacherId)?.name || '—')} · Escala del 0 al ${scale.max}, aprueba con ${scale.pass}</p><table><tr><th>#</th><th>Alumno</th>${evals.map((e) => `<th class="c">${esc(e.name)}<br><small>${num(e.weight, 0)}%</small></th>`).join('')}<th class="c">Promedio</th><th class="c">Asist.</th></tr>${roster.map((s, i) => { const avg = studentAverage(g, sc, s.id); const a = attendanceOf(s.id, store.sheetsOf(g.id)); return `<tr><td>${i + 1}</td><td>${esc(s.name)}</td>${evals.map((e) => `<td class="c">${sc[e.id]?.[s.id] ?? ''}</td>`).join('')}<td class="c ${avg != null ? (avg >= scale.pass ? 'ok' : 'bad') : ''}">${avg ?? ''}</td><td class="c">${a.pct ?? ''}${a.pct != null ? '%' : ''}</td></tr>`; }).join('')}</table><div class="sign"><div>${esc(store.teacher(g.teacherId)?.name || 'Profesor(a)')}</div><div>${esc(store.settings.manager || 'Dirección académica')}</div></div>`, { landscape: evals.length > 4 });
    if (!evals.length) {
      $('#n-body').innerHTML = `<div class="card">${emptyState('clipboard', 'Este grupo no tiene plan de evaluación', 'Define las evaluaciones y su peso (por ejemplo: 3 parciales de 20% y un final de 40%).')}<div class="center"><button class="btn btn-primary" id="n-plan2">${icon('plus')} Crear plan de evaluación</button></div></div>`;
      $('#n-plan2').onclick = () => evalsEditor(g);
      return;
    }
    const wt = weightTotal(g);
    const val = (sid, eid) => (edits[eid]?.[sid] !== undefined ? edits[eid][sid] : sc[eid]?.[sid] ?? '');
    const avgOf = (sid) => { const merged = {}; for (const e of evals) { const v = val(sid, e.id); merged[e.id] = { [sid]: v === '' ? null : Number(String(v).replace(',', '.')) }; } return studentAverage(g, merged, sid); };
    const stats = () => { const avgs = roster.map((s) => avgOf(s.id)).filter((x) => x != null); return { n: avgs.length, pass: avgs.filter((x) => x >= scale.pass).length, mean: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null }; };
    $('#n-body').innerHTML = `<div class="card card-flush">
      <div class="pd-3" style="padding-bottom:0"><div class="row" style="gap:8px;flex-wrap:wrap" id="n-stats"></div>${Math.abs(wt - 100) > 0.01 ? `<p class="hint text-warning">${icon('alert')} Los pesos suman ${num(wt, 1)}% (deberían sumar 100%).</p>` : ''}</div>
      ${roster.length ? `<div class="table-wrap"><table class="table grade-table"><thead><tr><th>Alumno</th>${evals.map((e) => `<th class="c"><span class="ellipsis" title="${esc(e.name)}">${esc(e.name)}</span><small>${num(e.weight, 0)}%${e.date ? ` · ${fmtDate(e.date).slice(0, 5)}` : ''}</small></th>`).join('')}<th class="c">Promedio</th><th></th></tr></thead><tbody>
        ${roster.map((s) => `<tr data-sid="${s.id}"><td><div class="row" style="gap:8px;flex-wrap:nowrap">${studentAvatar(s, 'sm')}<button class="linkish ellipsis" data-s="${s.id}" style="max-width:180px">${esc(s.name)}</button></div></td>
          ${evals.map((e) => `<td class="c"><input class="input grade-cell" data-e="${e.id}" inputmode="decimal" value="${val(s.id, e.id)}" maxlength="6"></td>`).join('')}
          <td class="c"><b class="avg" data-avg="${s.id}"></b></td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-rc="${s.id}" title="Boletín">${icon('print')}</button><button class="btn btn-ghost btn-icon btn-sm" data-wa="${s.id}" title="Enviar notas por WhatsApp">${icon('whatsapp')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="pd-3 row" style="gap:8px"><button class="btn btn-primary btn-lg grow" id="n-save" disabled>${icon('check')} Guardar notas</button></div>`
        : `<div class="pd-3">${emptyState('users', 'Grupo sin alumnos')}</div>`}</div>`;
    const paint = () => {
      for (const s of roster) { const a = avgOf(s.id); const b = el.querySelector(`[data-avg="${s.id}"]`); if (b) { b.textContent = a == null ? '—' : num(a, 2); b.className = 'avg ' + (a == null ? '' : a >= scale.pass ? 'text-success' : 'text-danger'); } }
      const st = stats();
      $('#n-stats').innerHTML = `<span class="badge badge-neutral">Escala 0–${scale.max} · aprueba con ${scale.pass}</span>${st.n ? `<span class="badge badge-success">Aprobados ${st.pass}/${st.n}</span><span class="badge badge-info">Promedio del grupo ${num(st.mean, 2)}</span>` : ''}`;
      const n = Object.values(edits).reduce((a, o) => a + Object.keys(o).length, 0);
      const btn = $('#n-save'); if (btn) { btn.disabled = !n; btn.innerHTML = `${icon('check')} ${n ? `Guardar ${n} cambio(s)` : 'Guardar notas'}`; }
    };
    paint();
    el.querySelectorAll('.grade-cell').forEach((inp) => {
      inp.oninput = () => {
        const sid = inp.closest('tr').dataset.sid; const eid = inp.dataset.e;
        let v = inp.value.trim().replace(',', '.');
        const n = Number(v);
        inp.classList.toggle('bad', v !== '' && (!isFinite(n) || n < 0 || n > scale.max));
        inp.classList.toggle('low', v !== '' && isFinite(n) && n < scale.pass);
        (edits[eid] ||= {})[sid] = v;
        paint();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const all = [...el.querySelectorAll(`.grade-cell[data-e="${inp.dataset.e}"]`)]; all[all.indexOf(inp) + 1]?.focus(); } };
      inp.onfocus = () => inp.select();
    });
    el.querySelectorAll('#n-body [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s, { tab: 'academico' }));
    el.querySelectorAll('[data-rc]').forEach((b) => b.onclick = () => printReportCard(store.student(b.dataset.rc), { groupId: g.id }));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => {
      const s = store.student(b.dataset.wa); const a = avgOf(s.id);
      const lines = evals.map((e) => { const v = val(s.id, e.id); return v === '' ? null : `• ${e.name}: *${v}*`; }).filter(Boolean).join('\n');
      waStudent('notas', { student: s, group: g, extra: `${lines}${a != null ? `\nPromedio: *${num(a, 2)}* / ${scale.max}` : ''}` });
    });
    $('#n-save')?.addEventListener('click', async (e) => {
      const bad = el.querySelector('.grade-cell.bad');
      if (bad) { toast(`Hay notas fuera de la escala (0 a ${scale.max}).`, 'warning'); bad.focus(); return; }
      setBusy(e.currentTarget, true, 'Guardando…');
      try { for (const [eid, vals] of Object.entries(edits)) await saveScores(g.id, eid, vals); edits = {}; toast('Notas guardadas'); draw(); }
      catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
    });
  }
  draw();
  const off = store.on('*', (e) => { if (Object.keys(edits).length) return; if (['groups', 'grades', 'students', 'settings'].includes(e) && !el.querySelector('.grade-cell:focus')) draw(); });
  return () => off();
}
