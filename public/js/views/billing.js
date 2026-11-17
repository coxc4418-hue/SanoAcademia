// SanoAcademia — Mensualidades: vista previa, generación del mes, envío por WhatsApp, impresión y cargos extra
import { store } from '../store.js';
import { esc, usd, bs, num, emptyState, toast, openModal, setBusy, confirmDialog, fmtDate, fmtDateTime, download, toCSV, normalize, dayKey, addDays, todayKey } from '../utils.js';
import { icon } from '../icons.js';
import { currentPeriod, periodName, addMonths, dueDateFor, studentBalance } from '../academy.js';
import { previewMonthly, emitMonthly, annulMonthly } from '../ops.js';
import { studentAvatar, openStudent, pickStudent, chargeModal } from '../student.js';
import { waStudent, printReceipts } from '../shared.js';

export function mount(el, { navigate }) {
  let period = currentPeriod();
  let receipts = null;
  let q = '';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Mensualidades</h1><p class="view-sub">Genera en un clic la mensualidad de cada alumno según sus grupos, con becas, descuento por hermanos y recargo por mora.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="b-charge">${icon('plus')} Cargo individual</button><button class="btn btn-ghost" id="b-cfg">${icon('settings')} Reglas de cobro</button></div></div>
    <div class="card card-flush"><div class="toolbar"><div class="chips" id="b-months"></div></div></div>
    <div id="b-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  $('#b-cfg').onclick = () => navigate('ajustes', { tab: 'cobro' });
  $('#b-charge').onclick = async () => { const s = await pickStudent({ title: 'Cargo individual: elige el alumno' }); if (s) chargeModal(s); };

  function months() {
    const list = [addMonths(currentPeriod(), 1), currentPeriod(), addMonths(currentPeriod(), -1), addMonths(currentPeriod(), -2), addMonths(currentPeriod(), -3)];
    $('#b-months').innerHTML = list.map((p) => `<button class="chip ${period === p ? 'on' : ''}" data-p="${p}">${esc(periodName(p))}${store.closing(p) ? ` ${icon('check')}` : ''}</button>`).join('');
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { period = b.dataset.p; receipts = null; draw(); });
  }

  function preview() {
    const { summary, rows } = previewMonthly(period);
    const due0 = dueDateFor(store.settings, period); const soon = dayKey(addDays(new Date(), 5)); const due = due0 < todayKey() ? soon : due0;
    const st = store.settings;
    const t = normalize(q);
    const shown = rows.filter((r) => !t || normalize(r.student.name).includes(t));
    $('#b-body').innerHTML = `
      <div class="card"><div class="card-head"><div class="card-title">${icon('file')} Vista previa · ${esc(periodName(period))}</div><span class="badge badge-warning">Sin generar</span></div>
        <div class="kpis kpis-4">
          <div class="kpi"><div class="kpi-label">Alumnos a facturar</div><div class="kpi-value">${summary.students}</div></div>
          <div class="kpi"><div class="kpi-label">Mensualidades</div><div class="kpi-value">${usd(summary.gross)}</div></div>
          <div class="kpi"><div class="kpi-label">Becas y descuentos</div><div class="kpi-value text-success">−${usd(summary.discounts)}</div><div class="kpi-sub">${summary.siblings ? `${summary.siblings} con descuento por hermanos` : ''}</div></div>
          <div class="kpi"><div class="kpi-label">Total a cobrar</div><div class="kpi-value">${usd(summary.totalBilled)}</div><div class="kpi-sub">${bs(summary.totalBilled) || ''}${summary.mora ? ` · mora ${usd(summary.mora)}` : ''}</div></div>
        </div>
        <div class="form-grid mt">
          <div class="field"><label>Fecha límite de pago</label><input class="input" type="date" id="b-due" value="${due}"></div>
          <div class="field"><label>Nota para todos (opcional)</label><input class="input" id="b-note" maxlength="300" placeholder="Ej.: El 24 no hay clases por feriado."></div>
        </div>
        <div class="hint">${st.siblingPct ? `Descuento por hermanos: ${st.siblingPct}% (mismo teléfono del representante). ` : ''}${st.lateFee?.enabled ? `Recargo por mora: ${st.lateFee.mode === 'pct' ? `${st.lateFee.value}% de lo vencido` : usd(st.lateFee.value)}. ` : ''}Puedes cambiar estas reglas en Configuración.</div>
        <button class="btn btn-primary btn-lg btn-block mt" id="b-emit" ${rows.length ? '' : 'disabled'}>${icon('check')} Generar ${rows.length} mensualidad(es) de ${esc(periodName(period))}</button>
      </div>
      <div class="card card-flush mt-lg"><div class="toolbar"><label class="search grow">${icon('search')}<input id="b-q" value="${esc(q)}" placeholder="Buscar alumno…"></label></div>
        ${shown.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Alumno</th><th>Detalle</th><th class="r">Total</th></tr></thead><tbody>${shown.map((r) => `<tr><td><div class="row" style="gap:8px;flex-wrap:nowrap">${studentAvatar(r.student, 'sm')}<button class="linkish ellipsis" data-s="${r.student.id}">${esc(r.student.name)}</button></div></td><td class="small">${r.items.map((i) => `<div class="${i.amount < 0 ? 'text-success' : i.kind === 'mora' ? 'text-danger' : ''}">${esc(i.concept)} · ${i.amount < 0 ? '−' : ''}${usd(Math.abs(i.amount))}</div>`).join('')}</td><td class="r"><b class="num">${usd(r.total)}</b></td></tr>`).join('')}</tbody></table></div>`
          : `<div class="pd-3">${emptyState('file', rows.length ? 'Sin resultados' : 'Nada que facturar', rows.length ? '' : 'No hay alumnos activos inscritos en grupos con mensualidad para este mes.')}</div>`}</div>`;
    $('#b-q').oninput = (e) => { q = e.target.value; preview(); setTimeout(() => { const i = $('#b-q'); i?.focus(); i?.setSelectionRange(q.length, q.length); }, 0); };
    el.querySelectorAll('#b-body [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s));
    $('#b-emit')?.addEventListener('click', async (e) => {
      if (!(await confirmDialog({ title: `Generar mensualidades de ${periodName(period)}`, message: `Se cargará la mensualidad a ${rows.length} alumno(s) por un total de ${usd(summary.totalBilled)}. Sus portales se actualizan al instante.`, confirmText: 'Generar' }))) return;
      const btn = e.currentTarget; setBusy(btn, true, 'Generando…');
      try { const r = await emitMonthly(period, { dueDate: $('#b-due').value || due, note: $('#b-note').value }); toast(`Listo: ${r.count} mensualidades generadas`); receipts = null; draw(); }
      catch (ex) { toast(ex.message, 'danger', 5000); setBusy(btn, false); }
    });
  }

  async function emitted(cl) {
    if (!receipts) { $('#b-body').innerHTML = '<div class="card"><div class="spinner" style="margin:30px auto"></div></div>'; receipts = await store.periodReceipts(period).catch(() => []); }
    const coll = store.collectedIn(period);
    const pct = cl.totalBilled ? Math.min(100, Math.round(coll / cl.totalBilled * 100)) : 0;
    const t = normalize(q);
    const list = receipts.filter((r) => !t || normalize(r.studentName).includes(t));
    $('#b-body').innerHTML = `
      <div class="card"><div class="card-head"><div class="card-title">${icon('file')} Mensualidades de ${esc(periodName(period))}</div><span class="badge badge-success">${icon('check')} Generadas</span></div>
        <div class="kpis kpis-4">
          <div class="kpi"><div class="kpi-label">Alumnos</div><div class="kpi-value">${cl.receipts}</div><div class="kpi-sub">${esc(cl.firstNumber || '')}${cl.lastNumber ? ` a ${esc(cl.lastNumber)}` : ''}</div></div>
          <div class="kpi"><div class="kpi-label">Total facturado</div><div class="kpi-value">${usd(cl.totalBilled)}</div><div class="kpi-sub">${bs(cl.totalBilled) || ''}</div></div>
          <div class="kpi"><div class="kpi-label">Cobrado en el mes</div><div class="kpi-value text-success">${usd(coll)}</div><div class="kpi-sub">${pct}%</div></div>
          <div class="kpi"><div class="kpi-label">Vence</div><div class="kpi-value" style="font-size:20px">${fmtDate(cl.dueDate)}</div><div class="kpi-sub">generadas ${fmtDateTime(cl.emittedAt)}</div></div>
        </div>
        <div class="progress mt"><span style="width:${pct}%"></span></div>
        <div class="row mt" style="gap:6px;flex-wrap:wrap"><button class="btn btn-whatsapp" id="b-send">${icon('whatsapp')} Enviar por WhatsApp</button><button class="btn btn-secondary" id="b-print">${icon('print')} Imprimir todas</button><button class="btn btn-ghost" id="b-csv">${icon('download')} CSV</button><button class="btn btn-ghost" id="b-annul">${icon('x')} Anular</button><button class="btn btn-ghost" id="b-coll">${icon('wallet')} Ir a cobranza</button></div>
      </div>
      <div class="card card-flush mt-lg"><div class="toolbar"><label class="search grow">${icon('search')}<input id="b-q" value="${esc(q)}" placeholder="Buscar alumno…"></label></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Alumno</th><th class="r">Mensualidad</th><th class="r">Saldo actual</th><th></th></tr></thead><tbody>
        ${list.map((r) => { const s = store.student(r.studentId); const bal = s ? studentBalance(s) : 0; return `<tr><td class="mono small">${esc(r.number)}</td><td><button class="linkish" data-s="${r.studentId}">${esc(r.studentName)}</button><div class="t-sub">${r.items.filter((i) => i.amount < 0).map((i) => esc(i.concept)).join(', ')}</div></td><td class="r"><b class="num">${usd(r.total)}</b></td><td class="r">${bal > 0.009 ? `<span class="text-danger">${usd(bal)}</span>` : '<span class="badge badge-success">Al día</span>'}</td>
          <td class="r" style="white-space:nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-pr="${r.id}" title="Imprimir">${icon('print')}</button>${s ? `<button class="btn btn-ghost btn-icon btn-sm" data-wa="${r.id}" title="WhatsApp">${icon('whatsapp')}</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div></div>`;
    $('#b-q').oninput = (e) => { q = e.target.value; emitted(cl); setTimeout(() => { const i = $('#b-q'); i?.focus(); i?.setSelectionRange(q.length, q.length); }, 0); };
    el.querySelectorAll('#b-body [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s, { tab: 'cuenta' }));
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipts([receipts.find((r) => r.id === b.dataset.pr)]));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const r = receipts.find((x) => x.id === b.dataset.wa); waStudent('mensualidad', { student: store.student(r.studentId), receipt: r }); });
    $('#b-print').onclick = () => printReceipts(list, `Mensualidades ${periodName(period)}`);
    $('#b-coll').onclick = () => navigate('cobranza');
    $('#b-csv').onclick = () => download(`mensualidades-${period}.csv`, toCSV([['N°', 'Matrícula', 'Alumno', 'Detalle', 'Total', 'Vence'], ...receipts.map((r) => [r.number, r.studentCode, r.studentName, r.items.map((i) => `${i.concept}: ${num(i.amount)}`).join(' | '), num(r.total), r.dueDate])]), 'text/csv;charset=utf-8');
    $('#b-send').onclick = () => {
      const m = openModal({ title: 'Enviar mensualidades por WhatsApp', size: 'md', sub: 'Toca cada alumno: se abre WhatsApp con su mensualidad, los datos para pagar y su portal.',
        body: `<div class="list" style="max-height:55vh;overflow:auto">${receipts.map((r) => { const s = store.student(r.studentId); return s ? `<div class="list-item">${studentAvatar(s)}<div class="grow"><b>${esc(r.studentName)}</b><div class="t-sub">${usd(r.total)}</div></div><button class="btn btn-whatsapp btn-sm" data-ws="${r.id}">${icon('whatsapp')} Enviar</button></div>` : ''; }).join('')}</div>` });
      m.el.querySelectorAll('[data-ws]').forEach((b) => b.onclick = () => { const r = receipts.find((x) => x.id === b.dataset.ws); waStudent('mensualidad', { student: store.student(r.studentId), receipt: r }); b.classList.replace('btn-whatsapp', 'btn-secondary'); b.innerHTML = `${icon('check')} Enviado`; });
    };
    $('#b-annul').onclick = async () => {
      const { requirePin } = await import('../auth.js');
      if (!(await requirePin('Anular las mensualidades del mes'))) return;
      if (!(await confirmDialog({ title: `Anular mensualidades de ${periodName(period)}`, message: 'Se quitan los cargos de este mes a todos los alumnos. Los pagos recibidos se conservan como saldo a favor.', confirmText: 'Anular', danger: true }))) return;
      try { await annulMonthly(cl); toast('Mensualidades anuladas'); receipts = null; draw(); } catch (ex) { toast(ex.message, 'danger', 6000); }
    };
  }

  function draw() {
    months();
    const cl = store.closing(period);
    if (cl) emitted(cl); else preview();
  }
  draw();
  const off = store.on('*', (e) => {
    if (el.querySelector('#b-q:focus')) return;
    if (e === 'closings') { receipts = null; draw(); }
    else if (['students', 'groups', 'courses', 'settings', 'payments'].includes(e)) draw();
  });
  return () => off();
}
