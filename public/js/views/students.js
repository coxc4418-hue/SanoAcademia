// SanoAcademia — Alumnos: lista con filtros, ficha, importación, exportación y carnets
import { store } from '../store.js';
import { esc, usd, emptyState, normalize, debounce, toast, download, toCSV, parseCSV, openModal, setBusy, num, loc } from '../utils.js';
import { icon } from '../icons.js';
import { studentAvatar, openStudent, studentForm, debtBadge, groupChip, studentGroups, studentSub, paymentModal, groupOptions } from '../student.js';
import { waStudent, printCard } from '../shared.js';
import { studentBalance, monthsOwed, STUDENT_STATUS, badge, contactPhone, contactName, ageOf } from '../academy.js';
import { importStudents } from '../ops.js';

const FILTERS = [['activo', 'Activos'], ['deuda', 'Con deuda'], ['morosos', 'Morosos'], ['sin_grupo', 'Sin grupo'], ['menores', 'Menores'], ['pausado', 'En pausa'], ['retirado', 'Retirados'], ['egresado', 'Egresados'], ['todos', 'Todos']];

export function mount(el, { params }) {
  let filter = params?.tab || 'activo';
  let groupId = params?.groupId || '';
  let q = '';
  let limit = 60;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Alumnos</h1><p class="view-sub">Ficha completa de cada alumno: datos, representante, grupos, pagos, asistencia, notas y documentos.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="s-new">${icon('userPlus')} Nuevo alumno</button><button class="btn btn-secondary" id="s-imp">${icon('upload')} Importar</button><button class="btn btn-ghost" id="s-csv">${icon('download')} Exportar</button><button class="btn btn-ghost" id="s-cards">${icon('card')} Carnets</button></div></div>
    <div class="card card-flush">
      <div class="toolbar"><label class="search grow">${icon('search')}<input id="s-q" placeholder="Nombre, matrícula, cédula, teléfono o representante…" autocomplete="off"></label><select class="input" id="s-g" style="max-width:280px"></select></div>
      <div class="chips" id="s-f" style="padding:0 16px 12px"></div>
      <div id="s-list"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  const filtered = () => {
    const t = normalize(q).replace(/\s+/g, '');
    return store.students.filter((s) => {
      if (filter === 'activo' && s.status !== 'activo') return false;
      if (['pausado', 'retirado', 'egresado'].includes(filter) && s.status !== filter) return false;
      if (filter === 'deuda' && !(studentBalance(s) > 0.009)) return false;
      if (filter === 'morosos' && monthsOwed(s) < 2) return false;
      if (filter === 'sin_grupo' && (s.status !== 'activo' || studentGroups(s).some((g) => g.status !== 'finalizado'))) return false;
      if (filter === 'menores' && !(ageOf(s.birthDate) != null && ageOf(s.birthDate) < 18 && s.status === 'activo')) return false;
      if (groupId && !(s.groupIds || []).includes(groupId)) return false;
      if (t && !normalize(`${s.name}${s.code}${s.idDoc}${s.phone}${s.guardianName}${s.guardianPhone}${s.email}`).replace(/\s+/g, '').includes(t)) return false;
      return true;
    });
  };
  function chips() {
    const count = (k) => { const prev = filter; filter = k; const n = filtered().length; filter = prev; return n; };
    $('#s-f').innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l} <span class="chip-n">${count(k)}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; limit = 60; draw(); });
    $('#s-g').innerHTML = groupOptions(groupId, { all: true, allLabel: 'Todos los grupos', includeEnded: true });
    $('#s-g').onchange = (e) => { groupId = e.target.value; limit = 60; draw(); };
  }
  function list() {
    const rows = filtered();
    const shown = rows.slice(0, limit);
    $('#s-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Alumno</th><th class="hide-sm">Grupos</th><th class="hide-md">Contacto</th><th class="r">Saldo</th><th></th></tr></thead><tbody>
      ${shown.map((s) => `<tr>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap">${studentAvatar(s)}<div style="min-width:0"><button class="linkish ellipsis" data-s="${s.id}"><b>${esc(s.name)}</b></button><div class="t-sub ellipsis">${esc(studentSub(s))}${s.status !== 'activo' ? ` · ${badge(STUDENT_STATUS, s.status)}` : ''}${s.discountPct ? ` · <span class="badge badge-violet">${s.discountPct}% beca</span>` : ''}</div></div></div></td>
        <td class="hide-sm"><div class="chips-wrap">${studentGroups(s).filter((g) => g.status !== 'finalizado').map(groupChip).join('') || '<span class="t-sub">Sin grupo</span>'}</div></td>
        <td class="hide-md small">${esc(contactName(s))}<div class="t-sub">${esc(contactPhone(s))}</div></td>
        <td class="r"><b class="num ${studentBalance(s) > 0.009 ? 'text-danger' : studentBalance(s) < -0.009 ? 'text-success' : ''}">${usd(Math.abs(studentBalance(s)))}</b><div>${debtBadge(s)}</div></td>
        <td class="r" style="white-space:nowrap">${contactPhone(s) ? `<button class="btn btn-ghost btn-icon btn-sm" data-wa="${s.id}" title="WhatsApp">${icon('whatsapp')}</button>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-pay="${s.id}" title="Registrar pago">${icon('wallet')}</button></td></tr>`).join('')}
      </tbody></table></div>${rows.length > limit ? `<div class="center pd-3"><button class="btn btn-secondary" id="s-more">Ver ${Math.min(60, rows.length - limit)} más (de ${rows.length})</button></div>` : `<div class="t-sub center" style="padding:10px">${rows.length} alumno(s)</div>`}`
      : `<div class="pd-3">${emptyState('users', store.students.length ? 'Sin resultados' : 'Aún no tienes alumnos', store.students.length ? 'Prueba con otro filtro o búsqueda.' : 'Agrega tu primer alumno o importa tu lista desde Excel.')}</div>`;
    el.querySelectorAll('#s-list [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s));
    el.querySelectorAll('#s-list [data-wa]').forEach((b) => b.onclick = () => { const s = store.student(b.dataset.wa); waStudent(studentBalance(s) > 0.009 ? (monthsOwed(s) >= 2 ? 'moroso' : 'recordatorio') : 'portal', { student: s }); });
    el.querySelectorAll('#s-list [data-pay]').forEach((b) => b.onclick = () => paymentModal(store.student(b.dataset.pay)));
    $('#s-more')?.addEventListener('click', () => { limit += 60; list(); });
  }
  function draw() { chips(); list(); }

  $('#s-q').oninput = debounce((e) => { q = e.target.value; limit = 60; draw(); }, 200);
  $('#s-new').onclick = async () => { const s = await studentForm(null, groupId ? { groupIds: [groupId] } : {}); if (s) openStudent(s.id); };
  $('#s-csv').onclick = () => {
    const rows = filtered();
    download(`alumnos-${filter}.csv`, toCSV([['Matrícula', 'Nombre', loc().id, 'Nacimiento', 'Edad', 'Teléfono', 'Correo', 'Representante', 'Tel. representante', 'Grupos', 'Estado', 'Beca %', 'Saldo', 'Meses debe', 'Inscrito', 'Portal'],
      ...rows.map((s) => [s.code, s.name, s.idDoc || '', s.birthDate || '', ageOf(s.birthDate) ?? '', s.phone || '', s.email || '', s.guardianName || '', s.guardianPhone || '', studentGroups(s).map((g) => store.groupLabel(g)).join(' | '), STUDENT_STATUS[s.status]?.label || s.status, s.discountPct || '', num(studentBalance(s)), monthsOwed(s), s.enrolledAt || '', s.portalCode || ''])]), 'text/csv;charset=utf-8');
  };
  $('#s-cards').onclick = () => { const rows = filtered().filter((s) => s.status === 'activo'); if (!rows.length) { toast('No hay alumnos activos en esta lista.', 'warning'); return; } printCard(rows.slice(0, 120)); };
  $('#s-imp').onclick = () => {
    let rows = [];
    const m = openModal({
      title: 'Importar alumnos', size: 'md', sub: 'Desde Excel: guarda como CSV con estas columnas (en este orden). La primera fila puede ser de títulos.',
      body: `<div class="stack"><div class="code-box small">Nombre ; ${esc(loc().id)} ; Nacimiento (AAAA-MM-DD) ; Teléfono ; Correo ; Representante ; Tel. representante ; Deuda anterior</div>
        <div class="field"><label>Inscribir a todos en el grupo (opcional)</label><select class="input" data-g>${groupOptions('', { all: true, allLabel: '— No inscribir —' })}</select></div>
        <input class="input" type="file" accept=".csv,text/csv" data-file><div data-prev class="small"></div><div class="error-msg" data-err></div>
        <button type="button" class="btn btn-ghost btn-sm" data-tpl style="align-self:flex-start">${icon('download')} Descargar plantilla</button></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('upload')} Importar</button>`
    });
    m.el.querySelector('[data-tpl]').onclick = () => download('plantilla-alumnos.csv', toCSV([['Nombre', loc().id, 'Nacimiento', 'Teléfono', 'Correo', 'Representante', 'Tel. representante', 'Deuda anterior'], ['María Pérez', 'V-30111222', '2012-04-18', '', '', 'Ana Pérez', '04141234567', '0'], ['Carlos Díaz', 'V-25999888', '1999-11-02', '04241112233', 'carlos@correo.com', '', '', '25']]), 'text/csv;charset=utf-8');
    m.el.querySelector('[data-file]').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const all = parseCSV(await f.text());
      const first = (all[0] || []).join(' ').toLowerCase();
      const data = /nombre|alumno|represent/.test(first) ? all.slice(1) : all;
      rows = data.map((r) => ({ name: r[0], idDoc: r[1] || '', birthDate: /^\d{4}-\d{2}-\d{2}$/.test(r[2] || '') ? r[2] : '', phone: r[3] || '', email: r[4] || '', guardianName: r[5] || '', guardianPhone: r[6] || '', debt: r[7] || '' })).filter((r) => r.name);
      m.el.querySelector('[data-prev]').innerHTML = `<b>${rows.length}</b> alumno(s) leídos${rows.slice(0, 4).map((r) => `<div class="t-sub">${esc(r.name)}${r.idDoc ? ` · ${esc(r.idDoc)}` : ''}${r.guardianName ? ` · rep. ${esc(r.guardianName)}` : ''}</div>`).join('')}`;
      m.el.querySelector('[data-ok]').disabled = !rows.length;
    };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true, 'Importando…');
      const gid = m.el.querySelector('[data-g]').value;
      try { const r = await importStudents(rows.map((x) => ({ ...x, groupId: gid }))); m.close(); toast(`Listo: ${r.created} nuevo(s), ${r.updated} actualizado(s)`); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  };

  draw();
  if (params?.new) $('#s-new').click();
  const off = store.on('*', (e) => { if (['students', 'groups', 'courses'].includes(e)) draw(); });
  return () => off();
}
