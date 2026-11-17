// SanoAcademia — Comunicados a alumnos y representantes (portal + WhatsApp)
import { store } from '../store.js';
import { esc, emptyState, toast, openModal, todayKey, fmtDate, confirmDialog } from '../utils.js';
import { icon } from '../icons.js';
import { studentAvatar } from '../student.js';
import { NOTICE_KINDS } from '../academy.js';
import { saveNotice, deleteNotice, noticeAudience, targetName } from '../ops.js';
import { waStudent, printDoc } from '../shared.js';

const TEMPLATES = [
  { kind: 'feriado', title: 'No habrá clases', body: 'Les informamos que el día [fecha] no habrá clases por [motivo]. Las clases se reanudan el [fecha]. ¡Disfruten el descanso!' },
  { kind: 'examen', title: 'Semana de evaluaciones', body: 'Del [fecha] al [fecha] tendremos las evaluaciones del período. Revisa en tu portal el plan de evaluación y repasa los temas vistos. ¡Mucho éxito!' },
  { kind: 'evento', title: 'Recital / presentación de fin de curso', body: 'Los invitamos a la presentación de fin de curso el [fecha] a las [hora] en [lugar]. Cada alumno puede traer [n] invitados. ¡Los esperamos!' },
  { kind: 'cobranza', title: 'Mensualidad del mes disponible', body: 'Ya está disponible la mensualidad del mes. Puedes ver el detalle y reportar tu pago desde el portal del alumno. ¡Gracias por pagar a tiempo!' },
  { kind: 'aviso', title: 'Inscripciones abiertas', body: 'Ya están abiertas las inscripciones para el nuevo período. Cupos limitados. Inscríbete desde nuestro enlace en línea o en la recepción de la academia.' },
  { kind: 'urgente', title: 'Cambio de aula', body: 'A partir de [fecha] la clase de [curso] será en [aula]. Por favor tomen nota.' }
];

export function targetOptions(sel = '') {
  return `<option value="" ${!sel ? 'selected' : ''}>Toda la academia</option>
    <optgroup label="Un curso">${store.liveCourses.map((c) => `<option value="c:${c.id}" ${sel === 'c:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>
    <optgroup label="Un grupo">${store.liveGroups.map((g) => `<option value="g:${g.id}" ${sel === 'g:' + g.id ? 'selected' : ''}>${esc(store.groupLabel(g))}</option>`).join('')}</optgroup>`;
}

export function mount(el, { params }) {
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Comunicados</h1><p class="view-sub">Publícalos en el portal de cada alumno (toda la academia, un curso o un grupo) y envíalos por WhatsApp.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="n-new">${icon('plus')} Nuevo comunicado</button></div></div>
    <div id="n-list"></div>`;
  const $ = (s) => el.querySelector(s);
  function draw() {
    const list = store.notices;
    $('#n-list').innerHTML = list.length ? `<div class="grid-cards">${list.map((n) => { const k = NOTICE_KINDS[n.kind] || NOTICE_KINDS.aviso; const expired = n.until && n.until < todayKey(); return `<div class="card notice-card ${expired ? 'is-void' : ''}">
        <div class="between"><span class="badge badge-${k.tone}">${icon(k.icon)} ${k.label}</span>${n.pinned ? `<span class="t-sub">${icon('pin')} Fijado</span>` : ''}</div>
        <h3 class="notice-title">${esc(n.title)}</h3>
        <p class="notice-body">${esc(n.body).replace(/\n/g, '<br>')}</p>
        <div class="t-sub">${fmtDate(n.date)} · ${esc(targetName(n.target))} · ${noticeAudience(n.target).length} alumno(s)${n.until ? ` · visible hasta ${fmtDate(n.until)}` : ''}</div>
        <div class="row mt" style="gap:6px"><button class="btn btn-whatsapp btn-sm" data-wa="${n.id}">${icon('whatsapp')} Enviar</button><button class="btn btn-ghost btn-sm" data-pr="${n.id}">${icon('print')}</button><button class="btn btn-ghost btn-sm" data-ed="${n.id}">${icon('edit')}</button><button class="btn btn-ghost btn-sm" data-del="${n.id}">${icon('trash')}</button></div></div>`; }).join('')}</div>`
      : `<div class="card">${emptyState('megaphone', 'Sin comunicados', 'Días sin clases, evaluaciones, recitales, inscripciones… Aparecen en el portal de cada alumno.')}</div>`;
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => form(store.notices.find((n) => n.id === b.dataset.ed)));
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (await confirmDialog({ title: 'Borrar comunicado', message: 'Se quitará también del portal.', confirmText: 'Borrar', danger: true })) { await deleteNotice(store.notices.find((n) => n.id === b.dataset.del)); toast('Comunicado borrado'); } });
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { const n = store.notices.find((x) => x.id === b.dataset.pr); printDoc(n.title, `<p style="font-size:14px;line-height:1.7;margin-top:20px">${esc(n.body).replace(/\n/g, '<br>')}</p><p class="muted">${fmtDate(n.date)} · ${esc(targetName(n.target))} · La dirección</p>`); });
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => sendModal(store.notices.find((n) => n.id === b.dataset.wa)));
  }
  function sendModal(n) {
    const list = noticeAudience(n.target);
    const m = openModal({
      title: 'Enviar comunicado', size: 'md', sub: 'Envíalo a un grupo de WhatsApp o a cada alumno (al representante si es menor) con su enlace al portal.',
      body: `<button class="btn btn-whatsapp btn-block" data-group>${icon('users')} Enviar a un grupo de WhatsApp</button>
        <div class="section-title mt">O a cada alumno (${list.length})</div>
        ${list.length ? `<div class="list" style="max-height:45vh;overflow:auto">${list.map((s) => `<div class="list-item">${studentAvatar(s)}<div class="grow"><b>${esc(s.name)}</b><div class="t-sub">${esc(s.code || '')}</div></div><button class="btn btn-whatsapp btn-sm" data-s="${s.id}">${icon('whatsapp')}</button></div>`).join('')}</div>` : emptyState('users', 'Sin alumnos')}`
    });
    m.el.querySelector('[data-group]').onclick = () => waStudent('comunicado', { student: {}, notice: n });
    m.el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { waStudent('comunicado', { student: store.student(b.dataset.s), notice: n }); b.classList.replace('btn-whatsapp', 'btn-secondary'); b.innerHTML = icon('check'); });
  }
  function form(n = null) {
    let kind = n?.kind || 'aviso';
    const m = openModal({
      title: n ? 'Editar comunicado' : 'Nuevo comunicado', size: 'lg',
      body: `<form class="stack" data-f>
        ${n ? '' : `<div class="field"><label>Plantillas rápidas</label><div class="chips chips-wrap">${TEMPLATES.map((t, i) => `<button type="button" class="chip" data-tp="${i}">${esc(t.title)}</button>`).join('')}</div></div>`}
        <div class="field"><label>Tipo</label><div class="chips chips-wrap">${Object.entries(NOTICE_KINDS).map(([k, v]) => `<button type="button" class="chip ${kind === k ? 'on' : ''}" data-k="${k}">${icon(v.icon)} ${v.label}</button>`).join('')}</div></div>
        <div class="field"><label>Título</label><input class="input" name="title" value="${esc(n?.title || '')}" autofocus></div>
        <div class="field"><label>Mensaje</label><textarea class="input textarea" name="body" rows="6">${esc(n?.body || '')}</textarea></div>
        <div class="form-grid-3">
          <div class="field"><label>Para</label><select class="input select" name="target">${targetOptions(n?.target || params?.target || '')}</select></div>
          <div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${n?.date || todayKey()}"></div>
          <div class="field"><label>Visible hasta (opcional)</label><input class="input" type="date" name="until" value="${n?.until || ''}"></div>
        </div>
        <label class="check"><input type="checkbox" name="pinned" ${n?.pinned ? 'checked' : ''}> <span>Fijar arriba en el portal</span></label>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('megaphone')} Publicar</button>`
    });
    const F = m.el.querySelector('[data-f]').elements;
    const setK = (k) => { kind = k; m.el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x.dataset.k === k)); };
    m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => setK(b.dataset.k));
    m.el.querySelectorAll('[data-tp]').forEach((b) => b.onclick = () => { const t = TEMPLATES[b.dataset.tp]; F.title.value = t.title; F.body.value = t.body; setK(t.kind); });
    const go = async (e) => {
      e?.preventDefault();
      try {
        const saved = await saveNotice({ title: F.title.value, body: F.body.value, kind, target: F.target.value, date: F.date.value, until: F.until.value, pinned: F.pinned.checked }, n?.id || null);
        m.close(); toast('Comunicado publicado en el portal');
        if (!n) sendModal(saved);
      } catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; }
    };
    m.el.querySelector('[data-f]').onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  }
  $('#n-new').onclick = () => form();
  draw();
  if (params?.new) setTimeout(() => form(), 50);
  const off = store.on('*', (e) => { if (['notices', 'students', 'groups'].includes(e)) draw(); });
  return () => off();
}
