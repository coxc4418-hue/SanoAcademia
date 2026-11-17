// SanoAcademia — Inscripción en línea: /inscripcion/CODIGO (catálogo público de cursos y preinscripción)
import { getCatalog } from '../store.js';
import { db, doc, collection, setDoc } from '../firebase.js';
import { esc, applyLocale, usd, setFx, bs, fx, nowISO, waLink, fmtDate, loc } from '../utils.js';
import { icon } from '../icons.js';
import { catOf } from '../academy.js';

export async function mount(root) {
  document.title = 'Inscripciones · SanoAcademia';
  const code = (/\/inscripcion\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="portal-page"><div class="empty"><div class="spinner"></div></div></div>';
  let C = null;
  try { C = code ? await getCatalog(code) : null; } catch (e) { console.error(e); }
  if (!C || C.active === false) {
    root.innerHTML = `<div class="portal-page"><div class="card portal-err"><img src="/assets/logo.svg" alt="" width="64"><h1>${C ? 'Inscripciones cerradas' : 'Página no encontrada'}</h1><p>${C ? `${esc(C.academy)} no está recibiendo inscripciones en línea en este momento.${C.phone ? ' Escríbeles por WhatsApp.' : ''}` : 'El enlace no existe o cambió. Pídelo a la academia.'}</p>${C?.phone ? `<a class="btn btn-whatsapp" href="${waLink(C.phone, 'Hola, quiero información sobre los cursos.')}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>` : ''}</div></div>`;
    return;
  }
  try { applyLocale(C.country || 'VE', C.currency || null); } catch (_) {}
  if (C.rate > 0) setFx({ enabled: true, rate: C.rate, sym: C.fxSym || 'Bs' });
  document.title = `Inscripciones · ${C.academy}`;
  let cat = '';
  const both = (n) => `${usd(n)}${fx() ? ` <small>≈ ${bs(n)}</small>` : ''}`;
  const cats = [...new Set(C.courses.map((c) => c.category))];

  function list() {
    const courses = C.courses.filter((c) => !cat || c.category === cat);
    root.innerHTML = `<div class="portal-page enroll-page">
      <header class="portal-hero ok enroll-hero">
        <div class="portal-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(C.academy)}</b><small>${esc(C.slogan || 'Inscripciones abiertas')}</small></div>${C.phone ? `<a class="btn btn-ghost btn-sm portal-wa" href="${waLink(C.phone, 'Hola, quiero información sobre los cursos.')}" target="_blank" rel="noopener">${icon('whatsapp')}</a>` : ''}</div>
        <h1 class="enroll-title">Elige tu curso y apártalo en línea</h1>
        <p class="enroll-sub">${C.courses.length} curso(s) disponibles${C.address ? ` · ${icon('pin')} ${esc(C.address)}` : ''}</p>
      </header>
      ${cats.length > 1 ? `<nav class="chips enroll-cats"><button class="chip ${!cat ? 'on' : ''}" data-c="">Todos</button>${cats.map((k) => `<button class="chip ${cat === k ? 'on' : ''}" data-c="${k}">${icon(catOf(k).icon)} ${esc(catOf(k).label)}</button>`).join('')}</nav>` : ''}
      <main class="portal-body">${courses.map((c) => `<div class="card enroll-course" style="--gc:${c.color}">
        <div class="row" style="gap:10px;flex-wrap:nowrap"><span class="kpi-icon">${icon(catOf(c.category).icon)}</span><div class="grow" style="min-width:0"><b class="enroll-cname">${esc(c.name)}</b><div class="t-sub">${esc(catOf(c.category).label)}${c.level ? ` · ${esc(c.level)}` : ''}${c.months ? ` · ${c.months} meses` : ''}${c.hours ? ` · ${c.hours} h` : ''}</div></div></div>
        ${c.description ? `<p class="small" style="margin:10px 0 0">${esc(c.description)}</p>` : ''}
        <div class="enroll-prices"><div><small>Mensualidad</small><b>${both(c.monthlyFee)}</b></div>${c.enrollFee ? `<div><small>Inscripción</small><b>${both(c.enrollFee)}</b></div>` : ''}</div>
        <div class="stack-sm mt">${c.groups.map((g) => `<button class="enroll-group ${g.seats === 0 ? 'is-full' : ''}" data-g="${g.id}" data-co="${c.id}" ${g.seats === 0 ? 'disabled' : ''}><div class="grow"><b>${esc(g.name || 'Grupo')}</b><div class="t-sub">${icon('clock')} ${esc(g.text)}${g.teacher ? ` · Prof. ${esc(g.teacher)}` : ''}${g.start ? ` · inicia ${fmtDate(g.start)}` : ''}</div>${g.fee !== c.monthlyFee ? `<div class="t-sub">Mensualidad ${usd(g.fee)}</div>` : ''}</div><span class="badge badge-${g.seats === 0 ? 'neutral' : g.seats != null && g.seats <= 3 ? 'warning' : 'success'}">${g.seats === 0 ? 'Lleno' : g.seats != null ? `${g.seats} cupo(s)` : 'Disponible'}</span></button>`).join('')}</div></div>`).join('') || '<div class="card center"><p class="muted">No hay cursos en esta categoría.</p></div>'}</main>
      <p class="portal-by">Inscripción en línea · Hecho con <b>SanoAcademia</b></p></div>`;
    root.querySelectorAll('[data-c]').forEach((x) => x.onclick = () => { cat = x.dataset.c; list(); });
    root.querySelectorAll('[data-g]').forEach((x) => x.onclick = () => form(C.courses.find((c) => c.id === x.dataset.co), x.dataset.g));
  }

  function form(c, gid) {
    const g = c.groups.find((x) => x.id === gid);
    root.innerHTML = `<div class="portal-page enroll-page"><header class="portal-hero ok enroll-hero"><div class="portal-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(C.academy)}</b><small>Preinscripción</small></div></div>
        <h1 class="enroll-title">${esc(c.name)}</h1><p class="enroll-sub">${esc(g.name || 'Grupo')} · ${esc(g.text)}</p></header>
      <main class="portal-body"><form class="card stack" id="f-en">
        <button type="button" class="btn btn-ghost btn-sm" id="en-back" style="align-self:flex-start">${icon('arrowLeft')} Ver otros cursos</button>
        <div class="field"><label>Nombre completo del alumno *</label><input class="input" name="name" required maxlength="80" autocomplete="name"></div>
        <div class="form-grid"><div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc" maxlength="20"></div><div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" max="${new Date().toISOString().slice(0, 10)}"></div>
          <div class="field"><label>Teléfono (WhatsApp) *</label><input class="input" name="phone" inputmode="tel" maxlength="20" autocomplete="tel"></div><div class="field"><label>Correo</label><input class="input" name="email" type="email" maxlength="80" autocomplete="email"></div></div>
        <div class="box box-white stack-sm" id="en-minor" hidden><b>${icon('user')} Datos del representante</b><div class="form-grid"><div class="field"><label>Nombre del representante *</label><input class="input" name="guardianName" maxlength="80"></div><div class="field"><label>Teléfono del representante *</label><input class="input" name="guardianPhone" inputmode="tel" maxlength="20"></div></div></div>
        <div class="field"><label>Comentario (opcional)</label><input class="input" name="note" maxlength="200" placeholder="Ej.: tiene conocimientos básicos"></div>
        <div class="box small">${icon('info')} Mensualidad <b>${usd(g.fee)}</b>${c.enrollFee ? ` · Inscripción <b>${usd(c.enrollFee)}</b>` : ''}. La academia te contactará para confirmar el cupo y el pago.</div>
        <div class="error-msg" data-err></div>
        <button class="btn btn-primary btn-lg">${icon('send')} Enviar preinscripción</button></form></main></div>`;
    window.scrollTo(0, 0);
    const f = root.querySelector('#f-en'); const F = f.elements;
    root.querySelector('#en-back').onclick = () => list();
    const age = () => { if (!F.birthDate.value) return null; const b = new Date(F.birthDate.value + 'T12:00:00'); const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
    F.birthDate.onchange = () => { root.querySelector('#en-minor').hidden = !(age() != null && age() < 18); };
    f.onsubmit = async (e) => {
      e.preventDefault(); const err = f.querySelector('[data-err]'); err.textContent = '';
      const minor = age() != null && age() < 18;
      if (F.name.value.trim().length < 3) { err.textContent = 'Escribe el nombre completo.'; return; }
      if (!minor && F.phone.value.replace(/\D/g, '').length < 7) { err.textContent = 'Escribe un teléfono de contacto.'; return; }
      if (minor && (F.guardianName.value.trim().length < 3 || F.guardianPhone.value.replace(/\D/g, '').length < 7)) { err.textContent = 'Para menores de edad, escribe los datos del representante.'; return; }
      const btn = f.querySelector('button.btn-primary'); btn.disabled = true;
      try {
        await setDoc(doc(collection(db, 'inbox')), { tenantId: C.tenantId, code, type: 'inscripcion', status: 'nueva', createdAt: nowISO(), courseId: c.id, courseName: c.name.slice(0, 80), groupId: g.id, groupText: `${g.name ? g.name + ' · ' : ''}${g.text}`.slice(0, 120), name: F.name.value.trim().slice(0, 80), idDoc: F.idDoc.value.trim().slice(0, 20), birthDate: F.birthDate.value || '', phone: F.phone.value.trim().slice(0, 20), email: F.email.value.trim().slice(0, 80), guardianName: minor ? F.guardianName.value.trim().slice(0, 80) : '', guardianPhone: minor ? F.guardianPhone.value.trim().slice(0, 20) : '', note: F.note.value.trim().slice(0, 200) });
        root.querySelector('.portal-body').innerHTML = `<div class="card center portal-done"><span class="kpi-icon tone-success">${icon('checkCircle')}</span><h2>¡Preinscripción enviada!</h2><p class="muted">${esc(C.academy)} te contactará pronto para confirmar el cupo de <b>${esc(F.name.value.trim())}</b> en <b>${esc(c.name)}</b>.</p>${C.phone ? `<a class="btn btn-whatsapp" href="${waLink(C.phone, `Hola, acabo de preinscribir a ${F.name.value.trim()} en ${c.name} (${g.text}).`)}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir a la academia</a>` : ''}<button class="btn btn-ghost mt" id="en-more">${icon('plus')} Inscribir a otra persona</button></div>`;
        root.querySelector('#en-more').onclick = () => list();
      } catch (ex) { console.error(ex); err.textContent = 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.'; btn.disabled = false; }
    };
  }
  list();
}
