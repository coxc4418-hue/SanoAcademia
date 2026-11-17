// SanoAcademia — Búsqueda global (Ctrl + K): alumnos, representantes, cursos, grupos, profesores y pagos
import { store } from '../store.js';
import { openModal, esc, usd, normalize, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { studentAvatar, openStudent, debtBadge, studentSub } from '../student.js';
import { scheduleText } from '../academy.js';

export function openSearch() {
  if (document.querySelector('.search-modal')) return;
  const m = openModal({
    size: 'lg',
    body: `<div class="search search-big">${icon('search')}<input data-q placeholder="Alumno, representante, cédula, teléfono, curso, profesor o N° de pago…" autofocus autocomplete="off"></div><div data-res class="mt"></div>`
  });
  m.el.querySelector('.modal').classList.add('search-modal');
  const input = m.el.querySelector('[data-q]');
  const res = m.el.querySelector('[data-res]');
  const go = async (route, params = {}) => { m.close(); (await import('../main.js')).navigate(route, { params, force: true }); };
  const hint = () => `<div class="t-sub center pd-3">Escribe para buscar entre ${store.students.length} alumnos, ${store.groups.length} grupos y ${store.teachers.length} profesores.</div>
    <div class="row" style="gap:6px;justify-content:center;flex-wrap:wrap">${[['asistencia', 'Pasar lista', 'userCheck'], ['cobranza', 'Cobranza', 'wallet'], ['mensualidades', 'Mensualidades', 'file'], ['horario', 'Horario', 'calendar']].map(([r, l, i]) => `<button class="chip" data-go="${r}">${icon(i)} ${l}</button>`).join('')}</div>`;
  function bind() {
    res.querySelectorAll('[data-u]').forEach((x) => x.onclick = () => { m.close(); openStudent(x.dataset.u); });
    res.querySelectorAll('[data-g]').forEach((x) => x.onclick = async () => { m.close(); const { openGroup } = await import('./courses.js'); const { navigate } = await import('../main.js'); openGroup(x.dataset.g, { navigate }); });
    res.querySelectorAll('[data-t]').forEach((x) => x.onclick = () => go('profesores'));
    res.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => go(x.dataset.go));
  }
  function run() {
    const raw = input.value.trim();
    const t = normalize(raw);
    const digits = raw.replace(/\D/g, '');
    if (!t) { res.innerHTML = hint(); bind(); return; }
    const studs = store.students.filter((s) => {
      if (normalize([s.name, s.code, s.idDoc, s.guardianName, s.email, s.portalCode].filter(Boolean).join(' ')).includes(t)) return true;
      return digits.length >= 4 && [s.phone, s.guardianPhone, s.idDoc].some((p) => String(p || '').replace(/\D/g, '').includes(digits));
    }).sort((a, b) => (a.status === 'activo' ? -1 : 1) - (b.status === 'activo' ? -1 : 1)).slice(0, 10);
    const groups = store.groups.filter((g) => normalize(`${store.groupLabel(g)} ${store.teacher(g.teacherId)?.name || ''}`).includes(t)).slice(0, 6);
    const teachers = store.teachers.filter((x) => normalize(`${x.name} ${x.specialty || ''}`).includes(t)).slice(0, 4);
    const pays = store.payments.filter((p) => normalize([p.number, p.reference].join(' ')).includes(t)).slice(0, 6);
    res.innerHTML = (studs.length || groups.length || teachers.length || pays.length) ? `
      ${studs.length ? `<div class="section-title">Alumnos</div><div class="list">${studs.map((s) => `<button class="list-item click" data-u="${s.id}">${studentAvatar(s)}<div class="grow" style="min-width:0;text-align:left"><b>${esc(s.name)}</b><div class="t-sub ellipsis">${esc(studentSub(s))}</div></div>${debtBadge(s)}</button>`).join('')}</div>` : ''}
      ${groups.length ? `<div class="section-title mt">Grupos</div><div class="list">${groups.map((g) => `<button class="list-item click" data-g="${g.id}"><span class="kpi-icon tone-brand" style="width:34px;height:34px">${icon('book')}</span><div class="grow" style="text-align:left;min-width:0"><b>${esc(store.groupLabel(g))}</b><div class="t-sub ellipsis">${esc(scheduleText(g))} · ${store.roster(g.id).length} alumnos</div></div></button>`).join('')}</div>` : ''}
      ${teachers.length ? `<div class="section-title mt">Profesores</div><div class="list">${teachers.map((x) => `<button class="list-item click" data-t="${x.id}"><span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon('briefcase')}</span><div class="grow" style="text-align:left"><b>${esc(x.name)}</b><div class="t-sub">${esc(x.specialty || '')} · ${store.teacherGroups(x.id).length} grupo(s)</div></div></button>`).join('')}</div>` : ''}
      ${pays.length ? `<div class="section-title mt">Pagos</div><div class="list">${pays.map((p) => `<button class="list-item click" data-u="${p.studentId}"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('cash')}</span><div class="grow" style="text-align:left"><b>${esc(p.number || '')}</b> · ${esc(p.studentName)}<div class="t-sub">${esc(p.date)} · ref. ${esc(p.reference || '—')}${p.status === 'anulado' ? ' · ANULADO' : ''}</div></div><b class="num">${usd(p.amount)}</b></button>`).join('')}</div>` : ''}`
      : `<div class="t-sub center pd-3">Sin resultados para «${esc(raw)}».</div>`;
    bind();
  }
  input.addEventListener('input', debounce(run, 120));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') res.querySelector('[data-u],[data-g]')?.click(); });
  run();
  setTimeout(() => input.focus(), 30);
}
