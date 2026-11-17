// SanoAcademia — Reglas de la academia: catálogos, horarios, mensualidades, notas, asistencia y morosidad
import { round2, todayKey, fromKey, dayKey, addDays } from './utils.js';

// ---------- Catálogos ----------
export const COURSE_CATS = {
  idiomas: { label: 'Idiomas', icon: 'globe', color: '#4f46e5' },
  musica: { label: 'Música', icon: 'mic', color: '#db2777' },
  danza: { label: 'Danza y baile', icon: 'run', color: '#ea580c' },
  arte: { label: 'Arte y dibujo', icon: 'image', color: '#ca8a04' },
  computacion: { label: 'Computación', icon: 'laptop', color: '#0891b2' },
  programacion: { label: 'Programación y robótica', icon: 'cpu', color: '#7c3aed' },
  tutorias: { label: 'Tutorías y reforzamiento', icon: 'clipboard', color: '#16a34a' },
  preu: { label: 'Preuniversitario', icon: 'target', color: '#dc2626' },
  deportes: { label: 'Deportes', icon: 'trophy', color: '#0d9488' },
  cocina: { label: 'Cocina y repostería', icon: 'chef', color: '#b45309' },
  belleza: { label: 'Belleza y estética', icon: 'scissors', color: '#c026d3' },
  oficios: { label: 'Oficios y talleres', icon: 'wrench', color: '#475569' },
  otros: { label: 'Otros cursos', icon: 'tag', color: '#64748b' }
};
export const catOf = (k) => COURSE_CATS[k] || COURSE_CATS.otros;
export const LEVELS = ['Niños', 'Juvenil', 'Adultos', 'Básico', 'Intermedio', 'Avanzado', 'Todos los niveles'];
export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export const STUDENT_STATUS = {
  activo: { label: 'Activo', tone: 'success' },
  pausado: { label: 'En pausa', tone: 'warning' },
  retirado: { label: 'Retirado', tone: 'neutral' },
  egresado: { label: 'Egresado', tone: 'violet' }
};
export const GROUP_STATUS = {
  abierto: { label: 'Inscripciones abiertas', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'success' },
  finalizado: { label: 'Finalizado', tone: 'neutral' }
};
export const ATT = {
  P: { label: 'Presente', short: 'P', tone: 'success', icon: 'check' },
  T: { label: 'Tarde', short: 'T', tone: 'warning', icon: 'clock' },
  A: { label: 'Ausente', short: 'A', tone: 'danger', icon: 'x' },
  J: { label: 'Justificado', short: 'J', tone: 'info', icon: 'file' }
};
export const PAY_MODES = {
  hora: { label: 'Por hora dictada', unit: 'hora' },
  clase: { label: 'Por clase dictada', unit: 'clase' },
  fijo: { label: 'Sueldo fijo mensual', unit: 'mes' },
  pct: { label: '% de las mensualidades de sus grupos', unit: '%' }
};
export const REQUEST_CATS = {
  justificativo: { label: 'Justificar inasistencia', icon: 'file' },
  consulta: { label: 'Consulta académica', icon: 'info' },
  horario: { label: 'Cambio de horario o grupo', icon: 'calendar' },
  pago: { label: 'Pagos y mensualidades', icon: 'wallet' },
  constancia: { label: 'Constancia o certificado', icon: 'medal' },
  sugerencia: { label: 'Sugerencia', icon: 'star' },
  otro: { label: 'Otro', icon: 'inbox' }
};
export const REQUEST_STATUS = {
  nueva: { label: 'Nueva', tone: 'info' },
  en_proceso: { label: 'En proceso', tone: 'warning' },
  resuelta: { label: 'Resuelta', tone: 'success' },
  descartada: { label: 'Descartada', tone: 'neutral' }
};
export const ENROLL_STATUS = {
  nueva: { label: 'Por atender', tone: 'info' },
  contactada: { label: 'Contactada', tone: 'warning' },
  procesada: { label: 'Inscrita', tone: 'success' },
  descartada: { label: 'Descartada', tone: 'neutral' }
};
export const NOTICE_KINDS = {
  aviso: { label: 'Aviso', tone: 'info', icon: 'bell' },
  evento: { label: 'Evento', tone: 'violet', icon: 'star' },
  examen: { label: 'Evaluación', tone: 'warning', icon: 'clipboard' },
  feriado: { label: 'Sin clases', tone: 'neutral', icon: 'calendar' },
  cobranza: { label: 'Pagos', tone: 'brand', icon: 'wallet' },
  urgente: { label: 'Urgente', tone: 'danger', icon: 'alert' }
};
export const EXPENSE_CATEGORIES = [
  { id: 'alquiler', name: 'Alquiler del local', icon: 'home' },
  { id: 'servicios', name: 'Luz, agua e internet', icon: 'zap' },
  { id: 'materiales', name: 'Materiales didácticos', icon: 'clipboard' },
  { id: 'equipos', name: 'Equipos e instrumentos', icon: 'laptop' },
  { id: 'publicidad', name: 'Publicidad y redes', icon: 'megaphone' },
  { id: 'nomina', name: 'Personal administrativo', icon: 'users' },
  { id: 'mantenimiento', name: 'Mantenimiento y limpieza', icon: 'wrench' },
  { id: 'impuestos', name: 'Impuestos y permisos', icon: 'receipt' },
  { id: 'bancarios', name: 'Gastos bancarios', icon: 'card' },
  { id: 'otros', name: 'Otros gastos', icon: 'tag' }
];
export const expCat = (id, list = EXPENSE_CATEGORIES) => list.find((c) => c.id === id) || { id, name: id || 'Otros', icon: 'tag' };
export const CHARGE_KINDS = {
  inscripcion: 'Inscripción', materiales: 'Materiales', uniforme: 'Uniforme / franela', examen: 'Examen o evaluación especial',
  certificado: 'Certificado', evento: 'Evento / recital', mora: 'Recargo por mora', otro: 'Otro'
};
export const PAY_STATUS = {
  confirmado: { label: 'Confirmado', tone: 'success' },
  pendiente: { label: 'Por confirmar', tone: 'warning' },
  rechazado: { label: 'Rechazado', tone: 'neutral' },
  anulado: { label: 'Anulado', tone: 'neutral' }
};
export const ROOMS_DEFAULT = [
  { id: 'aula1', name: 'Aula 1', capacity: 15 },
  { id: 'aula2', name: 'Aula 2', capacity: 15 },
  { id: 'lab', name: 'Laboratorio de computación', capacity: 12 },
  { id: 'salon', name: 'Salón de música y danza', capacity: 20 }
];
export const badge = (map, k) => { const s = map[k] || { label: k, tone: 'neutral' }; return `<span class="badge badge-${s.tone}"><i class="dotc"></i>${s.label}</span>`; };

// ---------- Períodos (YYYY-MM) ----------
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodOf = (d = new Date()) => dayKey(d).slice(0, 7);
export const currentPeriod = () => periodOf(new Date());
export function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function periodName(period, short = false) {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  const n = MONTHS[m - 1] || '';
  return short ? `${n.slice(0, 3)} ${String(y).slice(2)}` : `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`;
}
export const lastPeriods = (n, from = currentPeriod()) => Array.from({ length: n }, (_, i) => addMonths(from, -i));
export const monthDays = (period) => { const [y, m] = period.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// ---------- Horarios ----------
export const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export function fmtHour(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 || 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${ap}`;
}
export const slotHours = (s) => Math.max(0, (toMin(s.to) - toMin(s.from)) / 60);
/** "Lun y Mié · 4 p.m. a 6 p.m." (agrupa los días con la misma hora) */
export function scheduleText(g, { short = true } = {}) {
  const sl = (g?.schedule || []).slice().sort((a, b) => (WEEK.indexOf(a.day) - WEEK.indexOf(b.day)) || toMin(a.from) - toMin(b.from));
  if (!sl.length) return 'Sin horario';
  const by = {};
  for (const s of sl) (by[`${s.from}-${s.to}`] ||= []).push(s.day);
  return Object.entries(by).map(([k, days]) => {
    const [f, t] = k.split('-');
    const names = days.map((d) => (short ? DAYS_SHORT : DAYS)[d]);
    const dTxt = names.length > 1 ? names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1] : names[0];
    return `${dTxt} · ${fmtHour(f)} a ${fmtHour(t)}`;
  }).join(' | ');
}
/** Clases de un grupo en un día de la semana */
export const slotsOn = (g, dow) => (g?.schedule || []).filter((s) => Number(s.day) === dow);
export const weeklyHours = (g) => (g?.schedule || []).reduce((a, s) => a + slotHours(s), 0);
/** Fechas (YYYY-MM-DD) en que el grupo tiene clase entre dos fechas */
export function classDates(g, from, to) {
  const out = [];
  const days = new Set((g?.schedule || []).map((s) => Number(s.day)));
  if (!days.size) return out;
  for (let d = fromKey(from); d <= fromKey(to); d = addDays(d, 1)) {
    const k = dayKey(d);
    if (days.has(d.getDay()) && (!g.startDate || k >= g.startDate) && (!g.endDate || k <= g.endDate)) out.push(k);
  }
  return out;
}
/** ¿Chocan dos bloques de horario? */
export const overlaps = (a, b) => Number(a.day) === Number(b.day) && toMin(a.from) < toMin(b.to) && toMin(b.from) < toMin(a.to);

// ---------- Alumnos ----------
export const fullName = (s) => String(s?.name || '').trim() || 'Sin nombre';
export const firstName = (s) => String(s?.name || '').trim().split(/\s+/)[0] || '';
export function ageOf(birth, at = new Date()) {
  if (!birth) return null;
  const b = fromKey(birth);
  let a = at.getFullYear() - b.getFullYear();
  if (at.getMonth() < b.getMonth() || (at.getMonth() === b.getMonth() && at.getDate() < b.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
export const isMinor = (s) => { const a = ageOf(s?.birthDate); return a != null && a < 18; };
/** Teléfono a quien se escribe: representante si es menor o si lo tiene; si no, el alumno */
export const contactPhone = (s) => (isMinor(s) && s.guardianPhone) ? s.guardianPhone : (s?.phone || s?.guardianPhone || '');
export const contactName = (s) => (isMinor(s) && s.guardianName) ? s.guardianName : (s?.name || s?.guardianName || '');
/** Deuda (positivo = debe; negativo = saldo a favor) */
export const studentBalance = (s) => round2((Number(s?.billed) || 0) - (Number(s?.paid) || 0));
/** Estado de cada cargo del libro: los pagos se aplican del más viejo al más nuevo */
export function ledgerStatus(s) {
  const paid = Number(s?.paid) || 0;
  return (s?.ledger || []).map((x) => {
    const covered = Math.max(0, Math.min(Number(x.t) || 0, paid - (Number(x.c) || 0)));
    const rest = round2((Number(x.t) || 0) - covered);
    return { ...x, covered: round2(covered), rest, status: rest <= 0.009 ? 'pagado' : covered > 0.009 ? 'parcial' : 'pendiente' };
  });
}
export const openCharges = (s) => ledgerStatus(s).filter((x) => x.rest > 0.009);
export const monthsOwed = (s) => openCharges(s).filter((x) => x.k === 'mes').length;
export const overdueCharges = (s, today = todayKey()) => openCharges(s).filter((x) => x.d && x.d < today);
export function debtTone(s) {
  if (studentBalance(s) <= 0.009) return 'success';
  const m = monthsOwed(s);
  if (m >= 3) return 'danger';
  if (m >= 2 || overdueCharges(s).length) return 'warning';
  return 'info';
}
export function debtLabel(s) {
  const b = studentBalance(s);
  if (b < -0.009) return 'Saldo a favor';
  if (b <= 0.009) return 'Al día';
  const m = monthsOwed(s);
  return m >= 2 ? `Debe ${m} meses` : overdueCharges(s).length ? 'Vencido' : 'Por pagar';
}
export const isSolvent = (s) => studentBalance(s) <= 0.009;

// ---------- Mensualidades ----------
/** Monto mensual de un grupo (el del grupo o el del curso) */
export const groupFee = (g, course) => round2(g?.fee != null && g.fee !== '' ? Number(g.fee) : Number(course?.monthlyFee) || 0);

/**
 * Calcula las mensualidades de un período.
 * input: { students, groups, courses, settings, period }
 * Devuelve { summary, rows: [{ student, items: [{ concept, amount, kind, groupId }], total }] }
 */
export function computeMonthly({ students, groups, courses, settings, period }) {
  const gMap = new Map(groups.map((g) => [g.id, g]));
  const cMap = new Map(courses.map((c) => [c.id, c]));
  const sib = Number(settings.siblingPct) || 0;
  const late = settings.lateFee || {};
  // Hermanos: mismo teléfono del representante (el primero inscrito paga completo)
  const fam = {};
  if (sib > 0) for (const s of students.filter((x) => x.status === 'activo' && x.guardianPhone)) {
    const k = String(s.guardianPhone).replace(/\D/g, '').slice(-10);
    if (k.length >= 7) (fam[k] ||= []).push(s);
  }
  const sibSet = new Set();
  for (const list of Object.values(fam)) if (list.length > 1) list.sort((a, b) => (a.enrolledAt || a.createdAt || '').localeCompare(b.enrolledAt || b.createdAt || '')).slice(1).forEach((s) => sibSet.add(s.id));

  const rows = [];
  for (const s of students) {
    if (s.status !== 'activo') continue;
    if (s.enrolledAt && s.enrolledAt.slice(0, 7) > period) continue;
    const items = [];
    for (const gid of s.groupIds || []) {
      const g = gMap.get(gid);
      if (!g || g.status === 'finalizado') continue;
      if (g.startDate && g.startDate.slice(0, 7) > period) continue;
      if (g.endDate && g.endDate.slice(0, 7) < period) continue;
      const c = cMap.get(g.courseId);
      const fee = groupFee(g, c);
      if (fee > 0) items.push({ concept: `Mensualidad ${periodName(period)} · ${c?.name || 'Curso'}${g.name ? ` (${g.name})` : ''}`, amount: fee, kind: 'mensualidad', groupId: g.id });
    }
    const base = round2(items.reduce((a, i) => a + i.amount, 0));
    const disc = Math.min(100, Number(s.discountPct) || 0);
    if (base > 0 && disc > 0) items.push({ concept: `${s.discountReason || 'Beca / descuento'} (${disc}%)`, amount: -round2(base * disc / 100), kind: 'descuento' });
    else if (base > 0 && sibSet.has(s.id)) items.push({ concept: `Descuento por hermanos (${sib}%)`, amount: -round2(base * sib / 100), kind: 'descuento' });
    if (late.enabled && Number(late.value) > 0) {
      const overdue = overdueCharges(s).reduce((a, x) => a + x.rest, 0);
      if (overdue > 0.009) {
        const amt = late.mode === 'pct' ? round2(overdue * Number(late.value) / 100) : round2(Number(late.value));
        items.push({ concept: late.mode === 'pct' ? `Recargo por mora (${late.value}% de lo vencido)` : 'Recargo por pago tardío', amount: amt, kind: 'mora' });
      }
    }
    const total = round2(items.reduce((a, i) => a + i.amount, 0));
    if (total > 0.009) rows.push({ student: s, items, total });
  }
  const sum = (k) => round2(rows.reduce((a, r) => a + r.items.filter((i) => i.kind === k).reduce((x, i) => x + i.amount, 0), 0));
  return {
    summary: { students: rows.length, gross: sum('mensualidad'), discounts: -sum('descuento'), mora: sum('mora'), totalBilled: round2(rows.reduce((a, r) => a + r.total, 0)), siblings: sibSet.size },
    rows
  };
}

/** Fecha de vencimiento de la mensualidad de un período (día fijo del mes) */
export function dueDateFor(settings, period) {
  const day = Math.min(28, Math.max(1, Number(settings.dueDay) || 5));
  return `${period}-${String(day).padStart(2, '0')}`;
}
export const daysTo = (key) => (key ? Math.round((fromKey(key) - fromKey(todayKey())) / 864e5) : null);

// ---------- Notas ----------
export const GRADE_SCALES = {
  20: { max: 20, pass: 10, label: 'Del 1 al 20 (aprueba con 10)' },
  10: { max: 10, pass: 6, label: 'Del 1 al 10 (aprueba con 6)' },
  100: { max: 100, pass: 60, label: 'Del 0 al 100 (aprueba con 60)' },
  5: { max: 5, pass: 3, label: 'Del 1 al 5 (aprueba con 3)' }
};
export const scaleOf = (settings) => ({ ...(GRADE_SCALES[settings?.grades?.max] || GRADE_SCALES[20]), ...(settings?.grades || {}) });
/** Promedio ponderado de un alumno en un grupo (solo evaluaciones con nota) */
export function studentAverage(group, scores, studentId) {
  let w = 0, acc = 0;
  for (const ev of group?.evals || []) {
    const v = scores?.[ev.id]?.[studentId];
    if (v == null || v === '' || isNaN(Number(v))) continue;
    const ww = Number(ev.weight) || 0;
    w += ww; acc += Number(v) * ww;
  }
  return w > 0 ? Math.round(acc / w * 100) / 100 : null;
}
export const weightTotal = (g) => (g?.evals || []).reduce((a, e) => a + (Number(e.weight) || 0), 0);

// ---------- Asistencia ----------
/** Resumen de asistencia de un alumno a partir de las listas pasadas */
export function attendanceOf(studentId, sheets) {
  const r = { P: 0, T: 0, A: 0, J: 0, total: 0, pct: null, last: [] };
  for (const sh of sheets) {
    const m = sh.marks?.[studentId];
    if (!m) continue;
    r[m] = (r[m] || 0) + 1; r.total++;
  }
  r.pct = r.total ? Math.round((r.P + r.T + r.J) / r.total * 100) : null;
  return r;
}
export function sheetStats(sh) {
  const v = Object.values(sh?.marks || {});
  const n = v.length;
  const present = v.filter((x) => x === 'P' || x === 'T').length;
  return { n, present, absent: v.filter((x) => x === 'A').length, pct: n ? Math.round(present / n * 100) : 0 };
}
