// SanoAcademia — Componentes compartidos: país y moneda, QR, WhatsApp e impresos (recibos, constancias, carnet, boletín, certificado)
import { store } from './store.js';
import { openModal, toast, num, esc, fmtDateTime, fmtDate, setBusy, usd, bs, fx, methodLabel, printHTML, todayKey, waLink, COUNTRIES, loc, flagImg, fmtLongDate } from './utils.js';
import { icon } from './icons.js';
import { periodName, studentBalance, ledgerStatus, openCharges, monthsOwed, isSolvent, contactPhone, contactName, firstName, isMinor, scheduleText, studentAverage, attendanceOf, scaleOf, ageOf, CHARGE_KINDS } from './academy.js';

export const APP_NAME = 'SanoAcademia';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa SanoAcademia para gestionar mi academia. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// PAÍS DE TRABAJO (se elige una sola vez, al entrar por primera vez)
// ======================================================================
export function openCountryPicker({ force = false } = {}) {
  return new Promise((resolve) => {
    let picked = store.settings.country || '';
    let cur = store.settings.currency || '';
    const list = Object.entries(COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));
    const m = openModal({
      title: force ? '¿En qué país está tu academia?' : 'País y moneda', size: 'md', dismissible: !force,
      sub: 'Según el país, SanoAcademia trabaja con su moneda, sus formas de pago y el código telefónico para WhatsApp.',
      body: `<div class="stack"><label class="search"><svg></svg><input data-q placeholder="Buscar país…" autocomplete="off"></label><div class="country-grid" data-l></div><div data-cur></div><div class="error-msg" data-err></div></div>`,
      footer: `${force ? '' : '<button class="btn btn-secondary" data-close>Cancelar</button>'}<button class="btn btn-primary btn-lg" data-ok disabled>Continuar</button>`,
      onClose: () => resolve(picked && store.settings.country === picked ? picked : null)
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (qv = '') => {
      const t = qv.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      m.el.querySelector('[data-l]').innerHTML = list.filter(([, c]) => !t || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)).map(([k, c]) =>
        `<button type="button" class="country ${picked === k ? 'on' : ''}" data-c="${k}"><span class="flag">${flagImg(k, 24)}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.curName)} · ${esc(c.sym)}</small></span></button>`).join('');
      m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { picked = b.dataset.c; cur = COUNTRIES[picked].cur; draw(m.el.querySelector('[data-q]').value); });
      const c = COUNTRIES[picked];
      m.el.querySelector('[data-cur]').innerHTML = c ? `<div class="card stack" style="padding:12px 14px"><div class="row" style="gap:10px"><span class="flag">${flagImg(picked, 30)}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">Formas de pago: efectivo, transferencia${(c.extra || []).length ? ' y otras locales' : ''} · WhatsApp +${esc(c.dial)}</div></div></div>
        ${c.alt ? `<div class="field"><label>Moneda en la que cobras las mensualidades</label><div class="seg seg-block">${[[c.cur, c.curName + ' (' + c.sym + ')'], [c.alt.cur, c.alt.curName + ' (' + c.alt.sym + ')']].map(([k, l]) => `<button type="button" data-mc="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>${picked === 'VE' ? '<span class="hint">Recomendado: dólares. Cada mensualidad y cada pago muestra su equivalente en bolívares a la tasa BCV del día.</span>' : ''}</div>` : `<div class="small">Moneda: <b>${esc(c.curName)} (${esc(c.sym)})</b></div>`}
        ${store.settings.country && store.settings.country !== picked ? `<div class="vital-alert warning">Los montos ya registrados no se convierten.</div>` : ''}</div>` : '';
      m.el.querySelectorAll('[data-mc]').forEach((b) => b.onclick = () => { cur = b.dataset.mc; draw(m.el.querySelector('[data-q]').value); });
      m.el.querySelector('[data-ok]').disabled = !picked;
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      if (!picked) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      try { await store.setCountry(picked, cur); await (await import('./bcv.js')).onCountryChanged().catch(() => {}); toast(`Listo: trabajarás en ${loc().curName} (${loc().sym})`); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    draw();
  });
}

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
export async function qrDataURL(text, cell = 4) {
  try { const q = await loadQR(); const qr = q(0, 'M'); qr.addData(text); qr.make(); return qr.createDataURL(cell, 2); } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL ALUMNO / REPRESENTANTE
// ======================================================================
const BASE = 'https://sano-academia.web.app';
export const PORTAL_URL = (s) => (s?.portalCode ? `${BASE}/portal/${s.portalCode}` : '');
export const TEACHER_URL = (t) => (t?.portalCode ? `${BASE}/profe/${t.portalCode}` : '');
export const ENROLL_URL = () => (store.settings.catalogCode ? `${BASE}/inscripcion/${store.settings.catalogCode}` : '');
export const CERT_URL = (v) => `${BASE}/certificado/${v}`;
const amt = (v) => `${usd(v)}${bs(v) ? ` (${bs(v)})` : ''}`;
export function banksText() {
  const list = (store.settings.banks || []).filter((b) => b.active !== false);
  if (!list.length) return '';
  return '\n\n🏦 *Datos para pagar*\n' + list.map((b) => b.type === 'pagomovil'
    ? `• Pago móvil: ${b.bank || ''} · ${b.phone || ''} · ${b.idDoc || ''}`
    : b.type === 'zelle' ? `• Zelle: ${b.email || b.number || ''} (${b.holder || ''})`
      : b.type === 'efectivo' ? `• Efectivo en la recepción de la academia`
        : `• ${b.bank || 'Transferencia'}: ${b.number || ''} · ${b.holder || ''} · ${b.idDoc || ''}`).join('\n');
}
const chargeName = (x) => (x.k === 'mes' ? `Mensualidad ${periodName(x.p)}` : x.n);
export function studentMessage(kind, { student: s = {}, extra = '', receipt = null, payment = null, notice = null, group = null, date = '' } = {}) {
  const guardian = isMinor(s) && s.guardianName;
  const who = firstName({ name: contactName(s) }) || 'familia';
  const biz = store.businessName;
  const portal = PORTAL_URL(s);
  const sname = firstName(s);
  const h = `Hola ${who} 👋, te escribimos de *${biz}*.`;
  const about = guardian ? ` de *${sname}*` : '';
  const bal = studentBalance(s);
  const det = openCharges(s).slice(0, 6).map((x) => `• ${chargeName(x)}: ${usd(x.rest)}`).join('\n');
  const T = {
    mensualidad: () => `${h}
\n📚 Ya está disponible la mensualidad${about} de *${periodName(receipt?.period)}*: *${amt(receipt?.total || 0)}*${bal > (receipt?.total || 0) + 0.009 ? `
Saldo total con meses anteriores: *${amt(bal)}*` : ''}${receipt?.dueDate ? `
📅 Fecha límite: ${fmtDate(receipt.dueDate)}` : ''}${banksText()}${portal ? `
\n📲 Ve el detalle y reporta tu pago aquí: ${portal}` : ''}`,
    recordatorio: () => `${h}
\n🔔 Te recordamos que${guardian ? ` la cuenta de *${sname}*` : ' tu cuenta'} tiene un saldo pendiente de *${amt(bal)}*:
${det}${banksText()}${portal ? `
\n📲 Reporta tu pago aquí: ${portal}` : ''}
\n¡Gracias por mantenerte al día! 📚`,
    moroso: () => `${h}
\n⚠️ ${guardian ? `La cuenta de *${sname}*` : 'Tu cuenta'} acumula *${monthsOwed(s)} mensualidades* sin pagar, por un total de *${amt(bal)}*:
${det}
\nTe pedimos ponerte al día lo antes posible o escribirnos para acordar un plan de pago y que ${guardian ? sname : 'puedas'} siga${guardian ? '' : 's'} en clases sin inconvenientes.${banksText()}${portal ? `
\n📲 ${portal}` : ''}`,
    pago: () => `${h}
\n✅ Recibimos tu pago${payment?.number ? ` *${payment.number}*` : ''} por *${amt(payment?.amount || 0)}*${about}.
${bal <= 0.009 ? `🎉 ¡La cuenta está *al día*${bal < -0.009 ? ` y tiene ${usd(-bal)} a favor` : ''}!` : `Saldo pendiente: *${amt(bal)}*.`}${portal ? `
\n📲 ${portal}` : ''}`,
    rechazo: () => `${h}
\nNo pudimos verificar el pago que reportaste${about}${extra ? `: ${extra}` : '.'} Por favor envíanos el comprobante.`,
    bienvenida: () => `${h}
\n🎉 ¡Bienvenido${guardian ? ` *${sname}*` : ''} a *${biz}*! Quedó inscrito${(s.groupIds || []).length ? ' en:' : '.'}
${(s.groupIds || []).map((id) => store.group(id)).filter(Boolean).map((g) => `• *${store.groupLabel(g)}* — ${scheduleText(g)}${store.roomName(g.room) ? ` · ${store.roomName(g.room)}` : ''}`).join('\n')}${portal ? `
\n📲 Este es su portal: horario, asistencia, notas, pagos y avisos: ${portal}
Guárdalo en tu pantalla de inicio.` : ''}`,
    portal: () => `${h}
\n📲 Este es el portal${about || ' del alumno'}: ${portal}
\nAhí ves el horario, la asistencia, las notas, las mensualidades y los avisos; reportas pagos y envías justificativos. Guárdalo en tu pantalla de inicio.`,
    inasistencia: () => `${h}
\n📋 ${guardian ? `*${sname}* no asistió` : 'No asististe'} a la clase de *${store.groupLabel(group)}*${date ? ` del ${fmtDate(date)}` : ' de hoy'}.${extra ? `
${extra}` : ''} Si fue por un motivo de fuerza mayor, puedes enviar el justificativo desde el portal${portal ? `: ${portal}` : '.'}
¡Te esperamos en la próxima clase!`,
    ausencias: () => `${h}
\n📋 ${guardian ? `*${sname}* acumula` : 'Acumulas'} ${extra} en *${store.groupLabel(group)}*. Queremos saber si todo está bien y cómo podemos ayudar a que no se pierda el avance del curso.`,
    notas: () => `${h}
\n📝 Ya están cargadas las notas${about} en *${store.groupLabel(group)}*.${extra ? `\n${extra}` : ''}${portal ? `
\nMíralas en el portal: ${portal}` : ''}`,
    cumple: () => `🎂 ¡Feliz cumpleaños, ${sname}! 🎉
Todo el equipo de *${biz}* te desea un día increíble. ¡Gracias por aprender con nosotros! 📚✨`,
    comunicado: () => `📢 *${notice?.title || 'Comunicado'}*
${biz}
\n${notice?.body || extra}${portal ? `
\n📲 ${portal}` : ''}`,
    solicitud: () => `${h}
\nSobre tu solicitud${extra ? `: ${extra}` : '.'}`,
    libre: () => `${h}
\n${extra || ''}`
  };
  return (T[kind] || T.libre)().replace(/\n\\n/g, '\n\n');
}
export function waStudent(kind, ctx = {}, to = 'auto') {
  const s = ctx.student || {};
  const phone = to === 'guardian' ? s.guardianPhone : to === 'student' ? s.phone : contactPhone(s);
  const text = studentMessage(kind, ctx);
  window.open(phone ? waLink(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ======================================================================
// IMPRESIÓN
// ======================================================================
export const PRINT_HEAD = '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style>';
const ACCENT = '#4338ca';
const baseCSS = `@page { margin: 12mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: ${ACCENT}; }
  .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: ${ACCENT}; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; } .r { text-align: right; white-space: nowrap; } .c { text-align: center; }
  .tot td { font-weight: bold; border-top: 2px solid #111; border-bottom: 0; } .big { font-size: 16px; font-weight: bold; }
  .head { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid ${ACCENT}; padding-bottom: 10px; margin-bottom: 10px; }
  .box { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; } .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; } .kpi b { display: block; font-size: 15px; }
  .sign { margin-top: 60px; display: flex; gap: 40px; } .sign div { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
  .stamp { display: inline-block; border: 3px solid #15803d; color: #15803d; font-weight: bold; padding: 6px 14px; border-radius: 8px; font-size: 18px; transform: rotate(-4deg); }
  .pb { page-break-after: always; } .foot { margin-top: 18px; font-size: 10px; color: #666; } .ok { color: #15803d; font-weight: bold; } .bad { color: #b91c1c; font-weight: bold; }`;
function academyHead(right = '') {
  const s = store.settings;
  return `<div class="head"><div><h1>${esc(store.businessName)}</h1>
    ${s.slogan ? `<div class="muted">${esc(s.slogan)}</div>` : ''}${s.rif ? `<div>${esc(loc().tax)}: ${esc(s.rif)}</div>` : ''}${s.address ? `<div class="muted">${esc(s.address)}</div>` : ''}${s.phone || s.whatsapp ? `<div class="muted">Tel: ${esc(s.phone || s.whatsapp)}${s.email ? ' · ' + esc(s.email) : ''}</div>` : ''}</div>
    ${right ? `<div style="text-align:right">${right}</div>` : ''}</div>`;
}
const eqTxt = (v, rate) => (rate > 0 && fx() ? `${fx().sym} ${num(v * rate, 2)}` : '');
const studentBox = (s) => `<div class="box"><div class="muted">Alumno</div><div class="big">${esc(s.name || s.studentName || '')}</div><div>Matrícula: <b>${esc(s.code || s.studentCode || '')}</b>${s.idDoc ? ` · ${esc(loc().id)} ${esc(s.idDoc)}` : ''}</div>${s.guardianName ? `<div>Representante: ${esc(s.guardianName)}</div>` : ''}</div>`;

/** Recibo de mensualidad o cargo */
export function receiptHTML(r) {
  const s = store.student(r.studentId) || { name: r.studentName, code: r.studentCode };
  const rate = Number(r.fxRate) || 0;
  const led = ledgerStatus(s).find((x) => x.id === r.id);
  const prev = Number(r.prevDebt) || 0;
  const cols = rate > 0 && fx();
  return `<div class="rc">${academyHead()}
    <div class="grid"><div class="box"><div class="muted">${r.kind === 'cargo' ? 'Cargo' : 'Mensualidad'}</div><div class="big">N° ${esc(r.number)}</div><div>${r.kind === 'cargo' ? 'Fecha' : 'Mes'}: <b>${esc(r.kind === 'cargo' ? fmtDate(r.emittedAt) : periodName(r.period))}</b></div><div>Emitido: ${fmtDate(r.emittedAt)} · Vence: <b>${fmtDate(r.dueDate)}</b></div></div>
      ${studentBox(s)}</div>
    <h2>Detalle</h2>
    <table><tr><th>Concepto</th><th class="r">Monto</th>${cols ? `<th class="r">${esc(fx().sym)}</th>` : ''}</tr>
      ${(r.items || []).map((i) => `<tr><td>${esc(i.concept)}</td><td class="r">${i.amount < 0 ? '-' : ''}${usd(Math.abs(i.amount))}</td>${cols ? `<td class="r">${eqTxt(i.amount, rate)}</td>` : ''}</tr>`).join('')}
      <tr class="tot"><td>TOTAL</td><td class="r">${usd(r.total)}</td>${cols ? `<td class="r">${eqTxt(r.total, rate)}</td>` : ''}</tr>
      ${prev > 0.009 ? `<tr><td>Saldo anterior al emitir</td><td class="r">${usd(prev)}</td>${cols ? '<td></td>' : ''}</tr><tr class="tot"><td>TOTAL A PAGAR</td><td class="r">${usd(prev + r.total)}</td>${cols ? `<td class="r">${eqTxt(prev + r.total, rate)}</td>` : ''}</tr>` : ''}
      ${Number(r.credit) > 0.009 ? `<tr><td>Saldo a favor aplicado</td><td class="r">-${usd(Math.min(r.credit, r.total))}</td>${cols ? '<td></td>' : ''}</tr>` : ''}
    </table>
    ${cols ? `<div class="muted" style="margin-top:4px">Tasa de referencia al emitir: 1 ${esc(loc().sym)} = ${num(rate, 2)} ${esc(fx().sym)}. El pago en ${esc(fx().sym)} se calcula a la tasa del día en que pagas.</div>` : ''}
    ${led ? `<div style="margin-top:6px">Estado actual: <b>${led.status === 'pagado' ? 'PAGADO' : led.status === 'parcial' ? `ABONADO · resta ${usd(led.rest)}` : 'PENDIENTE'}</b></div>` : ''}
    ${banksPrint()}
    ${PORTAL_URL(s) ? `<div class="foot">Reporta tu pago y consulta horario, notas y asistencia en: <b>${esc(PORTAL_URL(s))}</b></div>` : ''}
    <div class="foot">${esc(store.settings.receiptNote || '')} · SanoAcademia</div></div>`;
}
function banksPrint() {
  const list = (store.settings.banks || []).filter((b) => b.active !== false);
  if (!list.length) return '';
  return `<h2>Formas de pago</h2><table>${list.map((b) => `<tr><td><b>${esc(b.type === 'pagomovil' ? 'Pago móvil' : b.type === 'zelle' ? 'Zelle' : b.type === 'efectivo' ? 'Efectivo' : 'Transferencia')}</b></td><td>${esc([b.bank, b.number, b.phone, b.email, b.holder, b.idDoc].filter(Boolean).join(' · '))}</td></tr>`).join('')}</table>`;
}
export function printReceipts(list, title = 'Mensualidades') {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title><style>${baseCSS}</style></head><body>
    ${list.map((r, i) => `${receiptHTML(r)}${i < list.length - 1 ? '<div class="pb"></div>' : ''}`).join('')}</body></html>`);
}

/** Estado de cuenta del alumno */
export function printStatement(s, receipts = [], payments = []) {
  const bal = studentBalance(s);
  const rows = [
    ...receipts.map((r) => ({ date: (r.emittedAt || '').slice(0, 10), text: `${r.kind === 'cargo' ? 'Cargo' : 'Mensualidad'} ${r.number} · ${r.kind === 'cargo' ? (r.items?.[0]?.concept || '') : periodName(r.period)}`, debit: r.total, credit: 0 })),
    ...payments.filter((p) => p.status === 'confirmado').map((p) => ({ date: p.date, text: `Pago ${p.number} · ${methodLabel(p.method)}${p.reference ? ' ref. ' + p.reference : ''}`, debit: 0, credit: p.amount }))
  ].sort((a, b) => a.date.localeCompare(b.date));
  const billed = rows.reduce((a, r) => a + r.debit, 0); const paid = rows.reduce((a, r) => a + r.credit, 0);
  let run = round(bal - (billed - paid));
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Estado de cuenta ${esc(s.name)}</title><style>${baseCSS}</style></head><body>${academyHead()}
    <h1 style="font-size:16px">Estado de cuenta · ${esc(s.name)}</h1>
    <div class="muted">Matrícula ${esc(s.code || '')}${s.idDoc ? ` · ${esc(loc().id)} ${esc(s.idDoc)}` : ''}${s.guardianName ? ` · Representante: ${esc(s.guardianName)}` : ''} · Al ${fmtLongDate()}</div>
    <table><tr><th>Fecha</th><th>Movimiento</th><th class="r">Cargo</th><th class="r">Abono</th><th class="r">Saldo</th></tr>
    ${Math.abs(run) > 0.009 ? `<tr><td></td><td>Saldo anterior</td><td></td><td></td><td class="r">${usd(run)}</td></tr>` : ''}
    ${rows.map((r) => { run = round(run + r.debit - r.credit); return `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.text)}</td><td class="r">${r.debit ? usd(r.debit) : ''}</td><td class="r">${r.credit ? usd(r.credit) : ''}</td><td class="r">${usd(run)}</td></tr>`; }).join('')}
    <tr class="tot"><td colspan="4">${bal > 0.009 ? 'SALDO DEUDOR' : bal < -0.009 ? 'SALDO A FAVOR' : 'AL DÍA'}</td><td class="r">${usd(Math.abs(bal))}</td></tr></table>
    ${bal > 0.009 ? `<h2>Pendiente por pagar</h2><table><tr><th>Concepto</th><th>Vence</th><th class="r">Pendiente</th></tr>${openCharges(s).map((x) => `<tr><td>${esc(chargeName(x))}</td><td>${fmtDate(x.d)}</td><td class="r">${usd(x.rest)}</td></tr>`).join('')}</table>${banksPrint()}` : ''}
    <div class="foot">Documento generado por SanoAcademia · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Comprobante de pago */
export function printPayment(p) {
  const s = store.student(p.studentId) || { name: p.studentName, code: p.studentCode };
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(p.number)}</title><style>${baseCSS}</style></head><body>
    ${academyHead()}
    <div class="grid"><div class="box"><div class="muted">Comprobante de pago</div><div class="big">N° ${esc(p.number)}</div><div>Fecha: ${fmtDate(p.date)}</div>${p.status === 'anulado' ? '<div><b>*** ANULADO ***</b></div>' : ''}</div>${studentBox(s)}</div>
    <table><tr><th>Forma de pago</th><th>Banco / referencia</th><th class="r">Monto</th></tr>
      <tr><td>${esc(methodLabel(p.method))}</td><td>${esc([p.bank, p.reference].filter(Boolean).join(' · '))}</td><td class="r">${usd(p.amount)}${p.amountBs ? `<br><small>${esc(fx()?.sym || 'Bs')} ${num(p.amountBs, 2)} · tasa ${num(p.rate, 2)}</small>` : ''}</td></tr></table>
    ${(p.applied || []).length ? `<h2>Aplicado a</h2><table><tr><th>Concepto</th><th class="r">Monto</th></tr>${p.applied.map((a) => `<tr><td>${esc(a.k === 'mes' ? `Mensualidad ${periodName(a.p)}` : a.n)}</td><td class="r">${usd(a.amount)}</td></tr>`).join('')}</table>` : ''}
    ${p.advance > 0.009 ? `<div style="margin-top:6px">Queda a favor: <b>${usd(p.advance)}</b></div>` : ''}
    <div style="margin-top:8px">Saldo actual: <b>${usd(Math.max(0, studentBalance(s)))}</b>${studentBalance(s) < -0.009 ? ` · a favor ${usd(-studentBalance(s))}` : ''}</div>
    <div class="sign"><div>Recibido por<br><small>${esc(store.businessName)}</small></div></div>
    <div class="foot">SanoAcademia · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}

/** Constancia de estudios (con o sin solvencia) */
export function printStudyProof(s, { solvency = false } = {}) {
  if (solvency && !isSolvent(s)) { toast('El alumno tiene saldo pendiente: no se puede emitir la solvencia.', 'warning'); return false; }
  const groups = (s.groupIds || []).map((id) => store.group(id)).filter(Boolean);
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Constancia ${esc(s.name)}</title><style>${baseCSS} .body{font-size:14px;line-height:1.75;margin-top:30px;text-align:justify}</style></head><body>
    ${academyHead()}
    <div style="text-align:center;margin-top:24px"><h1 style="font-size:22px">${solvency ? 'CONSTANCIA DE SOLVENCIA' : 'CONSTANCIA DE ESTUDIOS'}</h1><div class="muted">${esc(fmtLongDate())}</div></div>
    <div class="body">Quien suscribe, en representación de <b>${esc(store.businessName)}</b>, hace constar que <b>${esc(s.name)}</b>${s.idDoc ? `, ${esc(loc().id)} <b>${esc(s.idDoc)}</b>` : ''}${ageOf(s.birthDate) != null ? `, de ${ageOf(s.birthDate)} años de edad` : ''}, matrícula <b>${esc(s.code || '')}</b>, ${s.status === 'egresado' ? 'cursó estudios en esta institución' : 'cursa estudios en esta institución desde el ' + esc(fmtDate(s.enrolledAt || s.createdAt))}${groups.length ? `, inscrito en: ${groups.map((g) => `<b>${esc(store.groupLabel(g))}</b> (${esc(scheduleText(g, { short: false }))})`).join('; ')}` : ''}.
    ${solvency ? `<br><br>Asimismo, se encuentra <b>SOLVENTE</b> con el pago de las mensualidades a la fecha${s.lastPaymentAt ? `, siendo su último pago registrado el ${fmtDate(s.lastPaymentAt)}` : ''}.` : ''}
    <br><br>Constancia que se expide a solicitud de la parte interesada, a los fines que estime convenientes.</div>
    ${solvency ? '<div style="text-align:center;margin-top:30px"><span class="stamp">SOLVENTE</span></div>' : ''}
    <div class="sign"><div>${esc(store.settings.manager || 'Dirección')}<br><small>${esc(store.businessName)}</small></div><div>Sello</div></div>
    <div class="foot">Válida por 30 días a partir de su emisión · Generada con SanoAcademia</div></body></html>`);
  return true;
}

/** Carnet del alumno (tamaño tarjeta) con QR a su portal */
export async function printCard(list) {
  const items = await Promise.all(list.map(async (s) => ({ s, qr: await qrDataURL(PORTAL_URL(s), 3) })));
  const css = `@page { margin: 10mm; } body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .wrap { display: flex; flex-wrap: wrap; gap: 6mm; } .card { width: 85.6mm; height: 54mm; border-radius: 3.5mm; overflow: hidden; position: relative; border: 0.3mm solid #c7d2fe; display: flex; flex-direction: column; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .top { background: linear-gradient(120deg, #312e81, #4f46e5 60%, #7c3aed); color: #fff; padding: 2.6mm 3.5mm; display: flex; align-items: center; gap: 2.5mm; }
    .top b { font-size: 3.4mm; display: block; line-height: 1.1; } .top small { font-size: 2.3mm; opacity: .85; } .logo { width: 7mm; height: 7mm; }
    .mid { flex: 1; display: flex; gap: 3mm; padding: 2.5mm 3.5mm; align-items: center; }
    .ph { width: 17mm; height: 21mm; border-radius: 2mm; background: #eef2ff; display: grid; place-items: center; font-weight: bold; color: #4338ca; font-size: 6mm; overflow: hidden; flex-shrink: 0; }
    .ph img { width: 100%; height: 100%; object-fit: cover; } .info { flex: 1; min-width: 0; font-size: 2.6mm; color: #333; line-height: 1.35; }
    .info .n { font-size: 3.6mm; font-weight: bold; color: #111; line-height: 1.15; margin-bottom: 1mm; } .qr { width: 17mm; height: 17mm; flex-shrink: 0; }
    .bot { background: #fbbf24; color: #3b2a00; font-size: 2.3mm; padding: 1mm 3.5mm; font-weight: bold; letter-spacing: .3mm; text-transform: uppercase; display: flex; justify-content: space-between; }`;
  const logo = `<svg class="logo" viewBox="0 0 64 64"><path d="M32 10 4 22l28 12 28-12z" fill="#fff"/><path d="M16 28v10c0 5 7 9 16 9s16-4 16-9V28l-16 7z" fill="#fde68a"/><path d="M56 23v14" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/><circle cx="56" cy="39" r="3" fill="#fbbf24"/></svg>`;
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Carnet</title><style>${css}</style></head><body><div class="wrap">
    ${items.map(({ s, qr }) => { const gs = (s.groupIds || []).map((id) => store.group(id)).filter(Boolean); return `<div class="card"><div class="top">${logo}<div><b>${esc(store.businessName)}</b><small>Carnet de alumno</small></div></div>
      <div class="mid"><div class="ph">${s.photo ? `<img src="${s.photo}" alt="">` : esc((s.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</div>
      <div class="info"><div class="n">${esc(s.name)}</div>${s.idDoc ? `<div>${esc(loc().id)} ${esc(s.idDoc)}</div>` : ''}<div>Matrícula <b>${esc(s.code || '')}</b></div>${gs.slice(0, 2).map((g) => `<div>${esc(store.course(g.courseId)?.name || '')}</div>`).join('')}</div>
      ${qr ? `<img class="qr" src="${qr}" alt="">` : ''}</div>
      <div class="bot"><span>Vigente ${new Date().getFullYear()}</span><span>Portal del alumno</span></div></div>`; }).join('')}
  </div></body></html>`);
}

/** Boletín de notas y asistencia del alumno */
export function printReportCard(list, { groupId = '' } = {}) {
  const scale = scaleOf(store.settings);
  const arr = Array.isArray(list) ? list : [list];
  const page = (s, i) => { const groups = (s.groupIds || []).filter((id) => !groupId || id === groupId).map((id) => store.group(id)).filter(Boolean);
  return `<div class="${i < arr.length - 1 ? 'pb' : ''}">${academyHead(`<b>Boletín de calificaciones</b><div class="muted">${esc(fmtLongDate())}</div>`)}
    ${studentBox(s)}
    ${groups.map((g) => { const sc = store.gradesOf(g.id); const avg = studentAverage(g, sc, s.id); const a = attendanceOf(s.id, store.sheetsOf(g.id)); return `<h2>${esc(store.groupLabel(g))}</h2>
      <div class="muted">${esc(scheduleText(g))}${store.teacher(g.teacherId) ? ` · Profesor(a): ${esc(store.teacher(g.teacherId).name)}` : ''}</div>
      ${(g.evals || []).length ? `<table><tr><th>Evaluación</th><th class="c">Peso</th><th class="c">Nota</th></tr>${g.evals.map((e) => { const v = sc[e.id]?.[s.id]; return `<tr><td>${esc(e.name)}${e.date ? ` <span class="muted">(${fmtDate(e.date)})</span>` : ''}</td><td class="c">${num(e.weight, 0)}%</td><td class="c ${v != null && v < scale.pass ? 'bad' : ''}">${v != null ? num(v, v % 1 ? 1 : 0) : '—'}</td></tr>`; }).join('')}
        <tr class="tot"><td>Promedio</td><td></td><td class="c ${avg != null ? (avg >= scale.pass ? 'ok' : 'bad') : ''}">${avg != null ? num(avg, 2) + ' / ' + scale.max : '—'}</td></tr></table>` : '<p class="muted">Sin evaluaciones registradas.</p>'}
      ${a.total ? `<div style="margin-top:6px">Asistencia: <b>${a.pct}%</b> · ${a.P} presente(s), ${a.T} tarde(s), ${a.A} ausencia(s), ${a.J} justificada(s)</div>` : ''}`; }).join('') || '<p class="muted">El alumno no está inscrito en ningún grupo.</p>'}
    <div class="muted" style="margin-top:10px">Escala: ${esc(scale.label || `del 0 al ${scale.max}`)} · Nota mínima aprobatoria: ${scale.pass}</div>
    <div class="sign"><div>${esc(store.settings.manager || 'Dirección académica')}</div><div>Representante</div></div>
    <div class="foot">SanoAcademia · ${fmtDateTime(new Date().toISOString())}</div></div>`; };
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Boletín ${esc(arr.length === 1 ? arr[0].name : store.businessName)}</title><style>${baseCSS}</style></head><body>${arr.map(page).join('')}</body></html>`);
}

/** Certificado / diploma con QR de verificación */
export async function printCertificate(certs) {
  const list = Array.isArray(certs) ? certs : [certs];
  const qrs = await Promise.all(list.map((c) => qrDataURL(CERT_URL(c.verify), 3)));
  const scale = scaleOf(store.settings);
  const css = `@page { size: A4 landscape; margin: 0; } body { margin: 0; font-family: Georgia, 'Times New Roman', serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 297mm; height: 210mm; position: relative; box-sizing: border-box; padding: 14mm; page-break-after: always; background: #fffdf7; }
    .frame { position: absolute; inset: 9mm; border: 2.2mm solid #312e81; outline: 0.6mm solid #d4a72c; outline-offset: -4.5mm; }
    .corner { position: absolute; width: 26mm; height: 26mm; border: 1mm solid #d4a72c; }
    .c1 { top: 13mm; left: 13mm; border-right: 0; border-bottom: 0; } .c2 { top: 13mm; right: 13mm; border-left: 0; border-bottom: 0; } .c3 { bottom: 13mm; left: 13mm; border-right: 0; border-top: 0; } .c4 { bottom: 13mm; right: 13mm; border-left: 0; border-top: 0; }
    .in { position: relative; text-align: center; padding-top: 14mm; color: #1f1d3d; }
    .acad { font-family: Arial, sans-serif; font-weight: bold; letter-spacing: 1.2mm; text-transform: uppercase; color: #312e81; font-size: 5mm; }
    .t { font-size: 17mm; color: #312e81; margin: 6mm 0 1mm; letter-spacing: .5mm; } .t small { display: block; font-size: 5mm; letter-spacing: 1.5mm; color: #b4891a; font-family: Arial, sans-serif; text-transform: uppercase; margin-top: 2mm; }
    .to { font-size: 5mm; margin-top: 8mm; font-style: italic; color: #444; } .name { font-size: 12mm; margin: 3mm auto 2mm; border-bottom: 0.4mm solid #b4891a; display: inline-block; padding: 0 12mm 2mm; }
    .txt { font-size: 4.6mm; max-width: 210mm; margin: 4mm auto 0; line-height: 1.55; color: #333; }
    .seal { position: absolute; left: 26mm; bottom: 26mm; width: 34mm; height: 34mm; border-radius: 50%; background: radial-gradient(circle, #fcd34d, #b4891a); display: grid; place-items: center; color: #fff; font-family: Arial, sans-serif; font-weight: bold; font-size: 3mm; text-align: center; box-shadow: 0 0 0 1.5mm #fde68a inset; }
    .signs { position: absolute; left: 70mm; right: 70mm; bottom: 30mm; display: flex; gap: 20mm; } .signs div { flex: 1; border-top: 0.4mm solid #333; padding-top: 2mm; font-size: 3.6mm; font-family: Arial, sans-serif; }
    .qr { position: absolute; right: 24mm; bottom: 22mm; text-align: center; font-family: Arial, sans-serif; font-size: 2.6mm; color: #555; } .qr img { width: 26mm; height: 26mm; display: block; margin: 0 auto 1mm; }
    .num { position: absolute; left: 0; right: 0; bottom: 15mm; text-align: center; font-family: Arial, sans-serif; font-size: 2.8mm; color: #777; }`;
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Certificado</title><style>${css}</style></head><body>
    ${list.map((c, i) => `<div class="page"><div class="frame"></div><div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="in"><div class="acad">${esc(store.businessName)}</div>
      <div class="t">Certificado<small>${c.mention ? esc(c.mention) : 'de aprobación'}</small></div>
      <div class="to">Se otorga el presente certificado a</div>
      <div class="name">${esc(c.studentName)}</div>
      <div class="txt">${c.studentIdDoc ? `${esc(loc().id)} ${esc(c.studentIdDoc)}, ` : ''}por haber culminado satisfactoriamente el curso <b>${esc(c.courseName)}</b>${c.level ? ` (${esc(c.level)})` : ''}${c.hours ? `, con una duración de <b>${num(c.hours, 0)} horas académicas</b>` : ''}${c.grade != null ? `, obteniendo una calificación final de <b>${num(c.grade, c.grade % 1 ? 2 : 0)}/${scale.max}</b>` : ''}.<br>${esc(fmtLongDate(new Date((c.date || todayKey()) + 'T12:00:00')))}.</div></div>
      <div class="seal">${esc(store.businessName.split(' ').slice(0, 2).join(' '))}<br>★ ★ ★</div>
      <div class="signs"><div>${esc(store.settings.manager || 'Dirección')}<br><small>Director(a)</small></div><div>${esc(c.teacherName || 'Profesor(a)')}<br><small>Profesor(a) del curso</small></div></div>
      ${qrs[i] ? `<div class="qr"><img src="${qrs[i]}" alt="">Verifica este certificado</div>` : ''}
      <div class="num">Certificado N° ${esc(c.number)} · Código de verificación ${esc(c.verify)} · ${esc(CERT_URL(c.verify))}</div></div>`).join('')}
  </body></html>`);
}

/** Lista del grupo para pasar asistencia en papel o para el profesor */
export function printRoster(g, { withDates = true } = {}) {
  const roster = store.roster(g.id);
  const dates = Array.from({ length: 10 }, () => '');
  printDoc(`Lista · ${store.groupLabel(g)}`, `<div class="muted">${esc(scheduleText(g, { short: false }))}${store.teacher(g.teacherId) ? ` · Profesor(a): ${esc(store.teacher(g.teacherId).name)}` : ''}${store.roomName(g.room) ? ` · ${esc(store.roomName(g.room))}` : ''}</div>
    <table><tr><th>#</th><th>Alumno</th><th>Representante / teléfono</th>${withDates ? dates.map(() => '<th class="c" style="width:28px">&nbsp;</th>').join('') : ''}</tr>
    ${roster.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}<div class="muted">${esc(s.code || '')}</div></td><td>${esc(contactName(s))}<div class="muted">${esc(contactPhone(s))}</div></td>${withDates ? dates.map(() => '<td style="border:1px solid #ccc"></td>').join('') : ''}</tr>`).join('')}</table>
    <div class="muted" style="margin-top:6px">${roster.length} alumno(s) · P = presente, A = ausente, T = tarde, J = justificado</div>`, { landscape: withDates });
}

/** Recibo de pago al profesor */
export function printPayout(p) {
  const t = store.teacher(p.teacherId) || { name: p.teacherName };
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(p.number)}</title><style>${baseCSS}</style></head><body>${academyHead()}
    <div class="grid"><div class="box"><div class="muted">Recibo de pago a profesor</div><div class="big">N° ${esc(p.number)}</div><div>Fecha: ${fmtDate(p.date)} · Mes: <b>${esc(periodName(p.period))}</b></div>${p.status === 'anulado' ? '<div><b>*** ANULADO ***</b></div>' : ''}</div>
      <div class="box"><div class="muted">Profesor(a)</div><div class="big">${esc(t.name)}</div>${t.idDoc ? `<div>${esc(loc().id)} ${esc(t.idDoc)}</div>` : ''}${t.specialty ? `<div>${esc(t.specialty)}</div>` : ''}</div></div>
    <table><tr><th>Concepto</th><th>Forma de pago</th><th class="r">Monto</th></tr><tr><td>${esc(p.detail || 'Honorarios por clases dictadas')}</td><td>${esc(methodLabel(p.method))}${p.reference ? ` · ref. ${esc(p.reference)}` : ''}</td><td class="r">${usd(p.amount)}${bs(p.amount) ? `<br><small>${bs(p.amount)}</small>` : ''}</td></tr></table>
    ${p.note ? `<p>${esc(p.note)}</p>` : ''}
    <div class="sign"><div>Entregado por<br><small>${esc(store.businessName)}</small></div><div>Recibí conforme<br><small>${esc(t.name)}</small></div></div>
    <div class="foot">SanoAcademia · ${fmtDateTime(new Date().toISOString())}</div></body></html>`);
}

/** Documento imprimible genérico (reportes, listados, actas) */
export function printDoc(title, inner, { landscape = false } = {}) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title><style>${baseCSS} @page { margin: 12mm; ${landscape ? 'size: landscape;' : ''} }</style></head><body>
  ${academyHead()}<h1 style="font-size:16px">${esc(title)}</h1><div class="muted">Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="foot">SanoAcademia — Gestión de academias</p></body></html>`);
}
export { usd, bs, amt as moneyBoth, CHARGE_KINDS };
