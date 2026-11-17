// SanoAcademia — Reportes: resultado del mes, cursos, asistencia, morosidad y crecimiento
import { store } from '../store.js';
import { esc, usd, num, emptyState, methodLabel, download, toCSV } from '../utils.js';
import { icon } from '../icons.js';
import { currentPeriod, periodName, lastPeriods, studentBalance, openCharges, groupFee, attendanceOf, catOf, sheetStats } from '../academy.js';
import { printDoc } from '../shared.js';

export function mount(el) {
  let period = currentPeriod();
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Reportes</h1><p class="view-sub">Cómo va la academia: dinero, cursos, asistencia, morosidad y crecimiento.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="r-print">${icon('print')} Imprimir</button><button class="btn btn-ghost" id="r-csv">${icon('download')} CSV</button></div></div>
    <div class="card card-flush"><div class="toolbar"><div class="chips" id="r-months"></div></div></div>
    <div id="r-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);

  const data = () => {
    const inc = store.collectedIn(period), exp = store.expensesIn(period), pay = store.payoutsIn(period);
    const cl = store.closing(period);
    const months = lastPeriods(6).reverse().map((p) => ({ p, inc: store.collectedIn(p), out: store.expensesIn(p) + store.payoutsIn(p), billed: store.closing(p)?.totalBilled || 0 }));
    const courses = store.courses.map((c) => {
      const gs = store.groupsOf(c.id).filter((g) => g.status !== 'finalizado');
      const n = gs.reduce((a, g) => a + store.roster(g.id).length, 0);
      const rev = gs.reduce((a, g) => a + groupFee(g, c) * store.roster(g.id).length, 0);
      return { c, groups: gs.length, n, rev };
    }).filter((x) => x.groups || x.n).sort((a, b) => b.rev - a.rev);
    const groups = store.liveGroups.map((g) => {
      const sh = store.sheetsOf(g.id).filter((s) => s.date.startsWith(period));
      let pres = 0, tot = 0; for (const s of sh) { const st = sheetStats(s); pres += st.present; tot += st.n; }
      return { g, classes: sh.length, pct: tot ? Math.round(pres / tot * 100) : null, n: store.roster(g.id).length, cap: g.capacity || 0 };
    }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
    const aging = { '1': [0, 0], '2': [0, 0], '3+': [0, 0] };
    for (const s of store.debtors) { const n = openCharges(s).filter((x) => x.k === 'mes').length || 1; const k = n >= 3 ? '3+' : String(n); aging[k][0]++; aging[k][1] += studentBalance(s); }
    const methods = {}; for (const p of store.confirmedPayments.filter((x) => (x.date || '').startsWith(period))) methods[p.method] = (methods[p.method] || 0) + (Number(p.amount) || 0);
    const growth = lastPeriods(6).reverse().map((p) => ({ p, alta: store.students.filter((s) => (s.enrolledAt || '').startsWith(p)).length, baja: store.students.filter((s) => (s.retiredAt || '').startsWith(p)).length }));
    return { inc, exp, pay, cl, months, courses, groups, aging, methods, growth };
  };

  function draw() {
    $('#r-months').innerHTML = lastPeriods(12).map((p) => `<button class="chip ${period === p ? 'on' : ''}" data-p="${p}">${esc(periodName(p))}</button>`).join('');
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { period = b.dataset.p; draw(); });
    const d = data();
    const net = d.inc - d.exp - d.pay;
    const maxM = Math.max(1, ...d.months.map((m) => Math.max(m.inc, m.out)));
    const maxC = Math.max(1, ...d.courses.map((x) => x.rev));
    const maxG = Math.max(1, ...d.growth.map((g) => Math.max(g.alta, g.baja)));
    const methTot = Object.values(d.methods).reduce((a, b) => a + b, 0) || 1;
    $('#r-body').innerHTML = `
      <div class="kpis kpis-4">
        <div class="card kpi"><div class="kpi-label">Facturado (mensualidades)</div><div class="kpi-value">${usd(d.cl?.totalBilled || 0)}</div><div class="kpi-sub">${d.cl ? `${d.cl.receipts} alumnos` : 'sin generar'}</div></div>
        <div class="card kpi"><div class="kpi-label">Cobrado</div><div class="kpi-value text-success">${usd(d.inc)}</div><div class="kpi-sub">${d.cl?.totalBilled ? `${Math.round(d.inc / d.cl.totalBilled * 100)}% de lo facturado` : ''}</div></div>
        <div class="card kpi"><div class="kpi-label">Gastos + profesores</div><div class="kpi-value text-danger">${usd(d.exp + d.pay)}</div><div class="kpi-sub">${usd(d.exp)} gastos · ${usd(d.pay)} profesores</div></div>
        <div class="card kpi"><div class="kpi-label">Resultado del mes</div><div class="kpi-value ${net < 0 ? 'text-danger' : ''}">${usd(net)}</div><div class="kpi-sub">${d.inc ? `margen ${Math.round(net / d.inc * 100)}%` : ''}</div></div>
      </div>
      <div class="grid-2 mt-lg">
        <div class="card"><div class="card-title">${icon('chart')} Ingresos vs. egresos (6 meses)</div><div class="bars2 mt">${d.months.map((m) => `<div class="bar2"><div class="bar2-cols"><i class="c" style="height:${m.inc / maxM * 100}%" title="Cobrado ${usd(m.inc)}"></i><i class="b out" style="height:${m.out / maxM * 100}%" title="Egresos ${usd(m.out)}"></i></div><span>${esc(periodName(m.p, true))}</span><small>${usd(m.inc - m.out)}</small></div>`).join('')}</div><div class="ag-legend mt"><span><i class="lg-c"></i> Cobrado</span><span><i class="lg-out"></i> Gastos + profesores</span></div></div>
        <div class="card"><div class="card-title">${icon('book')} Cursos: alumnos e ingreso mensual</div>${d.courses.length ? `<div class="stack mt">${d.courses.map((x) => `<div><div class="between small"><span class="row" style="gap:6px"><i class="dot-c" style="background:${x.c.color || catOf(x.c.category).color}"></i><b>${esc(x.c.name)}</b> <span class="t-sub">${x.n} alumno(s) · ${x.groups} grupo(s)</span></span><b>${usd(x.rev)}</b></div><div class="progress progress-sm"><span style="width:${x.rev / maxC * 100}%;background:${x.c.color || catOf(x.c.category).color}"></span></div></div>`).join('')}</div>` : emptyState('book', 'Sin cursos')}</div>
      </div>
      <div class="grid-2 mt-lg">
        <div class="card card-flush"><div class="card-title pd-3" style="padding-bottom:0">${icon('userCheck')} Asistencia por grupo · ${esc(periodName(period))}</div>${d.groups.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Grupo</th><th class="c">Clases</th><th class="c">Alumnos</th><th class="c">Asistencia</th></tr></thead><tbody>${d.groups.map((x) => `<tr><td>${esc(store.groupLabel(x.g))}<div class="t-sub">${esc(store.teacher(x.g.teacherId)?.name || '')}</div></td><td class="c">${x.classes}</td><td class="c">${x.n}${x.cap ? `/${x.cap}` : ''}</td><td class="c"><b class="${x.pct != null && x.pct < 75 ? 'text-danger' : x.pct != null ? 'text-success' : ''}">${x.pct != null ? x.pct + '%' : '—'}</b></td></tr>`).join('')}</tbody></table></div>` : `<div class="pd-3">${emptyState('userCheck', 'Sin grupos')}</div>`}</div>
        <div class="stack">
          <div class="card"><div class="card-title">${icon('alert')} Morosidad por antigüedad</div><div class="kv kv-3 mt">${[['1', '1 mes'], ['2', '2 meses'], ['3+', '3 o más']].map(([k, l]) => `<div><span>${l}</span><b class="${k === '3+' ? 'text-danger' : ''}">${d.aging[k][0]} · ${usd(d.aging[k][1])}</b></div>`).join('')}</div><div class="t-sub mt">Total por cobrar: <b>${usd(store.totalDebt)}</b> · ${store.solventPct}% de alumnos activos al día</div></div>
          <div class="card"><div class="card-title">${icon('wallet')} Formas de pago · ${esc(periodName(period))}</div>${Object.keys(d.methods).length ? `<div class="stack mt">${Object.entries(d.methods).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><div class="between small"><span>${esc(methodLabel(k))}</span><b>${usd(v)} · ${Math.round(v / methTot * 100)}%</b></div><div class="progress progress-sm"><span style="width:${v / methTot * 100}%"></span></div></div>`).join('')}</div>` : emptyState('wallet', 'Sin pagos este mes')}</div>
          <div class="card"><div class="card-title">${icon('users')} Altas y bajas de alumnos</div><div class="bars2 mt">${d.growth.map((g) => `<div class="bar2"><div class="bar2-cols"><i class="c" style="height:${g.alta / maxG * 100}%" title="Nuevos ${g.alta}"></i><i class="b out" style="height:${g.baja / maxG * 100}%" title="Retirados ${g.baja}"></i></div><span>${esc(periodName(g.p, true))}</span><small>+${g.alta}/−${g.baja}</small></div>`).join('')}</div><div class="ag-legend mt"><span><i class="lg-c"></i> Nuevos</span><span><i class="lg-out"></i> Retirados</span></div></div>
        </div>
      </div>`;
    $('#r-print').onclick = () => printDoc(`Reporte de ${periodName(period)}`, `<div class="kpis"><div class="kpi">Facturado<b>${usd(d.cl?.totalBilled || 0)}</b></div><div class="kpi">Cobrado<b>${usd(d.inc)}</b></div><div class="kpi">Gastos<b>${usd(d.exp)}</b></div><div class="kpi">Profesores<b>${usd(d.pay)}</b></div><div class="kpi">Resultado<b>${usd(net)}</b></div></div>
      <h2>Cursos</h2><table><tr><th>Curso</th><th class="c">Grupos</th><th class="c">Alumnos</th><th class="r">Ingreso mensual</th></tr>${d.courses.map((x) => `<tr><td>${esc(x.c.name)}</td><td class="c">${x.groups}</td><td class="c">${x.n}</td><td class="r">${usd(x.rev)}</td></tr>`).join('')}</table>
      <h2>Asistencia por grupo</h2><table><tr><th>Grupo</th><th>Profesor</th><th class="c">Clases</th><th class="c">Asistencia</th></tr>${d.groups.map((x) => `<tr><td>${esc(store.groupLabel(x.g))}</td><td>${esc(store.teacher(x.g.teacherId)?.name || '')}</td><td class="c">${x.classes}</td><td class="c">${x.pct ?? '—'}${x.pct != null ? '%' : ''}</td></tr>`).join('')}</table>
      <h2>Morosidad</h2><table><tr><th>Antigüedad</th><th class="c">Alumnos</th><th class="r">Monto</th></tr>${Object.entries(d.aging).map(([k, v]) => `<tr><td>${k} mes(es)</td><td class="c">${v[0]}</td><td class="r">${usd(v[1])}</td></tr>`).join('')}</table>`);
    $('#r-csv').onclick = () => download(`reporte-${period}.csv`, toCSV([['Curso', 'Grupos', 'Alumnos', 'Ingreso mensual'], ...d.courses.map((x) => [x.c.name, x.groups, x.n, num(x.rev)]), [], ['Grupo', 'Profesor', 'Clases', 'Asistencia %'], ...d.groups.map((x) => [store.groupLabel(x.g), store.teacher(x.g.teacherId)?.name || '', x.classes, x.pct ?? '']), [], ['Mes', 'Cobrado', 'Egresos'], ...d.months.map((m) => [m.p, num(m.inc), num(m.out)])]), 'text/csv;charset=utf-8');
  }
  draw();
  const off = store.on('*', (e) => { if (['payments', 'expenses', 'payouts', 'closings', 'students', 'groups', 'attendance', 'settings', 'rate'].includes(e)) draw(); });
  return () => off();
}
