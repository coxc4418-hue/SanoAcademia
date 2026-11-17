// SanoAcademia — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a SanoAcademia! 🎓', text: 'En un minuto te mostramos cómo llevar tu academia aquí: horarios, asistencia, notas, mensualidades, cobranza por WhatsApp y el portal de cada alumno y profesor.' },
      { route: 'inicio', sel: ['[data-tour="today"]'], title: 'Las clases de hoy', text: 'Qué grupos tienen clase hoy, a qué hora y en qué aula. La que está en curso se resalta; con un toque pasas la lista.' },
      { route: 'inicio', sel: ['[data-tour="month"]'], title: 'Tu mes en 3 pasos', text: 'Generas las mensualidades, cobras y pagas a los profesores según las clases que dictaron. Aquí ves en qué paso vas.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Cómo va la academia', text: 'Lo cobrado, la deuda, alumnos activos, asistencia de los últimos 30 días y la ocupación de los cupos.' },
      { route: 'horario', sel: ['#h-grid', '#h-mobile', '#view'], title: 'Horario semanal', text: 'Todos los grupos en la semana, por aula o por profesor. El sistema avisa si un aula o un profesor queda con dos clases a la misma hora.' },
      { route: 'asistencia', sel: ['#a-body', '#view'], title: 'Pasar lista', text: 'Presente, tarde, ausente o justificado con un toque. Al guardar, avisa por WhatsApp al representante de quien faltó.' },
      { route: 'notas', sel: ['#n-sheet', '#n-body', '#view'], title: 'Notas', text: 'Plan de evaluación con porcentajes y promedio automático. Imprime la boleta y el acta del grupo.' },
      { route: 'mensualidades', sel: ['#b-body', '#view'], title: 'Mensualidades', text: 'Se generan para todos de una vez, con descuentos por hermano o beca y recargo por mora. Luego las envías por WhatsApp.' },
      { route: 'cobranza', sel: ['#c-tabs', '#view'], title: 'Cobranza', text: 'Registra pagos en dólares o bolívares a la tasa BCV, confirma los que reportan desde el portal y entrega el recibo.' },
      { route: 'alumnos', sel: ['#s-f', '#view'], title: 'Alumnos', text: 'Ficha con representante, grupos, estado de cuenta, notas y asistencia, y su enlace privado al portal. Imprime carnets e importa desde Excel.' },
      { route: 'inicio', title: '¡Listo! 🎉', text: 'Prueba ahora: pasa la lista de una clase de hoy, confirma un pago reportado en Cobranza y abre el portal de un alumno desde su ficha para verlo como él.', final: true }
    ]
  },
  clases: {
    name: 'Cursos, grupos y horarios', desc: 'Cómo armar la oferta académica', icon: 'book',
    steps: [
      { route: 'cursos', sel: ['#cg-course', '#view'], title: 'Cursos', text: 'Cada curso con su categoría, nivel, duración y mensualidad. Dentro de cada curso abres los grupos que necesites.' },
      { route: 'cursos', sel: ['#cg-body', '#view'], title: 'Grupos', text: 'Un grupo tiene profesor, aula, cupo y horario. Toca un grupo para ver su lista, inscribir alumnos, imprimir o escribirle a todo el grupo por WhatsApp.' },
      { route: 'profesores', sel: ['#t-tabs', '#view'], title: 'Profesores y su pago', text: 'Por hora, por clase, sueldo fijo o porcentaje de lo cobrado. El pago del mes se calcula con las listas de asistencia y cada profesor tiene su portal para pasar lista desde el teléfono.' },
      { route: 'certificados', sel: ['#c-batch', '#view'], title: 'Certificados', text: 'Al terminar un grupo, emite los certificados de los aprobados. Cada uno lleva un código QR que cualquiera puede escanear para verificar que es auténtico.', final: true }
    ]
  },
  portal: {
    name: 'Inscripciones y portales', desc: 'Inscripción en línea, portal del alumno y del profesor', icon: 'users',
    steps: [
      { route: 'inscripciones', sel: ['#i-share', '#view'], title: 'Inscripción en línea', text: 'Comparte este enlace o su QR en Instagram y WhatsApp: muestra tus cursos con horarios y cupos libres, y la gente se preinscribe sola.' },
      { route: 'inscripciones', sel: ['#i-list', '#view'], title: 'Preinscripciones', text: 'Llegan aquí. Contacta por WhatsApp y con un clic las conviertes en alumnos inscritos en su grupo.' },
      { route: 'comunicados', sel: ['#view'], title: 'Comunicados', text: 'Feriados, exámenes, eventos… para toda la academia, un curso o un grupo. Se ven en el portal y se envían por WhatsApp.' },
      { route: 'solicitudes', sel: ['#view'], title: 'Solicitudes y justificativos', text: 'Lo que envían los alumnos desde su portal: justificativos de inasistencia, constancias, cambios de horario. Respondes y lo ven en su teléfono.', final: true }
    ]
  }
};
let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sc_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final && videoOk ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-academia-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar SanoAcademia, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

let videoOk = null;
async function hasVideo() {
  if (videoOk != null) return videoOk;
  try { const r = await fetch(VIDEO_URL, { method: 'HEAD' }); videoOk = r.ok && /video/.test(r.headers.get('content-type') || ''); } catch (_) { videoOk = false; }
  return videoOk;
}

export async function openHelp() {
  const video = await hasVideo();
  const m = openModal({
    title: 'Ayuda', sub: video ? 'Elige un recorrido guiado o mira el video tutorial' : 'Elige un recorrido guiado', size: 'md',
    body: `<div class="stack">
      ${video ? `<button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>` : ''}
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  const vb = m.el.querySelector('[data-video]'); if (vb) vb.onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
