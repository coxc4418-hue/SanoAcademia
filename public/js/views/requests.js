// SanoAcademia — Solicitudes y justificativos (desde el portal del alumno o la recepción)
import { store } from '../store.js';
import { esc, emptyState, toast, openModal, fmtDateTime } from '../utils.js';
import { icon } from '../icons.js';
import { studentAvatar, openStudent, requestModal } from '../student.js';
import { REQUEST_CATS, REQUEST_STATUS, badge } from '../academy.js';
import { setInbox } from '../ops.js';
import { waStudent } from '../shared.js';

export function mount(el) {
  let filter = 'abiertas';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Solicitudes y justificativos</h1><p class="view-sub">Justificativos de inasistencia, consultas, cambios de horario y constancias. Las del portal llegan solas; respóndelas y el alumno ve el estado.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="r-new">${icon('plus')} Nueva solicitud</button></div></div>
    <div class="chips" id="r-chips"></div>
    <div class="kboard mt" id="r-board"></div>`;
  const $ = (s) => el.querySelector(s);
  function draw() {
    const all = store.inboxOf('solicitud');
    const F = { abiertas: ['nueva', 'en_proceso'], resueltas: ['resuelta', 'descartada'], todas: null };
    $('#r-chips').innerHTML = [['abiertas', 'Abiertas'], ['resueltas', 'Cerradas'], ['todas', 'Todas']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l} <span class="chip-n">${all.filter((x) => !F[k] || F[k].includes(x.status)).length}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
    const cols = filter === 'abiertas' ? ['nueva', 'en_proceso'] : filter === 'resueltas' ? ['resuelta', 'descartada'] : ['nueva', 'en_proceso', 'resuelta', 'descartada'];
    $('#r-board').innerHTML = all.length ? cols.map((st) => { const items = all.filter((x) => x.status === st); return `<div class="kcol"><div class="kcol-head">${badge(REQUEST_STATUS, st)} <span class="t-sub">${items.length}</span></div><div class="kcol-list">${items.map((x) => { const c = REQUEST_CATS[x.category] || REQUEST_CATS.otro; const s = store.student(x.who); return `<div class="card req-card" data-r="${x.id}"><div class="row" style="gap:8px">${s ? studentAvatar(s) : ''}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(x.studentName || s?.name || '')}</b><div class="t-sub">${icon(c.icon)} ${c.label}${x.date ? ` · ${esc(x.date)}` : ''}</div></div></div><p class="small" style="margin:8px 0 4px">${esc(x.text)}</p>${x.reply ? `<div class="t-sub">↳ ${esc(x.reply)}</div>` : ''}<div class="t-sub">${esc(x.name && x.name !== 'Academia' ? x.name + ' · ' : '')}${fmtDateTime(x.createdAt)}</div></div>`; }).join('') || '<div class="t-sub center pd-3">—</div>'}</div></div>`; }).join('')
      : `<div class="card" style="grid-column:1/-1">${emptyState('inbox', 'Sin solicitudes', 'Los alumnos y representantes pueden enviarlas desde su portal; también puedes registrarlas tú.')}</div>`;
    el.querySelectorAll('[data-r]').forEach((c) => c.onclick = () => detail(store.inbox.find((x) => x.id === c.dataset.r)));
  }
  function detail(x) {
    const s = store.student(x.who);
    const c = REQUEST_CATS[x.category] || REQUEST_CATS.otro;
    const m = openModal({
      title: `${c.label} · ${esc(x.studentName || s?.name || '')}`, size: 'md', sub: `${esc(x.name || '')}${x.phone ? ' · ' + esc(x.phone) : ''} · ${fmtDateTime(x.createdAt)}`,
      body: `<div class="stack"><div class="box">${esc(x.text)}${x.date ? `<div class="t-sub mt-xs">Fecha de la clase: ${esc(x.date)}</div>` : ''}</div>
        <div class="field"><label>Estado</label><div class="seg seg-block">${Object.entries(REQUEST_STATUS).map(([k, v]) => `<button type="button" data-st="${k}" class="${x.status === k ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>
        <div class="field"><label>Respuesta (el alumno la ve en su portal)</label><textarea class="input textarea" data-reply rows="3" placeholder="Ej.: Justificativo recibido. La inasistencia quedó justificada.">${esc(x.reply || '')}</textarea></div>
        ${x.category === 'justificativo' && s ? '<p class="hint" style="margin:0">Para justificar la falta, abre la lista de esa clase en Asistencia y marca «J».</p>' : ''}</div>`,
      footer: `${s ? `<button class="btn btn-ghost" data-u>${icon('user')} Alumno</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')}</button>` : ''}<button class="btn btn-secondary" data-close>Cerrar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    let st = x.status;
    m.el.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { st = b.dataset.st; m.el.querySelectorAll('[data-st]').forEach((y) => y.classList.toggle('on', y === b)); });
    m.el.querySelector('[data-u]')?.addEventListener('click', () => { m.close(); openStudent(s.id, { tab: 'solicitudes' }); });
    m.el.querySelector('[data-wa]')?.addEventListener('click', () => { const reply = m.el.querySelector('[data-reply]').value; waStudent('solicitud', { student: s, extra: `${c.label.toLowerCase()} — ${reply || REQUEST_STATUS[st].label}` }); });
    m.el.querySelector('[data-ok]').onclick = async () => { await setInbox(x, { status: st, reply: m.el.querySelector('[data-reply]').value.trim().slice(0, 300) }); m.close(); toast('Solicitud actualizada'); };
  }
  $('#r-new').onclick = () => requestModal();
  draw();
  const off = store.on('*', (e) => { if (['inbox', 'students'].includes(e)) draw(); });
  return () => off();
}
