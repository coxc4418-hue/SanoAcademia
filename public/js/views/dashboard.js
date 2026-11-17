// SanoAcademia — Inicio: el día y el mes de la academia de un vistazo
import { store } from '../store.js';
import { esc, usd, bs, fmtLongDate, todayKey, emptyState, fmtDate, dayKey, addDays } from '../utils.js';
import { icon } from '../icons.js';
import { studentAvatar, openStudent, paymentModal, debtBadge, studentForm } from '../student.js';
import { waStudent } from '../shared.js';
import { currentPeriod, periodName, studentBalance, monthsOwed, lastPeriods, fmtHour, sheetStats, catOf, ageOf } from '../academy.js';
import { teacherPay } from '../ops.js';

export function mount(el, { navigate }) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">${hello} ${h < 12 ? '☀️' : h < 19 ? '📚' : '🌙'}</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
      <div class="view-actions" data-tour="quick">
        <button class="btn btn-primary" data-q="pay">${icon('wallet')} Registrar pago <kbd class="hide-sm">F1</kbd></button>
        <button class="btn btn-secondary" data-q="att">${icon('userCheck')} Pasar lista</button>
        <button class="btn btn-secondary" data-q="new">${icon('userPlus')} Nuevo alumno</button>
        <button class="btn btn-ghost" data-q="bill">${icon('file')} Mensualidades</button>
      </div></div>
    <div id="d-alerts"></div>
    <div class="grid-2-1">
      <div class="card" data-tour="today"><div class="card-head"><div class="card-title">${icon('calendar')} Clases de hoy</div><button class="btn btn-ghost btn-sm" data-go="horario">Horario</button></div><div id="d-today"></div></div>
      <div class="card month-card" data-tour="month" id="d-month"></div>
    </div>
    <div class="kpis mt-lg" data-tour="kpis" id="d-kpis"></div>
    <div class="grid-2 mt-lg">
      <div class="card" data-tour="debtors"><div class="card-head"><div class="card-title">${icon('alert')} Por cobrar</div><button class="btn btn-ghost btn-sm" data-go="cobranza">Cobranza</button></div><div id="d-debt"></div></div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('chart')} Facturado vs. cobrado</div><button class="btn btn-ghost btn-sm" data-go="reportes">Reportes</button></div><div id="d-chart"></div></div>
    </div>
    <div class="grid-2 mt-lg">
      <div class="card"><div class="card-head"><div class="card-title">${icon('wallet')} Últimos pagos</div><button class="btn btn-ghost btn-sm" data-go="cobranza">Ver todos</button></div><div id="d-pays"></div></div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('cake')} Cumpleaños y novedades</div><button class="btn btn-ghost btn-sm" data-go="comunicados">Comunicados</button></div><div id="d-comm"></div></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
  $('[data-q="pay"]').onclick = () => paymentModal();
  $('[data-q="att"]').onclick = () => navigate('asistencia');
  $('[data-q="new"]').onclick = async () => { const s = await studentForm(); if (s) openStudent(s.id); };
  $('[data-q="bill"]').onclick = () => navigate('mensualidades');

  function alerts() {
    const rep = store.reportedPayments; const req = store.newRequests; const pre = store.newPreEnrollments;
    $('#d-alerts').innerHTML = (rep.length ? `<div class="banner req-banner"><span>${icon('bell')} <b>${rep.length} pago(s) reportado(s)</b> desde el portal esperan tu confirmación: ${rep.slice(0, 3).map((x) => `${esc(x.studentName || x.studentCode)} (${usd(x.amount)})`).join(', ')}</span><button class="btn btn-sm btn-primary" id="d-rep">Revisar</button></div>` : '')
      + (pre.length ? `<div class="banner req-banner"><span>${icon('userPlus')} <b>${pre.length} preinscripción(es)</b> nueva(s) desde tu enlace de inscripción en línea</span><button class="btn btn-sm btn-primary" id="d-pre">Atender</button></div>` : '')
      + (req.length ? `<div class="banner lic-banner"><span>${icon('inbox')} <b>${req.length} solicitud(es)</b> o justificativo(s) sin atender</span><button class="btn btn-sm btn-secondary" id="d-req">Ver</button></div>` : '')
      + (!store.courses.length ? `<div class="banner req-banner"><span>${icon('book')} Empieza creando tus cursos y grupos con su horario; luego inscribe a tus alumnos.</span><button class="btn btn-sm btn-primary" id="d-new-c">Crear curso</button></div>` : '');
    $('#d-rep')?.addEventListener('click', () => navigate('cobranza', { tab: 'reportados' }));
    $('#d-pre')?.addEventListener('click', () => navigate('inscripciones'));
    $('#d-req')?.addEventListener('click', () => navigate('solicitudes'));
    $('#d-new-c')?.addEventListener('click', () => navigate('cursos', { new: true }));
  }

  function today() {
    const t = todayKey();
    const list = store.classesOn(t);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    $('#d-today').innerHTML = list.length ? `<div class="list">${list.map(({ group: g, slot }) => {
      const c = store.course(g.courseId);
      const sh = store.sheet(g.id, t);
      const st = sh ? sheetStats(sh) : null;
      const [fh, fm] = slot.from.split(':').map(Number); const [th, tm] = slot.to.split(':').map(Number);
      const live = nowMin >= fh * 60 + fm && nowMin < th * 60 + tm;
      const past = nowMin >= th * 60 + tm;
      return `<div class="list-item class-row ${live ? 'is-live' : ''}"><span class="class-time" style="--gc:${c?.color || catOf(c?.category).color}"><b>${fmtHour(slot.from)}</b><small>${fmtHour(slot.to)}</small></span>
        <div class="grow" style="min-width:0"><b class="ellipsis">${esc(store.groupLabel(g))}</b><div class="t-sub ellipsis">${esc(store.teacher(g.teacherId)?.name || 'Sin profesor')}${g.room ? ` · ${esc(store.roomName(g.room))}` : ''} · ${store.roster(g.id).length} alumnos${live ? ' · <b class="text-success">en clase ahora</b>' : ''}</div></div>
        ${st ? `<span class="badge badge-${st.pct >= 80 ? 'success' : st.pct >= 60 ? 'warning' : 'danger'}">${icon('check')} ${st.present}/${st.n}</span>` : `<button class="btn btn-sm ${past || live ? 'btn-primary' : 'btn-secondary'}" data-att="${g.id}">${icon('userCheck')} Lista</button>`}</div>`;
    }).join('')}</div>` : emptyState('calendar', new Date().getDay() === 0 ? 'Domingo sin clases' : 'Sin clases hoy', store.liveGroups.length ? 'Ningún grupo tiene clase programada para hoy.' : 'Crea grupos con su horario y aquí verás las clases de cada día.');
    el.querySelectorAll('[data-att]').forEach((b) => b.onclick = () => navigate('asistencia', { groupId: b.dataset.att, date: t }));
  }

  function month() {
    const p = currentPeriod();
    const cl = store.closing(p);
    const coll = store.collectedIn(p);
    const billed = cl?.totalBilled || 0;
    const pct = billed ? Math.min(100, Math.round(coll / billed * 100)) : 0;
    const teachers = store.liveTeachers;
    const pays = teachers.map((t) => teacherPay(t, p));
    const owed = pays.reduce((a, x) => a + x.amount, 0); const paid = pays.reduce((a, x) => a + x.paid, 0);
    const step = !cl ? 1 : pct < 100 ? 2 : 3;
    const st = (n, title, sub, done) => `<div class="mstep ${done ? 'done' : step === n ? 'now' : ''}"><span class="mstep-n">${done ? icon('check') : n}</span><div><b>${title}</b><small>${sub}</small></div></div>`;
    $('#d-month').innerHTML = `<div class="card-head"><div class="card-title">${icon('file')} Tu mes: ${esc(periodName(p))}</div></div>
      <div class="msteps msteps-v">
        ${st(1, 'Generar mensualidades', cl ? `${cl.receipts} alumnos · ${usd(cl.totalBilled)}` : `${store.activeStudents.length} alumnos activos`, !!cl)}
        ${st(2, 'Cobrar', cl ? `${usd(coll)} de ${usd(billed)} · ${pct}%` : `Cobrado este mes: ${usd(coll)}`, cl && pct >= 100)}
        ${st(3, 'Pagar a profesores', teachers.length ? `${usd(paid)} de ${usd(owed)} calculado` : 'Agrega tus profesores', owed > 0 && paid >= owed - 0.01)}
      </div>
      ${cl ? `<div class="progress mt-sm"><span style="width:${pct}%"></span></div>` : ''}
      <div class="month-cta"><button class="btn btn-sm ${step === 1 ? 'btn-primary' : 'btn-secondary'}" data-step="${step}">${step === 1 ? `${icon('file')} Generar mensualidades` : step === 2 ? `${icon('wallet')} Ir a cobranza` : `${icon('briefcase')} Pagar profesores`}</button></div>`;
    $('[data-step]').onclick = (e) => navigate({ 1: 'mensualidades', 2: 'cobranza', 3: 'profesores' }[e.currentTarget.dataset.step]);
  }

  function kpis() {
    const p = currentPeriod();
    const debt = store.totalDebt;
    const del = store.delinquent;
    const coll = store.collectedIn(p);
    const since = dayKey(addDays(new Date(), -30));
    const sheets = store.attendance.filter((a) => a.date >= since);
    let pres = 0, tot = 0; for (const sh of sheets) { const s = sheetStats(sh); pres += s.present; tot += s.n; }
    const attPct = tot ? Math.round(pres / tot * 100) : null;
    const cap = store.liveGroups.reduce((a, g) => a + (Number(g.capacity) || 0), 0);
    const seats = store.liveGroups.filter((g) => g.capacity).reduce((a, g) => a + store.roster(g.id).length, 0);
    const newM = store.students.filter((s) => (s.enrolledAt || '').startsWith(p)).length;
    $('#d-kpis').innerHTML = `
      <div class="card kpi kpi-link" data-go2="alumnos"><div class="kpi-top"><span class="kpi-label">Alumnos activos</span><span class="kpi-icon tone-brand">${icon('users')}</span></div><div class="kpi-value">${store.activeStudents.length}</div><div class="kpi-sub">${newM ? `<span class="text-success">+${newM} nuevos este mes</span>` : `${store.liveGroups.length} grupos activos`}</div></div>
      <div class="card kpi kpi-link" data-go2="cobranza"><div class="kpi-top"><span class="kpi-label">Por cobrar</span><span class="kpi-icon tone-danger">${icon('wallet')}</span></div><div class="kpi-value">${usd(debt)}</div><div class="kpi-sub">${store.debtors.length} alumno(s)${bs(debt) ? ` · ${bs(debt)}` : ''}</div></div>
      <div class="card kpi kpi-link" data-go2="cobranza" data-p="morosos"><div class="kpi-top"><span class="kpi-label">Morosos (2+ meses)</span><span class="kpi-icon tone-warning">${icon('alert')}</span></div><div class="kpi-value">${del.length}</div><div class="kpi-sub">${del.length ? `${usd(del.reduce((a, s) => a + studentBalance(s), 0))} en mora` : 'nadie en mora'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado en ${esc(periodName(p).split(' ')[0].toLowerCase())}</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${usd(coll)}</div><div class="kpi-sub">${store.confirmedPayments.filter((x) => (x.date || '').startsWith(p)).length} pago(s)</div></div>
      <div class="card kpi kpi-link" data-go2="asistencia"><div class="kpi-top"><span class="kpi-label">Asistencia (30 días)</span><span class="kpi-icon tone-info">${icon('userCheck')}</span></div><div class="kpi-value">${attPct == null ? '—' : attPct + '%'}</div><div class="kpi-sub">${sheets.length} clase(s) con lista</div></div>
      <div class="card kpi kpi-link" data-go2="cursos"><div class="kpi-top"><span class="kpi-label">Ocupación de cupos</span><span class="kpi-icon tone-violet">${icon('book')}</span></div><div class="kpi-value">${cap ? Math.round(seats / cap * 100) + '%' : '—'}</div><div class="kpi-sub">${cap ? `${seats} de ${cap} cupos` : 'define cupos en los grupos'}</div></div>`;
    el.querySelectorAll('[data-go2]').forEach((b) => b.onclick = () => navigate(b.dataset.go2, b.dataset.p ? { tab: b.dataset.p } : {}));
  }

  function debt() {
    const list = store.debtors.slice(0, 7);
    $('#d-debt').innerHTML = list.length ? `<div class="list">${list.map((s) => `<div class="list-item">${studentAvatar(s)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-s="${s.id}"><b>${esc(s.name)}</b></button><div class="t-sub">${debtBadge(s)} ${monthsOwed(s) ? `· ${monthsOwed(s)} mes(es)` : ''}</div></div><b class="num">${usd(studentBalance(s))}</b><button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${s.id}" title="Recordar por WhatsApp">${icon('whatsapp')}</button></div>`).join('')}</div>`
      : emptyState('checkCircle', '¡Todos al día!', 'Ningún alumno tiene deuda pendiente.');
    el.querySelectorAll('#d-debt [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s));
    el.querySelectorAll('#d-debt [data-wa]').forEach((b) => b.onclick = () => { const s = store.student(b.dataset.wa); waStudent(monthsOwed(s) >= 2 ? 'moroso' : 'recordatorio', { student: s }); });
  }

  function chart() {
    const ps = lastPeriods(6).reverse();
    const data = ps.map((p) => ({ p, billed: store.closings.filter((c) => c.period === p && c.status !== 'anulado').reduce((a, c) => a + (Number(c.totalBilled) || 0), 0), coll: store.collectedIn(p) }));
    const max = Math.max(1, ...data.map((d) => Math.max(d.billed, d.coll)));
    $('#d-chart').innerHTML = data.some((d) => d.billed || d.coll) ? `<div class="bars2">${data.map((d) => `<div class="bar2"><div class="bar2-cols"><i class="b" style="height:${d.billed / max * 100}%" title="Facturado ${usd(d.billed)}"></i><i class="c" style="height:${d.coll / max * 100}%" title="Cobrado ${usd(d.coll)}"></i></div><span>${esc(periodName(d.p, true))}</span><small>${d.billed ? Math.round(d.coll / d.billed * 100) + '%' : ''}</small></div>`).join('')}</div>
      <div class="ag-legend mt"><span><i class="lg-b"></i> Mensualidades</span><span><i class="lg-c"></i> Cobrado</span></div>`
      : emptyState('chart', 'Aún sin datos', 'Aquí verás cuánto se factura y cuánto se cobra cada mes.');
  }

  function pays() {
    const list = store.confirmedPayments.slice(0, 6);
    $('#d-pays').innerHTML = list.length ? `<div class="list">${list.map((p) => `<div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('check')}</span><div class="grow" style="min-width:0"><button class="linkish ellipsis" data-s="${p.studentId}"><b>${esc(p.studentName)}</b></button><div class="t-sub">${fmtDate(p.date)} · ${esc(p.reference ? 'ref. ' + p.reference : p.number)}</div></div><b class="num">${usd(p.amount)}</b></div>`).join('')}</div>`
      : emptyState('wallet', 'Sin pagos aún', 'Registra un pago con F1 o confírmalo desde lo que reportan los alumnos en su portal.');
    el.querySelectorAll('#d-pays [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s));
  }

  function comm() {
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i)).slice(5));
    const bdays = store.activeStudents.filter((s) => s.birthDate && days.includes(s.birthDate.slice(5))).sort((a, b) => days.indexOf(a.birthDate.slice(5)) - days.indexOf(b.birthDate.slice(5))).slice(0, 6);
    const notices = store.notices.filter((n) => !n.until || n.until >= todayKey()).slice(0, 3);
    const todayMD = todayKey().slice(5);
    $('#d-comm').innerHTML = `
      ${bdays.length ? `<div class="list">${bdays.map((s) => `<div class="list-item">${studentAvatar(s)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-s="${s.id}"><b>${esc(s.name)}</b></button><div class="t-sub">${s.birthDate.slice(5) === todayMD ? '<b class="text-success">¡Hoy!</b>' : fmtDate(new Date().getFullYear() + s.birthDate.slice(4))} · cumple ${(ageOf(s.birthDate) || 0) + (s.birthDate.slice(5) === todayMD ? 0 : 1)}</div></div><button class="btn btn-whatsapp btn-icon btn-sm" data-bd="${s.id}" title="Felicitar">${icon('whatsapp')}</button></div>`).join('')}</div>` : ''}
      ${notices.length ? `<div class="section-title ${bdays.length ? 'mt' : ''}">${icon('megaphone')} Comunicados</div><div class="list">${notices.map((n) => `<div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('bell')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(n.title)}</b><div class="t-sub">${fmtDate(n.date)}</div></div></div>`).join('')}</div>` : ''}
      ${!bdays.length && !notices.length ? emptyState('cake', 'Sin novedades', 'Aquí verás los cumpleaños de la semana y los comunicados vigentes.') : ''}`;
    el.querySelectorAll('#d-comm [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s));
    el.querySelectorAll('#d-comm [data-bd]').forEach((b) => b.onclick = () => waStudent('cumple', { student: store.student(b.dataset.bd) }, 'auto'));
  }

  const all = () => { alerts(); today(); month(); kpis(); debt(); chart(); pays(); comm(); };
  all();
  const iv = setInterval(today, 60000);
  const off = store.on('*', (evt) => {
    if (['students', 'payments', 'closings', 'settings', 'rate', 'payouts', 'teachers'].includes(evt)) { month(); kpis(); debt(); chart(); pays(); comm(); }
    if (['groups', 'courses', 'attendance'].includes(evt)) { today(); kpis(); month(); }
    if (evt === 'inbox') { alerts(); }
    if (evt === 'courses') alerts();
    if (evt === 'notices') comm();
  });
  return () => { off(); clearInterval(iv); };
}
