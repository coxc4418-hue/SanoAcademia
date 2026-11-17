// SanoAcademia — Profesores: fichas, portal del profesor, horas dictadas y pago mensual
import { store } from '../store.js';
import { esc, usd, bs, num, emptyState, toast, openModal, setBusy, confirmDialog, parseNum, fmtDate, todayKey, PAY_METHODS, methodLabel, initials, colorFor, waLink, promptDialog, download, toCSV } from '../utils.js';
import { icon } from '../icons.js';
import { PAY_MODES, currentPeriod, periodName, lastPeriods, scheduleText, weeklyHours } from '../academy.js';
import { saveTeacher, renewTeacherCode, setTeacherActive, teacherPay, payTeacher, voidPayout } from '../ops.js';
import { TEACHER_URL, qrDataURL, printPayout, printDoc } from '../shared.js';

const avatar = (t) => `<span class="s-av" style="background:${colorFor(t.name || '?')}">${esc(initials(t.name || '?'))}</span>`;
const rateText = (t) => t.payMode === 'pct' ? `${num(t.rate, 0)}% de mensualidades` : `${usd(t.rate || 0)} ${t.payMode === 'hora' ? 'por hora' : t.payMode === 'clase' ? 'por clase' : 'al mes'}`;

export function teacherForm(t0 = null) {
  return new Promise((resolve) => {
    const t = t0 || { payMode: 'hora' };
    let done = false;
    const m = openModal({
      title: t0 ? 'Editar profesor' : 'Nuevo profesor', size: 'md',
      body: `<form class="stack" data-f>
        <div class="form-grid">
          <div class="field"><label>Nombre completo *</label><input class="input" name="name" value="${esc(t.name || '')}" required maxlength="80"></div>
          <div class="field"><label>Cédula / documento</label><input class="input" name="idDoc" value="${esc(t.idDoc || '')}"></div>
          <div class="field"><label>Teléfono (WhatsApp)</label><input class="input" name="phone" inputmode="tel" value="${esc(t.phone || '')}"></div>
          <div class="field"><label>Correo</label><input class="input" name="email" type="email" value="${esc(t.email || '')}"></div>
          <div class="field"><label>Especialidad</label><input class="input" name="specialty" value="${esc(t.specialty || '')}" placeholder="Ej.: Inglés, piano, programación"></div>
          <div class="field"><label>Forma de pago</label><select class="input" name="payMode">${Object.entries(PAY_MODES).map(([k, v]) => `<option value="${k}" ${t.payMode === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
          <div class="field"><label data-rl>Tarifa</label><input class="input" name="rate" inputmode="decimal" value="${t.rate ?? ''}" placeholder="0,00"></div>
          <div class="field"><label>Datos para pagarle</label><input class="input" name="bank" value="${esc(t.bank || '')}" placeholder="Banco, cuenta o pago móvil"></div>
        </div>
        <div class="field"><label>Notas</label><textarea class="input" name="notes" rows="2">${esc(t.notes || '')}</textarea></div>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]');
    const lbl = () => { m.el.querySelector('[data-rl]').textContent = { hora: 'Tarifa por hora', clase: 'Tarifa por clase', fijo: 'Sueldo mensual', pct: 'Porcentaje (%)' }[F.payMode.value]; };
    F.payMode.onchange = lbl; lbl();
    const go = async (e) => {
      e?.preventDefault();
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try { const r = await saveTeacher({ name: F.name.value, idDoc: F.idDoc.value, phone: F.phone.value, email: F.email.value, specialty: F.specialty.value, payMode: F.payMode.value, rate: parseNum(F.rate.value), bank: F.bank.value, notes: F.notes.value, active: t.active !== false }, t0?.id); toast('Profesor guardado'); done = true; m.close(); resolve(r); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(btn, false); }
    };
    F.onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

async function portalModal(t) {
  if (!t.portalCode) { toast('Guarda el profesor para generar su portal.', 'warning'); return; }
  const url = TEACHER_URL(t);
  const qr = await qrDataURL(url, 5);
  const text = `Hola ${t.name.split(' ')[0]} 👋, este es tu portal de profesor de *${store.businessName}*:\n${url}\n\nAhí ves tus grupos y horario, pasas la lista y cargas las notas desde el teléfono, y ves tus horas del mes. Guárdalo en tu pantalla de inicio.`;
  const m = openModal({ title: 'Portal del profesor', size: 'sm', sub: esc(t.name),
    body: `<div class="center stack"><img src="${qr}" alt="" style="width:200px;height:200px;margin:0 auto;image-rendering:pixelated"><div class="code-box mono">${esc(t.portalCode)}</div><div class="t-sub" style="word-break:break-all">${esc(url)}</div>
      <div class="row" style="gap:6px;justify-content:center;flex-wrap:wrap"><a class="btn btn-whatsapp" href="${t.phone ? waLink(t.phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('whatsapp')} Enviar</a><button class="btn btn-secondary" data-cp>${icon('copy')} Copiar</button><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">${icon('external')} Abrir</a></div>
      <button class="btn btn-ghost btn-sm" data-new>${icon('refresh')} Cambiar código (el anterior deja de funcionar)</button></div>` });
  m.el.querySelector('[data-cp]').onclick = () => navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'));
  m.el.querySelector('[data-new]').onclick = async () => { if (!(await confirmDialog({ title: 'Cambiar código', message: 'El enlace anterior dejará de funcionar.', confirmText: 'Cambiar' }))) return; await renewTeacherCode(t); m.close(); portalModal(store.teacher(t.id)); };
}

function payModal(t, period) {
  const p = teacherPay(t, period);
  const methods = Object.entries(PAY_METHODS).length ? Object.entries(PAY_METHODS) : [['transferencia', { label: 'Transferencia' }], ['efectivo_usd', { label: 'Efectivo' }]];
  const detail = p.byGroup.map((x) => `${store.groupLabel(x.group)}: ${x.classes} clase(s), ${num(x.hours, 1)} h`).join(' · ');
  const m = openModal({ title: `Pagar a ${esc(t.name)}`, size: 'md', sub: `${periodName(period)} · ${PAY_MODES[t.payMode]?.label || ''}`,
    body: `<form class="stack" data-f>
      <div class="kv"><div><span>Clases dictadas</span><b>${p.classes}</b></div><div><span>Horas</span><b>${num(p.hours, 1)}</b></div><div><span>Tarifa</span><b>${esc(rateText(t))}</b></div><div><span>Calculado</span><b>${usd(p.amount)}</b></div><div><span>Ya pagado</span><b>${usd(p.paid)}</b></div><div><span>Pendiente</span><b class="${p.pending > 0 ? 'text-danger' : 'text-success'}">${usd(p.pending)}</b></div></div>
      ${p.byGroup.length ? `<div class="t-sub">${esc(detail)}</div>` : '<p class="hint" style="margin:0">No hay listas de asistencia de sus grupos este mes. El pago por hora o por clase se calcula con las listas pasadas.</p>'}
      <div class="form-grid">
        <div class="field"><label>Monto a pagar *</label><input class="input input-lg" name="amount" inputmode="decimal" value="${p.pending > 0 ? num(p.pending) : ''}"></div>
        <div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${todayKey()}"></div>
        <div class="field"><label>Forma de pago</label><select class="input" name="method">${methods.map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Referencia</label><input class="input" name="reference"></div>
      </div>
      ${t.bank ? `<div class="hint">${icon('card')} ${esc(t.bank)}</div>` : ''}
      <div class="field"><label>Nota</label><input class="input" name="note" placeholder="Ej.: adelanto, bono, horas extra"></div>
      <div class="error-msg" data-err></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success" data-ok>${icon('check')} Registrar pago</button>` });
  const F = m.el.querySelector('[data-f]');
  const go = async (e) => {
    e?.preventDefault();
    const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Guardando…');
    try {
      const r = await payTeacher(t, { period, amount: parseNum(F.amount.value), method: F.method.value, reference: F.reference.value, note: F.note.value, date: F.date.value, detail: `Honorarios ${periodName(period)} · ${p.classes} clase(s), ${num(p.hours, 1)} h${detail ? ` (${detail})` : ''}` });
      m.close(); toast('Pago registrado');
      if (await confirmDialog({ title: 'Pago registrado', message: `${usd(r.amount)} a ${t.name}. ¿Imprimir el recibo?`, confirmText: 'Imprimir', cancelText: 'Listo' })) printPayout(r);
    } catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(btn, false); }
  };
  F.onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
}

export function mount(el, { params }) {
  let period = currentPeriod();
  let tab = params?.tab || 'equipo';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Profesores</h1><p class="view-sub">Tu equipo, sus grupos y lo que hay que pagarle cada mes según las clases dictadas.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="t-new">${icon('userPlus')} Nuevo profesor</button></div></div>
    <div class="tabs" id="t-tabs"></div>
    <div id="t-body"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#t-new').onclick = () => teacherForm();
  function tabs() {
    $('#t-tabs').innerHTML = [['equipo', 'Equipo'], ['pagos', 'Pago del mes'], ['historial', 'Recibos pagados']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  }
  function equipo() {
    const list = store.teachers.slice().sort((a, b) => (b.active !== false) - (a.active !== false));
    $('#t-body').innerHTML = list.length ? `<div class="grid-cards">${list.map((t) => { const gs = store.teacherGroups(t.id); const hrs = gs.reduce((a, g) => a + weeklyHours(g), 0); const p = teacherPay(t, period);
      return `<div class="card teacher-card ${t.active === false ? 'is-off' : ''}"><div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(t)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(t.name)}</b><div class="t-sub ellipsis">${esc(t.specialty || 'Profesor(a)')}${t.active === false ? ' · inactivo' : ''}</div></div><button class="btn btn-ghost btn-icon btn-sm" data-e="${t.id}" title="Editar">${icon('edit')}</button></div>
        <div class="kv kv-3 mt"><div><span>Grupos</span><b>${gs.length}</b></div><div><span>Horas/sem.</span><b>${num(hrs, 1)}</b></div><div><span>Este mes</span><b>${usd(p.amount)}</b></div></div>
        <div class="stack-xs mt-xs">${gs.slice(0, 4).map((g) => `<div class="t-sub ellipsis">${icon('clock')} ${esc(store.groupLabel(g))} · ${esc(scheduleText(g))}</div>`).join('') || '<div class="t-sub">Sin grupos asignados</div>'}</div>
        <div class="t-sub mt-xs">${esc(rateText(t))}</div>
        <div class="row mt" style="gap:6px;flex-wrap:wrap"><button class="btn btn-secondary btn-sm" data-portal="${t.id}">${icon('qr')} Portal</button>${t.phone ? `<a class="btn btn-ghost btn-sm" href="${waLink(t.phone, `Hola ${t.name.split(' ')[0]}, `)}" target="_blank" rel="noopener">${icon('whatsapp')}</a>` : ''}<button class="btn btn-ghost btn-sm" data-act="${t.id}">${t.active === false ? `${icon('check')} Activar` : `${icon('pause')} Desactivar`}</button></div></div>`; }).join('')}</div>`
      : `<div class="card">${emptyState('briefcase', 'Sin profesores', 'Agrega a tus profesores para asignarlos a los grupos y calcular su pago.')}</div>`;
    el.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => teacherForm(store.teacher(b.dataset.e)));
    el.querySelectorAll('[data-portal]').forEach((b) => b.onclick = () => portalModal(store.teacher(b.dataset.portal)));
    el.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => { const t = store.teacher(b.dataset.act); await setTeacherActive(t, t.active === false); toast(t.active === false ? 'Profesor activado' : 'Profesor desactivado (su portal deja de funcionar)'); });
  }
  function pagos() {
    const list = store.liveTeachers.map((t) => ({ t, p: teacherPay(t, period) }));
    const tot = list.reduce((a, x) => ({ amount: a.amount + x.p.amount, paid: a.paid + x.p.paid, pending: a.pending + x.p.pending }), { amount: 0, paid: 0, pending: 0 });
    $('#t-body').innerHTML = `<div class="card card-flush"><div class="toolbar"><div class="chips">${lastPeriods(4).map((p) => `<button class="chip ${period === p ? 'on' : ''}" data-m="${p}">${esc(periodName(p))}</button>`).join('')}</div><button class="btn btn-ghost btn-sm" id="t-print">${icon('print')} Imprimir nómina</button></div>
      <div class="pd-3" style="padding-bottom:0"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="badge badge-neutral">Calculado ${usd(tot.amount)}</span><span class="badge badge-success">Pagado ${usd(tot.paid)}</span><span class="badge badge-${tot.pending > 0 ? 'danger' : 'success'}">Pendiente ${usd(tot.pending)}${bs(tot.pending) ? ` · ${bs(tot.pending)}` : ''}</span></div></div>
      ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Profesor</th><th class="c">Clases</th><th class="c">Horas</th><th class="hide-sm">Tarifa</th><th class="r">Calculado</th><th class="r">Pagado</th><th></th></tr></thead><tbody>
        ${list.map(({ t, p }) => `<tr><td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(t)}<b class="ellipsis">${esc(t.name)}</b></div></td><td class="c">${p.classes}</td><td class="c">${num(p.hours, 1)}</td><td class="hide-sm small">${esc(rateText(t))}</td><td class="r"><b class="num">${usd(p.amount)}</b></td><td class="r">${usd(p.paid)}${p.pending <= 0.009 && p.amount > 0 ? ` <span class="badge badge-success">${icon('check')}</span>` : ''}</td><td class="r"><button class="btn ${p.pending > 0 ? 'btn-success' : 'btn-ghost'} btn-sm" data-pay="${t.id}">${icon('wallet')} Pagar</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="pd-3">${emptyState('briefcase', 'Sin profesores activos')}</div>`}
      <p class="hint pd-3" style="margin:0">El pago por hora o por clase se calcula con las listas de asistencia pasadas en cada grupo del profesor.</p></div>`;
    el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { period = b.dataset.m; pagos(); });
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payModal(store.teacher(b.dataset.pay), period));
    $('#t-print').onclick = () => printDoc(`Nómina de profesores · ${periodName(period)}`, `<table><tr><th>Profesor</th><th class="c">Clases</th><th class="c">Horas</th><th>Tarifa</th><th class="r">Calculado</th><th class="r">Pagado</th><th class="r">Pendiente</th></tr>${list.map(({ t, p }) => `<tr><td>${esc(t.name)}</td><td class="c">${p.classes}</td><td class="c">${num(p.hours, 1)}</td><td>${esc(rateText(t))}</td><td class="r">${usd(p.amount)}</td><td class="r">${usd(p.paid)}</td><td class="r">${usd(p.pending)}</td></tr>`).join('')}<tr class="tot"><td colspan="4">Total</td><td class="r">${usd(tot.amount)}</td><td class="r">${usd(tot.paid)}</td><td class="r">${usd(tot.pending)}</td></tr></table>`);
  }
  function historial() {
    const list = store.payouts.slice(0, 120);
    $('#t-body').innerHTML = `<div class="card card-flush"><div class="toolbar"><div class="grow"></div><button class="btn btn-ghost btn-sm" id="t-csv">${icon('download')} CSV</button></div>${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>N°</th><th>Profesor</th><th class="hide-sm">Mes</th><th class="hide-sm">Forma de pago</th><th class="r">Monto</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr class="${p.status === 'anulado' ? 'is-void' : ''}"><td>${fmtDate(p.date)}</td><td class="mono small">${esc(p.number)}</td><td>${esc(p.teacherName)}</td><td class="hide-sm">${esc(periodName(p.period))}</td><td class="hide-sm">${esc(methodLabel(p.method))}${p.reference ? ` · ${esc(p.reference)}` : ''}</td><td class="r"><b class="num">${usd(p.amount)}</b>${p.status === 'anulado' ? '<div class="badge badge-neutral">Anulado</div>' : ''}</td><td class="r" style="white-space:nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-pp="${p.id}">${icon('print')}</button>${p.status !== 'anulado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-pv="${p.id}">${icon('x')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="pd-3">${emptyState('receipt', 'Sin pagos a profesores')}</div>`}</div>`;
    el.querySelectorAll('[data-pp]').forEach((b) => b.onclick = () => printPayout(store.payouts.find((p) => p.id === b.dataset.pp)));
    el.querySelectorAll('[data-pv]').forEach((b) => b.onclick = async () => { const { requirePin } = await import('../auth.js'); if (!(await requirePin('Anular un pago a profesor'))) return; await voidPayout(store.payouts.find((p) => p.id === b.dataset.pv)); toast('Pago anulado'); });
    $('#t-csv').onclick = () => download('pagos-profesores.csv', toCSV([['Fecha', 'N°', 'Profesor', 'Mes', 'Forma de pago', 'Referencia', 'Monto', 'Estado'], ...list.map((p) => [p.date, p.number, p.teacherName, p.period, methodLabel(p.method), p.reference || '', num(p.amount), p.status])]), 'text/csv;charset=utf-8');
  }
  function draw() { tabs(); if (tab === 'equipo') equipo(); else if (tab === 'pagos') pagos(); else historial(); }
  draw();
  const off = store.on('*', (e) => { if (['teachers', 'groups', 'attendance', 'payouts', 'students', 'settings'].includes(e)) draw(); });
  return () => off();
}
