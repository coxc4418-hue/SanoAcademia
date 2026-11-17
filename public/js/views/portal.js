// SanoAcademia — Portal público del alumno: /portal/CODIGO (sin usuario ni contraseña)
import { getPortal } from '../store.js';
import { db, doc, collection, setDoc } from '../firebase.js';
import { esc, num, fmtDate, waLink, applyLocale, usd, setFx, bs, fx, toast, todayKey, parseNum, round2, nowISO, methodLabel, PAY_METHODS, loc } from '../utils.js';
import { icon } from '../icons.js';
import { REQUEST_CATS, NOTICE_KINDS, periodName, DAYS, DAYS_SHORT, WEEK, fmtHour, ATT } from '../academy.js';

const ST = { pagado: ['Pagado', 'success'], parcial: ['Abonado', 'warning'], pendiente: ['Pendiente', 'neutral'], vencido: ['Vencido', 'danger'] };
const RST = { nueva: ['Enviado · por revisar', 'info'], procesada: ['Confirmado', 'success'], rechazada: ['No confirmado', 'danger'], en_proceso: ['En proceso', 'warning'], resuelta: ['Resuelta', 'success'], descartada: ['Cerrada', 'neutral'] };
const BANK_TYPES = { transferencia: 'Transferencia', pagomovil: 'Pago móvil', zelle: 'Zelle', efectivo: 'Efectivo en la recepción', otro: 'Otro' };
const b = (map, k) => { const [l, t] = map[k] || [k, 'neutral']; return `<span class="badge badge-${t}">${esc(l)}</span>`; };
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } };
const toM = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

/** Próxima clase de una lista de grupos públicos */
export function nextClass(groups) {
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const dow = d.getDay(); const nowMin = i === 0 ? now.getHours() * 60 + now.getMinutes() : -1;
    const list = [];
    for (const g of groups) for (const s of g.schedule || []) if (Number(s.day) === dow && toM(s.to) > nowMin) list.push({ g, s, i, d });
    list.sort((a, b2) => toM(a.s.from) - toM(b2.s.from));
    if (list.length) return list[0];
  }
  return null;
}
export function weekHTML(groups) {
  const days = WEEK.filter((d) => groups.some((g) => (g.schedule || []).some((s) => Number(s.day) === d)));
  if (!days.length) return '<p class="t-sub">Sin horario asignado.</p>';
  const today = new Date().getDay();
  return `<div class="pweek">${days.map((d) => `<div class="pweek-day ${d === today ? 'is-today' : ''}"><b>${DAYS_SHORT[d]}</b>${groups.flatMap((g) => (g.schedule || []).filter((s) => Number(s.day) === d).map((s) => ({ g, s }))).sort((a, c) => toM(a.s.from) - toM(c.s.from)).map(({ g, s }) => `<div class="pweek-cls" style="--gc:${g.color || '#4f46e5'}"><small>${fmtHour(s.from)}–${fmtHour(s.to)}</small><span>${esc(g.course)}</span>${g.room ? `<small>${esc(g.room)}</small>` : ''}</div>`).join('')}</div>`).join('')}</div>`;
}

export async function mount(root) {
  document.title = 'Portal del alumno · SanoAcademia';
  const code = (/\/portal\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="portal-page"><div class="empty"><div class="spinner"></div></div></div>';
  let P = null;
  try { P = code ? await getPortal(code) : null; } catch (e) { console.error(e); }
  if (!P || P.active === false || P.kind !== 'alumno') {
    const isTeacher = P && P.kind === 'profesor';
    if (isTeacher) { location.replace('/profe/' + code); return; }
    root.innerHTML = `<div class="portal-page"><div class="card portal-err"><img src="/assets/logo.svg" alt="" width="64"><h1>${P ? 'Portal no disponible' : 'Portal no encontrado'}</h1><p>El código <b>${esc(code || '—')}</b> ${P ? 'está desactivado por la academia.' : 'no existe o fue renovado.'} Pide tu enlace actualizado en la recepción de tu academia.</p>
      <form class="row" style="gap:6px;justify-content:center" id="pc"><input class="input" style="max-width:180px;text-transform:uppercase" name="c" placeholder="Tu código" maxlength="12"><button class="btn btn-primary">Entrar</button></form></div></div>`;
    root.querySelector('#pc').onsubmit = (e) => { e.preventDefault(); const c = e.target.elements.c.value.trim().toUpperCase(); if (c.length >= 4) location.href = '/portal/' + encodeURIComponent(c); };
    return;
  }
  try { applyLocale(P.country || 'VE', P.currency || null); } catch (_) {}
  if (P.rate > 0) setFx({ enabled: true, rate: P.rate, sym: P.fxSym || 'Bs' });
  LS('sa_portal', code);
  document.title = `${P.name} · ${P.academy}`;
  let tab = 'inicio';
  const due = P.balance > 0.009;
  const first = String(P.name || '').split(' ')[0];

  const tabs = [['inicio', 'Inicio', 'home'], ['pagos', 'Pagos', 'wallet', due ? P.charges.filter((c) => c.rest > 0.009).length : 0],
    ...(P.grades.length ? [['notas', 'Notas', 'clipboard']] : []), ...(P.attendance.length ? [['asistencia', 'Asistencia', 'userCheck']] : []),
    ['avisos', 'Avisos', 'megaphone', P.notices.length], ...(P.allow.requests ? [['solicitud', 'Solicitudes', 'inbox']] : []), ...(P.certs.length ? [['certificados', 'Certificados', 'medal']] : [])];

  function shell() {
    root.innerHTML = `<div class="portal-page">
      <header class="portal-hero ${due ? 'due' : 'ok'}">
        <div class="portal-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(P.academy)}</b><small>Portal del alumno</small></div>${P.academyPhone ? `<a class="btn btn-ghost btn-sm portal-wa" href="${waLink(P.academyPhone, `Hola, escribo por ${P.name} (${P.studentCode}).`)}" target="_blank" rel="noopener">${icon('whatsapp')}</a>` : ''}</div>
        <div class="portal-unit"><span>${icon('cap')} <b>${esc(P.name)}</b></span><span>Matrícula ${esc(P.studentCode)}</span>${P.groups.length ? `<span>${P.groups.length} curso(s)</span>` : ''}</div>
        <div class="portal-bal"><small>${due ? 'Saldo pendiente' : P.balance < -0.009 ? 'Saldo a favor' : '¡Estás al día!'}</small><b>${usd(Math.abs(P.balance))}</b>${fx() && Math.abs(P.balance) > 0.009 ? `<span>≈ ${bs(Math.abs(P.balance))} · tasa ${num(fx().rate, 2)}</span>` : ''}${due && P.months ? `<em>${P.months} mensualidad(es) por pagar</em>` : !due ? `<em>${icon('checkCircle')} ¡Gracias por pagar a tiempo!</em>` : ''}</div>
        ${due && P.allow.reports ? `<button class="btn btn-lg portal-pay" data-tab="pagos" data-go="rep">${icon('send')} Reportar mi pago</button>` : ''}
      </header>
      <nav class="portal-tabs">${tabs.map(([k, l, i, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${icon(i)}<span>${l}</span>${n ? `<i>${n}</i>` : ''}</button>`).join('')}</nav>
      <main id="pt-body" class="portal-body"></main>
      <p class="portal-by">Portal privado de ${esc(first)} · Hecho con <b>SanoAcademia</b><br><small>Agrega esta página a tu pantalla de inicio para tenerla a mano.</small></p>
    </div>`;
    root.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => { tab = x.dataset.tab; shell(); if (x.dataset.go === 'rep') setTimeout(() => root.querySelector('#f-pay')?.scrollIntoView({ behavior: 'smooth' }), 50); else window.scrollTo({ top: tab === 'inicio' ? 0 : root.querySelector('.portal-tabs').offsetTop - 8, behavior: 'smooth' }); });
    ({ inicio, pagos, notas, asistencia, avisos, solicitud, certificados })[tab]();
  }
  const body = () => root.querySelector('#pt-body');
  async function send(type, data) {
    const ref = doc(collection(db, 'inbox'));
    await setDoc(ref, { tenantId: P.tenantId, code, who: P.who, studentCode: P.studentCode, studentName: P.name, type, status: 'nueva', createdAt: nowISO(), ...data });
  }

  function inicio() {
    const nx = nextClass(P.groups);
    const pinned = P.notices.filter((n) => n.pinned)[0];
    body().innerHTML = `
      ${nx ? `<div class="card next-class" style="--gc:${nx.g.color || '#4f46e5'}"><small>${nx.i === 0 ? 'Tu próxima clase es hoy' : nx.i === 1 ? 'Tu próxima clase es mañana' : `Tu próxima clase: ${DAYS[nx.d.getDay()].toLowerCase()}`}</small><b>${esc(nx.g.course)}${nx.g.name ? ` · ${esc(nx.g.name)}` : ''}</b><span>${icon('clock')} ${fmtHour(nx.s.from)} a ${fmtHour(nx.s.to)}${nx.g.room ? ` · ${icon('door')} ${esc(nx.g.room)}` : ''}${nx.g.teacher ? ` · ${icon('user')} ${esc(nx.g.teacher)}` : ''}</span></div>` : ''}
      ${pinned ? `<div class="card portal-pin"><b>${icon('pin')} ${esc(pinned.title)}</b><p>${esc(pinned.body).replace(/\n/g, '<br>')}</p></div>` : ''}
      <div class="card"><div class="card-title">${icon('calendar')} Mi horario</div><div class="mt">${weekHTML(P.groups)}</div>
        ${P.groups.length ? `<div class="list mt">${P.groups.map((g) => `<div class="list-item"><i class="dot-c" style="background:${g.color}"></i><div class="grow"><b>${esc(g.course)}${g.name ? ` · ${esc(g.name)}` : ''}</b><div class="t-sub">${esc(g.text)}${g.teacher ? ` · Prof. ${esc(g.teacher)}` : ''}</div></div></div>`).join('')}</div>` : ''}</div>
      ${P.attendance.length ? `<div class="card"><div class="card-title">${icon('userCheck')} Asistencia</div><div class="kpis kpis-mini mt">${P.attendance.map((a) => `<div class="kpi"><div class="kpi-label ellipsis">${esc(a.group)}</div><div class="kpi-value ${a.pct != null && a.pct < 75 ? 'text-danger' : 'text-success'}">${a.pct ?? '—'}%</div></div>`).join('')}</div></div>` : ''}`;
  }

  function banksHTML() {
    return P.banks.length ? `<div class="stack">${P.banks.map((k) => { const txt = [k.bank, k.number, k.phone, k.email, k.holder, k.idDoc].filter(Boolean).join('\n'); return `<div class="box portal-bank"><div class="between"><b>${esc(BANK_TYPES[k.type] || k.type)}${k.bank ? ` · ${esc(k.bank)}` : ''}</b><button class="btn btn-ghost btn-sm" data-copy="${esc(txt)}">${icon('copy')} Copiar</button></div><div class="t-sub" style="white-space:pre-line">${esc([k.number, k.phone, k.email, k.holder, k.idDoc].filter(Boolean).join('\n'))}</div></div>`; }).join('')}</div>`
      : '<p class="t-sub">Consulta las formas de pago en la recepción de la academia.</p>';
  }
  function pagos() {
    const methods = Object.keys(PAY_METHODS).filter((k) => k !== 'credito' && k !== 'debito').sort((x, y) => (x === 'efectivo') - (y === 'efectivo'));
    body().innerHTML = `
      <div class="card"><div class="card-title">${icon('file')} Mis mensualidades y cargos</div>
        ${P.charges.length ? `<div class="list mt">${P.charges.map((c) => `<div class="list-item"><div class="grow"><b>${esc(c.k === 'mes' ? `Mensualidad ${periodName(c.p)}` : c.n)}</b><div class="t-sub">${c.d ? `vence ${fmtDate(c.d)}` : ''}${c.rest > 0.009 && c.rest < c.t ? ` · falta ${usd(c.rest)}` : ''}</div></div><div class="r"><b class="num">${usd(c.t)}</b><div>${b(ST, c.st !== 'pagado' && c.d && c.d < todayKey() ? 'vencido' : c.st)}</div></div></div>`).join('')}</div>` : '<p class="t-sub">Aún no hay mensualidades.</p>'}</div>
      <div class="card"><div class="card-title">${icon('card')} Dónde pagar</div><div class="mt">${banksHTML()}</div></div>
      ${P.allow.reports ? `<form class="card stack" id="f-pay"><div class="card-title">${icon('send')} Reportar mi pago</div><p class="small muted" style="margin:0">Después de pagar, avísale a la academia aquí. Lo confirman y se descuenta de tu saldo.</p>
        <div class="field"><label>Monto pagado (${esc(loc().sym)})</label><input class="input input-lg" name="amount" inputmode="decimal" value="${due ? num(P.balance) : ''}" required></div>
        ${fx() ? `<div class="field"><label>¿Pagaste en ${esc(fx().sym)}? Monto en ${esc(fx().sym)} (opcional)</label><input class="input" name="amountBs" inputmode="decimal" placeholder="${due ? num(P.balance * fx().rate) : ''}"><span class="hint">Tasa del día: ${num(fx().rate, 2)}</span></div>` : ''}
        <div class="form-grid"><div class="field"><label>Forma de pago</label><select class="input select" name="method">${methods.map((k) => `<option value="${k}">${esc(methodLabel(k))}</option>`).join('')}</select></div>
          <div class="field"><label>Fecha del pago</label><input class="input" type="date" name="date" value="${todayKey()}" max="${todayKey()}"></div>
          <div class="field"><label>Banco de origen</label><input class="input" name="bank" maxlength="40"></div>
          <div class="field"><label>N° de referencia</label><input class="input" name="reference" inputmode="numeric" maxlength="30" required></div>
          <div class="field"><label>Quién paga</label><input class="input" name="name" maxlength="60" placeholder="Tu nombre"></div>
          <div class="field"><label>Teléfono</label><input class="input" name="phone" inputmode="tel" maxlength="20"></div></div>
        <div class="field"><label>Nota (opcional)</label><input class="input" name="note" maxlength="140" placeholder="Ej.: mensualidad de noviembre"></div>
        <div class="error-msg" data-err></div><button class="btn btn-primary btn-lg">${icon('send')} Enviar reporte</button></form>` : ''}
      ${P.reports.length ? `<div class="card"><div class="card-title">${icon('send')} Pagos que reportaste</div><div class="list mt">${P.reports.map((r) => `<div class="list-item"><div class="grow"><b>${usd(r.amount)}</b><div class="t-sub">${fmtDate(r.date)}${r.reply ? ` · ${esc(r.reply)}` : ''}</div></div>${b(RST, r.status)}</div>`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-title">${icon('check')} Pagos confirmados</div>
        ${P.payments.length ? `<div class="list mt">${P.payments.map((p) => `<div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('check')}</span><div class="grow"><b>${usd(p.amount)}</b><div class="t-sub">${fmtDate(p.date)} · ${esc(methodLabel(p.method))}${p.ref ? ` · ref. ${esc(p.ref)}` : ''}</div></div><span class="t-sub mono">${esc(p.n || '')}</span></div>`).join('')}</div>` : '<p class="t-sub">Sin pagos registrados todavía.</p>'}</div>`;
    body().querySelectorAll('[data-copy]').forEach((x) => x.onclick = () => navigator.clipboard?.writeText(x.dataset.copy).then(() => toast('Datos copiados')));
    const f = body().querySelector('#f-pay');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); const F = f.elements; const err = f.querySelector('[data-err]'); err.textContent = '';
      const amount = round2(parseNum(F.amount.value));
      if (!(amount > 0)) { err.textContent = 'Escribe el monto pagado.'; return; }
      if (F.reference.value.trim().length < 3) { err.textContent = 'Escribe el número de referencia.'; return; }
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        await send('pago', { amount, amountBs: F.amountBs ? round2(parseNum(F.amountBs.value)) || null : null, rate: fx()?.rate || null, method: F.method.value, date: F.date.value || todayKey(), bank: F.bank.value.trim().slice(0, 40), reference: F.reference.value.trim().slice(0, 30), name: F.name.value.trim().slice(0, 60), phone: F.phone.value.trim().slice(0, 20), note: F.note.value.trim().slice(0, 140) });
        body().innerHTML = `<div class="card center portal-done"><span class="kpi-icon tone-success">${icon('checkCircle')}</span><h2>¡Pago reportado!</h2><p class="muted">La academia lo revisará y lo verás aquí como <b>Confirmado</b>. ¡Gracias!</p>${P.academyPhone ? `<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${waLink(P.academyPhone, `Hola, reporté el pago de ${P.name} (${P.studentCode}): ${usd(amount)}, ref. ${F.reference.value.trim()}.`)}">${icon('whatsapp')} Avisar por WhatsApp</a>` : ''}</div>`;
      } catch (ex) { console.error(ex); err.textContent = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'; btn.disabled = false; }
    };
  }

  function notas() {
    body().innerHTML = P.grades.map((g) => `<div class="card"><div class="between"><div class="card-title">${icon('clipboard')} ${esc(g.group)}</div>${g.avg != null ? `<span class="grade-pill ${g.pass ? 'ok' : 'bad'}">${num(g.avg, 2)}<small>/${P.scale.max}</small></span>` : ''}</div>
      <div class="list mt">${g.evals.map((e) => `<div class="list-item"><div class="grow"><b>${esc(e.name)}</b><div class="t-sub">${num(e.weight, 0)}% de la nota</div></div><b class="num ${e.score != null && e.score < P.scale.pass ? 'text-danger' : ''}">${e.score != null ? num(e.score, e.score % 1 ? 1 : 0) : '—'}</b></div>`).join('')}</div>
      <div class="t-sub mt">Nota mínima para aprobar: ${P.scale.pass} de ${P.scale.max}</div></div>`).join('');
  }
  function asistencia() {
    body().innerHTML = P.attendance.map((a) => `<div class="card"><div class="between"><div class="card-title">${icon('userCheck')} ${esc(a.group)}</div><b class="${a.pct != null && a.pct < 75 ? 'text-danger' : 'text-success'}" style="font-size:22px">${a.pct ?? '—'}%</b></div>
      <div class="row mt" style="gap:6px;flex-wrap:wrap">${Object.entries(ATT).map(([k, v]) => `<span class="badge badge-${v.tone}">${v.label}: ${a[k] || 0}</span>`).join('')}</div>
      ${a.last.length ? `<div class="att-strip mt">${a.last.map((x) => `<span class="att-dot att-${x.m}" title="${ATT[x.m]?.label || ''}">${x.m}<small>${esc(x.date.slice(8))}/${esc(x.date.slice(5, 7))}</small></span>`).join('')}</div>` : ''}</div>`).join('')
      + (P.allow.requests ? `<div class="card center"><p class="small muted" style="margin:0 0 8px">¿Faltaste por un motivo de fuerza mayor?</p><button class="btn btn-secondary" id="p-just">${icon('file')} Enviar un justificativo</button></div>` : '');
    body().querySelector('#p-just')?.addEventListener('click', () => { tab = 'solicitud'; shell(); setTimeout(() => body().querySelector('[data-c="justificativo"]')?.click(), 30); });
  }
  function avisos() {
    body().innerHTML = P.notices.length ? P.notices.map((n) => { const k = NOTICE_KINDS[n.kind] || NOTICE_KINDS.aviso; return `<div class="card"><div class="between"><span class="badge badge-${k.tone}">${icon(k.icon)} ${k.label}</span><span class="t-sub">${fmtDate(n.date)}</span></div><h3 class="notice-title">${esc(n.title)}</h3><p class="notice-body">${esc(n.body).replace(/\n/g, '<br>')}</p></div>`; }).join('')
      : `<div class="card center"><p class="muted">No hay comunicados por ahora.</p></div>`;
  }
  function solicitud() {
    body().innerHTML = `<form class="card stack" id="f-req"><div class="card-title">${icon('inbox')} Nueva solicitud</div>
        <div class="field"><label>Tipo</label><div class="chips chips-wrap">${Object.entries(REQUEST_CATS).map(([k, c], i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-c="${k}">${icon(c.icon)} ${esc(c.label)}</button>`).join('')}</div></div>
        <div class="field" data-datef><label>Fecha de la clase a la que faltó</label><input class="input" type="date" name="date" max="${todayKey()}"></div>
        <div class="field"><label>Cuéntanos</label><textarea class="input textarea" name="text" rows="4" maxlength="600" placeholder="Ej.: Faltó por una cita médica. Enviaremos el récipe." required></textarea></div>
        <div class="form-grid"><div class="field"><label>Tu nombre</label><input class="input" name="name" maxlength="60"></div><div class="field"><label>Teléfono</label><input class="input" name="phone" inputmode="tel" maxlength="20"></div></div>
        <div class="error-msg" data-err></div><button class="btn btn-primary btn-lg">${icon('send')} Enviar</button></form>
      ${P.requests.length ? `<div class="card"><div class="card-title">${icon('inbox')} Mis solicitudes</div><div class="list mt">${P.requests.map((r) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc((REQUEST_CATS[r.category] || REQUEST_CATS.otro).label)}</b><div class="t-sub">${esc(r.text)}</div>${r.reply ? `<div class="small">↳ ${esc(r.reply)}</div>` : ''}<div class="t-sub">${fmtDate(r.date)}</div></div>${b(RST, r.status)}</div>`).join('')}</div></div>` : ''}`;
    let cat = Object.keys(REQUEST_CATS)[0];
    const df = body().querySelector('[data-datef]');
    const sync = () => { df.hidden = cat !== 'justificativo'; };
    body().querySelectorAll('[data-c]').forEach((x) => x.onclick = () => { cat = x.dataset.c; body().querySelectorAll('[data-c]').forEach((y) => y.classList.toggle('on', y === x)); sync(); });
    sync();
    const f = body().querySelector('#f-req');
    f.onsubmit = async (e) => {
      e.preventDefault(); const F = f.elements; const err = f.querySelector('[data-err]');
      if (F.text.value.trim().length < 4) { err.textContent = 'Describe tu solicitud.'; return; }
      const btn = f.querySelector('button.btn-primary'); btn.disabled = true;
      try { await send('solicitud', { category: cat, text: F.text.value.trim().slice(0, 600), date: cat === 'justificativo' ? (F.date.value || '') : '', name: F.name.value.trim().slice(0, 60), phone: F.phone.value.trim().slice(0, 20) }); body().innerHTML = `<div class="card center portal-done"><span class="kpi-icon tone-success">${icon('checkCircle')}</span><h2>¡Solicitud enviada!</h2><p class="muted">La academia te responderá aquí mismo.</p></div>`; }
      catch (ex) { console.error(ex); err.textContent = 'No se pudo enviar. Intenta de nuevo.'; btn.disabled = false; }
    };
  }
  function certificados() {
    body().innerHTML = `<div class="card"><div class="card-title">${icon('medal')} Mis certificados</div><div class="list mt">${P.certs.map((c) => `<a class="list-item" href="/certificado/${esc(c.verify)}" target="_blank" rel="noopener"><span class="kpi-icon tone-warning" style="width:38px;height:38px">${icon('medal')}</span><div class="grow"><b>${esc(c.course)}</b><div class="t-sub">${esc(c.number)} · ${fmtDate(c.date)}</div></div>${icon('external')}</a>`).join('')}</div><p class="hint mt" style="margin-bottom:0">Cada certificado tiene un código QR para que cualquiera verifique que es auténtico.</p></div>`;
  }
  shell();
}
