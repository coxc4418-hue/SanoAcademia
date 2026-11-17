// SanoAcademia — Portal público del profesor: /profe/CODIGO (pasa la lista y carga notas desde el teléfono)
import { getPortal } from '../store.js';
import { db, doc, collection, setDoc } from '../firebase.js';
import { esc, num, fmtDate, waLink, applyLocale, usd, toast, todayKey, nowISO, dayKey, addDays } from '../utils.js';
import { icon } from '../icons.js';
import { DAYS, fmtHour, ATT, periodName, PAY_MODES } from '../academy.js';
import { weekHTML, nextClass } from './portal.js';

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } };

export async function mount(root) {
  document.title = 'Portal del profesor · SanoAcademia';
  const code = (/\/profe\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="portal-page"><div class="empty"><div class="spinner"></div></div></div>';
  let P = null;
  try { P = code ? await getPortal(code) : null; } catch (e) { console.error(e); }
  if (!P || P.active === false || P.kind !== 'profesor') {
    if (P && P.kind === 'alumno') { location.replace('/portal/' + code); return; }
    root.innerHTML = `<div class="portal-page"><div class="card portal-err"><img src="/assets/logo.svg" alt="" width="64"><h1>${P ? 'Portal no disponible' : 'Portal no encontrado'}</h1><p>El código <b>${esc(code || '—')}</b> ${P ? 'está desactivado por la academia.' : 'no existe o fue renovado.'} Pide tu enlace actualizado a la coordinación.</p>
      <form class="row" style="gap:6px;justify-content:center" id="pc"><input class="input" style="max-width:180px;text-transform:uppercase" name="c" placeholder="Tu código" maxlength="12"><button class="btn btn-primary">Entrar</button></form></div></div>`;
    root.querySelector('#pc').onsubmit = (e) => { e.preventDefault(); const c = e.target.elements.c.value.trim().toUpperCase(); if (c.length >= 4) location.href = '/profe/' + encodeURIComponent(c); };
    return;
  }
  try { applyLocale(P.country || 'VE', P.currency || null); } catch (_) {}
  document.title = `${P.name} · ${P.academy}`;
  const sentKey = 'sa_sent_' + code;
  const sent = JSON.parse(LS(sentKey) || '{}');
  const mark = (k) => { sent[k] = nowISO(); LS(sentKey, JSON.stringify(sent)); };
  let tab = 'hoy';
  let sel = { groupId: '', date: todayKey(), evalId: '' };

  function shell() {
    const today = todayKey();
    const todayN = P.groups.reduce((a, g) => a + (g.schedule || []).filter((s) => Number(s.day) === new Date().getDay()).length, 0);
    root.innerHTML = `<div class="portal-page">
      <header class="portal-hero ok teacher-hero">
        <div class="portal-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(P.academy)}</b><small>Portal del profesor</small></div>${P.academyPhone ? `<a class="btn btn-ghost btn-sm portal-wa" href="${waLink(P.academyPhone, `Hola, soy ${P.name}.`)}" target="_blank" rel="noopener">${icon('whatsapp')}</a>` : ''}</div>
        <div class="portal-unit"><span>${icon('briefcase')} <b>${esc(P.name)}</b></span>${P.specialty ? `<span>${esc(P.specialty)}</span>` : ''}<span>${P.groups.length} grupo(s)</span></div>
        <div class="portal-bal"><small>${esc(DAYS[new Date().getDay()])} ${fmtDate(today)}</small><b>${todayN} clase(s) hoy</b><span>${P.month.classes} clase(s) dictada(s) en ${esc(periodName(P.month.period).split(' ')[0].toLowerCase())}</span></div>
      </header>
      <nav class="portal-tabs">${[['hoy', 'Hoy', 'calendar'], ['lista', 'Pasar lista', 'userCheck'], ['notas', 'Notas', 'clipboard'], ['horas', 'Mis horas', 'clock']].map(([k, l, i]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${icon(i)}<span>${l}</span></button>`).join('')}</nav>
      <main id="pt-body" class="portal-body"></main>
      <p class="portal-by">Portal privado del profesor · Hecho con <b>SanoAcademia</b><br><small>Agrega esta página a tu pantalla de inicio.</small></p>
    </div>`;
    root.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => { tab = x.dataset.tab; shell(); });
    ({ hoy, lista, notas, horas })[tab]();
  }
  const body = () => root.querySelector('#pt-body');
  async function send(type, data) {
    const ref = doc(collection(db, 'inbox'));
    await setDoc(ref, { tenantId: P.tenantId, code, who: P.who, teacherName: P.name, type, status: 'nueva', createdAt: nowISO(), ...data });
  }

  function hoy() {
    const dow = new Date().getDay();
    const cls = P.groups.flatMap((g) => (g.schedule || []).filter((s) => Number(s.day) === dow).map((s) => ({ g, s }))).sort((a, b) => a.s.from.localeCompare(b.s.from));
    const nx = nextClass(P.groups);
    body().innerHTML = `
      ${cls.length ? `<div class="card"><div class="card-title">${icon('calendar')} Tus clases de hoy</div><div class="list mt">${cls.map(({ g, s }) => { const done = g.taken.includes(todayKey()) || sent[`a_${g.id}_${todayKey()}`];
        return `<div class="list-item class-row"><span class="class-time" style="--gc:${g.color}"><b>${fmtHour(s.from)}</b><small>${fmtHour(s.to)}</small></span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(g.course)}${g.name ? ` · ${esc(g.name)}` : ''}</b><div class="t-sub">${g.roster.length} alumnos${g.room ? ` · ${esc(g.room)}` : ''}</div></div>${done ? `<span class="badge badge-success">${icon('check')} Lista</span>` : `<button class="btn btn-primary btn-sm" data-l="${g.id}">${icon('userCheck')} Lista</button>`}</div>`; }).join('')}</div></div>`
        : `<div class="card center"><p class="muted" style="margin:0">Hoy no tienes clases.${nx ? ` Tu próxima clase: <b>${esc(DAYS[nx.d.getDay()].toLowerCase())} ${fmtHour(nx.s.from)}</b> · ${esc(nx.g.course)}.` : ''}</p></div>`}
      <div class="card"><div class="card-title">${icon('calendar')} Tu horario</div><div class="mt">${weekHTML(P.groups)}</div></div>`;
    body().querySelectorAll('[data-l]').forEach((x) => x.onclick = () => { sel.groupId = x.dataset.l; sel.date = todayKey(); tab = 'lista'; shell(); });
  }

  function lista() {
    if (!sel.groupId) sel.groupId = P.groups[0]?.id || '';
    const g = P.groups.find((x) => x.id === sel.groupId);
    const marks = {};
    const key = () => `a_${sel.groupId}_${sel.date}`;
    body().innerHTML = `<div class="card stack">
      <div class="form-grid"><div class="field"><label>Grupo</label><select class="input select" id="tp-g">${P.groups.map((x) => `<option value="${x.id}" ${x.id === sel.groupId ? 'selected' : ''}>${esc(x.course)}${x.name ? ` · ${esc(x.name)}` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Fecha</label><input class="input" type="date" id="tp-d" value="${sel.date}" max="${todayKey()}" min="${dayKey(addDays(new Date(), -14))}"></div></div>
      ${g ? `${g.taken.includes(sel.date) || sent[key()] ? `<div class="box">${icon('checkCircle')} La lista de esta fecha ya ${g.taken.includes(sel.date) ? 'está registrada' : 'fue enviada'}. Si la envías de nuevo, se reemplaza.</div>` : ''}
        <div class="between"><b>${g.roster.length} alumno(s)</b><button class="btn btn-secondary btn-sm" id="tp-all">${icon('check')} Todos presentes</button></div>
        <div class="att-list">${g.roster.map((s) => `<div class="att-row" data-sid="${s.id}"><span class="s-av" style="background:#6366f1">${esc(s.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><b class="grow ellipsis">${esc(s.name)}</b><div class="att-btns">${Object.entries(ATT).map(([k, v]) => `<button class="att-b att-${k}" data-m="${k}" title="${v.label}">${v.short}</button>`).join('')}</div></div>`).join('')}</div>
        <div class="field"><label>Tema de la clase</label><input class="input" id="tp-topic" maxlength="200" placeholder="Ej.: Unidad 4 · vocabulario"></div>
        <div class="error-msg" id="tp-err"></div>
        <button class="btn btn-primary btn-lg" id="tp-send">${icon('send')} Enviar lista</button>` : '<p class="muted">No tienes grupos asignados.</p>'}</div>`;
    body().querySelector('#tp-g')?.addEventListener('change', (e) => { sel.groupId = e.target.value; lista(); });
    body().querySelector('#tp-d')?.addEventListener('change', (e) => { sel.date = e.target.value || todayKey(); lista(); });
    if (!g) return;
    const paint = (row) => row.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', marks[row.dataset.sid] === x.dataset.m));
    body().querySelectorAll('.att-row').forEach((row) => row.querySelectorAll('[data-m]').forEach((x) => x.onclick = () => { const sid = row.dataset.sid; marks[sid] = marks[sid] === x.dataset.m ? undefined : x.dataset.m; if (!marks[sid]) delete marks[sid]; paint(row); }));
    body().querySelector('#tp-all').onclick = () => { g.roster.forEach((s) => { if (!marks[s.id]) marks[s.id] = 'P'; }); body().querySelectorAll('.att-row').forEach(paint); };
    body().querySelector('#tp-send').onclick = async (e) => {
      const err = body().querySelector('#tp-err');
      const miss = g.roster.filter((s) => !marks[s.id]);
      if (miss.length) { if (!confirm(`${miss.length} alumno(s) sin marcar se enviarán como ausentes. ¿Continuar?`)) return; miss.forEach((s) => { marks[s.id] = 'A'; }); }
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await send('asistencia', { groupId: g.id, date: sel.date, marks, topic: body().querySelector('#tp-topic').value.trim().slice(0, 200) });
        mark(key());
        const abs = g.roster.filter((s) => marks[s.id] === 'A').length;
        body().innerHTML = `<div class="card center portal-done"><span class="kpi-icon tone-success">${icon('checkCircle')}</span><h2>¡Lista enviada!</h2><p class="muted">${esc(g.course)} · ${fmtDate(sel.date)}<br>${g.roster.length - abs} presente(s) · ${abs} ausente(s). La academia la recibe al instante.</p><button class="btn btn-secondary" id="tp-back">${icon('arrowLeft')} Volver</button></div>`;
        body().querySelector('#tp-back').onclick = () => { tab = 'hoy'; shell(); };
      } catch (ex) { console.error(ex); err.textContent = 'No se pudo enviar. Revisa tu conexión.'; btn.disabled = false; }
    };
  }

  function notas() {
    if (!sel.groupId) sel.groupId = P.groups[0]?.id || '';
    const g = P.groups.find((x) => x.id === sel.groupId);
    if (g && !g.evals.some((e) => e.id === sel.evalId)) sel.evalId = g.evals[0]?.id || '';
    const ev = g?.evals.find((e) => e.id === sel.evalId);
    body().innerHTML = `<div class="card stack">
      <div class="form-grid"><div class="field"><label>Grupo</label><select class="input select" id="tn-g">${P.groups.map((x) => `<option value="${x.id}" ${x.id === sel.groupId ? 'selected' : ''}>${esc(x.course)}${x.name ? ` · ${esc(x.name)}` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Evaluación</label><select class="input select" id="tn-e">${(g?.evals || []).map((e) => `<option value="${e.id}" ${e.id === sel.evalId ? 'selected' : ''}>${esc(e.name)} (${num(e.weight, 0)}%)</option>`).join('')}</select></div></div>
      ${!g ? '<p class="muted">No tienes grupos asignados.</p>' : !ev ? '<p class="muted">Este grupo aún no tiene plan de evaluación. Pídele a la coordinación que lo cree.</p>' : `
        <p class="hint" style="margin:0">Escala del 0 al ${P.scale.max} · aprueba con ${P.scale.pass}. Deja vacío a quien no presentó.</p>
        <div class="list">${g.roster.map((s) => { const v = ev.scores?.[s.id]; return `<div class="list-item"><b class="grow ellipsis">${esc(s.name)}</b><input class="input grade-cell" data-s="${s.id}" inputmode="decimal" value="${v ?? ''}" maxlength="6" style="max-width:90px"></div>`; }).join('')}</div>
        <div class="error-msg" id="tn-err"></div>
        ${sent[`n_${g.id}_${ev.id}`] ? `<div class="t-sub">${icon('check')} Ya enviaste notas de esta evaluación; si las envías de nuevo, se actualizan.</div>` : ''}
        <button class="btn btn-primary btn-lg" id="tn-send">${icon('send')} Enviar notas</button>`}</div>`;
    body().querySelector('#tn-g')?.addEventListener('change', (e) => { sel.groupId = e.target.value; sel.evalId = ''; notas(); });
    body().querySelector('#tn-e')?.addEventListener('change', (e) => { sel.evalId = e.target.value; notas(); });
    body().querySelectorAll('.grade-cell').forEach((inp) => { inp.oninput = () => { const n = Number(inp.value.replace(',', '.')); inp.classList.toggle('bad', inp.value !== '' && (!isFinite(n) || n < 0 || n > P.scale.max)); }; inp.onfocus = () => inp.select(); });
    body().querySelector('#tn-send')?.addEventListener('click', async (e) => {
      const err = body().querySelector('#tn-err');
      if (body().querySelector('.grade-cell.bad')) { err.textContent = `Hay notas fuera de la escala (0 a ${P.scale.max}).`; return; }
      const scores = {}; body().querySelectorAll('.grade-cell').forEach((i) => { if (i.value.trim() !== '') scores[i.dataset.s] = Number(i.value.replace(',', '.')); });
      if (!Object.keys(scores).length) { err.textContent = 'Escribe al menos una nota.'; return; }
      const btn = e.currentTarget; btn.disabled = true;
      try { await send('notas', { groupId: g.id, evalId: ev.id, scores }); mark(`n_${g.id}_${ev.id}`); toast('¡Notas enviadas!'); notas(); }
      catch (ex) { console.error(ex); err.textContent = 'No se pudo enviar. Revisa tu conexión.'; btn.disabled = false; }
    });
  }

  function horas() {
    const M = P.month;
    body().innerHTML = `<div class="card"><div class="card-title">${icon('clock')} ${esc(periodName(M.period))}</div>
      <div class="kpis kpis-mini mt"><div class="kpi"><div class="kpi-label">Clases</div><div class="kpi-value">${M.classes}</div></div><div class="kpi"><div class="kpi-label">Horas</div><div class="kpi-value">${num(M.hours, 1)}</div></div><div class="kpi"><div class="kpi-label">Calculado</div><div class="kpi-value">${usd(M.amount)}</div></div><div class="kpi"><div class="kpi-label">Pagado</div><div class="kpi-value text-success">${usd(M.paid)}</div></div></div>
      <p class="hint" style="margin-bottom:0">${esc(PAY_MODES[M.mode]?.label || '')}. Se calcula con las listas de asistencia registradas.</p></div>
      ${P.payouts.length ? `<div class="card"><div class="card-title">${icon('wallet')} Pagos recibidos</div><div class="list mt">${P.payouts.map((p) => `<div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('check')}</span><div class="grow"><b>${usd(p.amount)}</b><div class="t-sub">${fmtDate(p.date)} · ${esc(periodName(p.period))}</div></div><span class="t-sub mono">${esc(p.n)}</span></div>`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-title">${icon('users')} Mis grupos</div><div class="list mt">${P.groups.map((g) => `<div class="list-item"><i class="dot-c" style="background:${g.color}"></i><div class="grow"><b>${esc(g.course)}${g.name ? ` · ${esc(g.name)}` : ''}</b><div class="t-sub">${esc(g.text)} · ${g.roster.length} alumnos</div></div></div>`).join('')}</div></div>`;
  }
  shell();
}
