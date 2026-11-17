// SanoAcademia — Inscripciones en línea: enlace público de la academia y preinscripciones por atender
import { store } from '../store.js';
import { esc, emptyState, toast, openModal, setBusy, fmtDateTime, fmtDate, waLink, usd, confirmDialog } from '../utils.js';
import { icon } from '../icons.js';
import { ENROLL_STATUS, badge, ageOf } from '../academy.js';
import { ensureCatalogCode, setInbox, convertEnrollment, catalogDoc } from '../ops.js';
import { ENROLL_URL, qrDataURL } from '../shared.js';
import { groupOptions, openStudent } from '../student.js';
import { waStudent } from '../shared.js';

export function mount(el, { navigate }) {
  let filter = 'abiertas';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Inscripciones en línea</h1><p class="view-sub">Comparte tu enlace en redes y WhatsApp: los interesados ven tus cursos, horarios y cupos y se preinscriben solos.</p></div></div>
    <div class="card enroll-share" id="i-share"></div>
    <div class="chips mt-lg" id="i-chips"></div>
    <div id="i-list" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);

  async function share() {
    const on = store.settings.portal?.enroll !== false && store.settings.portal?.enabled !== false;
    if (!store.settings.catalogCode) { $('#i-share').innerHTML = `<div class="between"><div><b>${icon('link')} Tu enlace de inscripción</b><div class="t-sub">Créalo una vez y compártelo siempre.</div></div><button class="btn btn-primary" id="i-make">${icon('plus')} Crear enlace</button></div>`; $('#i-make').onclick = async () => { await ensureCatalogCode(); share(); }; return; }
    const url = ENROLL_URL();
    const qr = await qrDataURL(url, 4);
    const cat = catalogDoc();
    const text = `📚 *${store.businessName}* · ¡Inscripciones abiertas!\n\nMira nuestros cursos, horarios y cupos disponibles e inscríbete en línea:\n${url}`;
    $('#i-share').innerHTML = `<div class="enroll-share-in"><img src="${qr}" alt="" class="enroll-qr"><div class="grow" style="min-width:0">
      <b>${icon('link')} Tu enlace de inscripción ${on ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-neutral">Desactivado</span>'}</b>
      <div class="code-box mono small mt-xs" style="word-break:break-all">${esc(url)}</div>
      <div class="t-sub mt-xs">${cat.courses.length} curso(s) con ${cat.courses.reduce((a, c) => a + c.groups.length, 0)} grupo(s) visibles · ${on ? 'cualquiera puede preinscribirse' : 'actívalo en Configuración › Portales'}</div>
      <div class="row mt" style="gap:6px;flex-wrap:wrap"><a class="btn btn-whatsapp btn-sm" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('whatsapp')} Compartir</a><button class="btn btn-secondary btn-sm" id="i-copy">${icon('copy')} Copiar</button><a class="btn btn-ghost btn-sm" href="${url}" target="_blank" rel="noopener">${icon('external')} Ver página</a><button class="btn btn-ghost btn-sm" id="i-qr">${icon('download')} QR</button></div></div></div>`;
    $('#i-copy').onclick = () => navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'));
    $('#i-qr').onclick = async () => { const big = await qrDataURL(url, 10); const a = document.createElement('a'); a.href = big; a.download = 'qr-inscripcion.png'; a.click(); };
  }

  function list() {
    const all = store.inboxOf('inscripcion');
    const F = { abiertas: ['nueva', 'contactada'], procesada: ['procesada'], descartada: ['descartada'] };
    $('#i-chips').innerHTML = [['abiertas', 'Por atender'], ['procesada', 'Inscritas'], ['descartada', 'Descartadas']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l} <span class="chip-n">${all.filter((x) => F[k].includes(x.status)).length}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; list(); });
    const items = all.filter((x) => F[filter].includes(x.status));
    $('#i-list').innerHTML = items.length ? `<div class="grid-cards">${items.map((x) => { const g = store.group(x.groupId); const age = ageOf(x.birthDate); return `<div class="card rep-card">
      <div class="between"><div><b>${esc(x.name)}</b><div class="t-sub">${age != null ? `${age} años · ` : ''}${fmtDateTime(x.createdAt)}</div></div>${badge(ENROLL_STATUS, x.status)}</div>
      <div class="box mt-xs"><b>${esc(x.courseName || store.course(x.courseId)?.name || 'Curso')}</b><div class="t-sub">${esc(x.groupText || (g ? store.groupLabel(g) : 'Sin grupo elegido'))}</div>${g?.capacity ? `<div class="t-sub">${Math.max(0, g.capacity - store.roster(g.id).length)} cupo(s) libre(s)</div>` : ''}</div>
      <div class="kv kv-1 small mt-xs">${x.idDoc ? `<div><span>Documento</span><b>${esc(x.idDoc)}</b></div>` : ''}${x.phone ? `<div><span>Teléfono</span><b>${esc(x.phone)}</b></div>` : ''}${x.email ? `<div><span>Correo</span><b>${esc(x.email)}</b></div>` : ''}${x.guardianName ? `<div><span>Representante</span><b>${esc(x.guardianName)}${x.guardianPhone ? ` · ${esc(x.guardianPhone)}` : ''}</b></div>` : ''}${x.note ? `<div><span>Nota</span><b>${esc(x.note)}</b></div>` : ''}</div>
      ${x.status === 'procesada' ? `${x.studentId ? `<button class="btn btn-secondary btn-sm mt" data-st="${x.studentId}">${icon('user')} Ver ficha</button>` : ''}` : x.status === 'descartada' ? '' : `<div class="row mt" style="gap:6px;flex-wrap:wrap"><button class="btn btn-success btn-sm grow" data-ok="${x.id}">${icon('userCheck')} Inscribir</button><button class="btn btn-whatsapp btn-sm" data-wa="${x.id}">${icon('whatsapp')}</button><button class="btn btn-ghost btn-sm" data-no="${x.id}">${icon('x')}</button></div>`}
    </div>`; }).join('')}</div>`
      : `<div class="card">${emptyState('userPlus', filter === 'abiertas' ? 'Sin preinscripciones por atender' : 'Nada por aquí', 'Cuando alguien se preinscriba desde tu enlace, aparecerá aquí para que lo contactes y lo inscribas con un toque.')}</div>`;
    el.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => openStudent(b.dataset.st));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = async () => {
      const x = store.inbox.find((y) => y.id === b.dataset.wa);
      const phone = x.guardianPhone || x.phone;
      const g = store.group(x.groupId); const c = store.course(x.courseId);
      const text = `Hola ${(x.guardianName || x.name || '').split(' ')[0]} 👋, te escribimos de *${store.businessName}*. Recibimos la preinscripción de *${x.name}* en *${c?.name || x.courseName || 'el curso'}*${g ? ` (${store.groupLabel(g)})` : ''}. ¡Gracias por elegirnos!\n\n${c?.enrollFee != null || store.settings.enrollFee ? `Inscripción: ${usd(c?.enrollFee ?? store.settings.enrollFee)}\n` : ''}${c ? `Mensualidad: ${usd(g?.fee ?? c.monthlyFee)}\n` : ''}\n¿Te confirmamos el cupo?`;
      window.open(waLink(phone, text), '_blank', 'noopener');
      if (x.status === 'nueva') await setInbox(x, { status: 'contactada' });
    });
    el.querySelectorAll('[data-no]').forEach((b) => b.onclick = async () => { if (await confirmDialog({ title: 'Descartar preinscripción', message: '¿Descartarla?', confirmText: 'Descartar' })) { await setInbox(store.inbox.find((y) => y.id === b.dataset.no), { status: 'descartada' }); toast('Preinscripción descartada'); } });
    el.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => convert(store.inbox.find((y) => y.id === b.dataset.ok)));
  }

  function convert(x) {
    const m = openModal({ title: `Inscribir a ${esc(x.name)}`, size: 'sm',
      body: `<div class="stack"><div class="field"><label>Grupo</label><select class="input" data-g><option value="">— Sin grupo por ahora —</option>${groupOptions(x.groupId)}</select></div>
        <label class="check"><input type="checkbox" data-c checked> Cobrar la inscripción</label><div class="error-msg" data-err></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success" data-ok>${icon('check')} Inscribir</button>` });
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true, 'Inscribiendo…');
      try {
        const s = await convertEnrollment(x, { groupId: m.el.querySelector('[data-g]').value, chargeEnroll: m.el.querySelector('[data-c]').checked });
        m.close(); toast(`${s.name} quedó inscrito`);
        if (await confirmDialog({ title: '¡Inscrito!', message: '¿Enviarle la bienvenida con su horario y su portal por WhatsApp?', confirmText: 'Enviar bienvenida', cancelText: 'Ahora no' })) waStudent('bienvenida', { student: store.student(s.id) || s });
      } catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  }

  share(); list();
  const off = store.on('*', (e) => { if (e === 'inbox' || e === 'students') list(); if (['settings', 'courses', 'groups'].includes(e)) share(); });
  return () => off();
}
