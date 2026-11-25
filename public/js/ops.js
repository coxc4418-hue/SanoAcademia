// SanoAcademia — Operaciones: cursos, grupos, alumnos, mensualidades, cobranza, asistencia, notas, profesores y portales
import { auth } from './firebase.js';
import { store } from './store.js';
import { round2, nowISO, todayKey, dayKey, addDays, fmtDate, normalize, toast, num } from './utils.js';
import {
  computeMonthly, dueDateFor, studentBalance, ledgerStatus, periodName, currentPeriod, addMonths, monthsOwed, openCharges,
  overlaps, scheduleText, slotsOn, slotHours, groupFee, studentAverage, attendanceOf, scaleOf, catOf, DAYS_SHORT, fmtHour, isSolvent, CHARGE_KINDS
} from './academy.js';

export const APP_URL = 'https://sano-academia.web.app';
export const by = () => (auth.currentUser?.isAnonymous ? 'demo' : (auth.currentUser?.email || '').split('@')[0] || '—');
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genCode(n = 8) { return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => CODE_ALPHA[x % CODE_ALPHA.length]).join(''); }
export const portalUrl = (code) => `${APP_URL}/portal/${code}`;
export const teacherUrl = (code) => `${APP_URL}/profe/${code}`;
export const enrollUrl = (code) => `${APP_URL}/inscripcion/${code}`;
export const certUrl = (code) => `${APP_URL}/certificado/${code}`;
export const fmtSeq = (prefix, n, len = 5) => `${prefix}-${String(n).padStart(len, '0')}`;
export function slugify(s) { return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'academia'; }
const clean = (o) => { const out = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out; };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const hhmm = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : '');

/** Escribe en varios lotes (Firestore admite 500 operaciones por lote) */
export async function chunked(ops, size = 70) {
  for (let i = 0; i < ops.length; i += size) {
    const b = store.batch();
    ops.slice(i, i + size).forEach((fn) => fn(b));
    await store.commit(b);
  }
}

// ======================================================================
// CURSOS
// ======================================================================
export async function saveCourse(data, id = null) {
  const ref = id ? store.ref('courses', id) : store.newRef('courses');
  const d = clean({
    name: str(data.name, 80), category: data.category || 'otros', level: str(data.level, 40), description: str(data.description, 500),
    monthlyFee: round2(data.monthlyFee), enrollFee: data.enrollFee === '' || data.enrollFee == null ? null : round2(data.enrollFee),
    hours: Number(data.hours) || 0, months: Number(data.months) || 0, color: data.color || catOf(data.category).color,
    active: data.active !== false, updatedAt: nowISO(), ...(id ? {} : { createdAt: nowISO() })
  });
  if (!d.name) throw new Error('Escribe el nombre del curso.');
  const b = store.batch(); b.set(ref, d, { merge: true }); await store.commit(b);
  resetPublished();
  return { id: ref.id, ...d };
}

// ======================================================================
// GRUPOS (secciones con horario, profesor, aula y cupo)
// ======================================================================
export function scheduleConflicts(g, ignoreId = null) {
  const out = [];
  for (const o of store.liveGroups) {
    if (o.id === ignoreId) continue;
    if (g.startDate && o.endDate && o.endDate < g.startDate) continue;
    if (g.endDate && o.startDate && o.startDate > g.endDate) continue;
    for (const a of g.schedule || []) for (const b of o.schedule || []) {
      if (!overlaps(a, b)) continue;
      if (g.room && o.room === g.room) out.push(`${store.roomName(g.room) || 'El aula'} ya está ocupada el ${DAYS_SHORT[a.day]} de ${fmtHour(b.from)} a ${fmtHour(b.to)} (${store.groupLabel(o)}).`);
      if (g.teacherId && o.teacherId === g.teacherId) out.push(`${store.teacher(g.teacherId)?.name || 'El profesor'} ya da clase el ${DAYS_SHORT[a.day]} de ${fmtHour(b.from)} a ${fmtHour(b.to)} (${store.groupLabel(o)}).`);
    }
  }
  return [...new Set(out)];
}
export async function saveGroup(data, id = null, { force = false } = {}) {
  const ref = id ? store.ref('groups', id) : store.newRef('groups');
  const schedule = (data.schedule || []).map((s) => ({ day: Number(s.day), from: hhmm(s.from), to: hhmm(s.to) })).filter((s) => s.from && s.to && s.from < s.to && s.day >= 0 && s.day <= 6);
  const d = clean({
    courseId: data.courseId, name: str(data.name, 60), teacherId: data.teacherId || '', room: data.room || '', schedule,
    capacity: Math.max(0, parseInt(data.capacity, 10) || 0), fee: data.fee === '' || data.fee == null ? null : round2(data.fee),
    startDate: data.startDate || '', endDate: data.endDate || '', status: data.status || 'en_curso', notes: str(data.notes, 300), updatedAt: nowISO()
  });
  if (!d.courseId || !store.course(d.courseId)) throw new Error('Elige el curso.');
  if (!id) Object.assign(d, { evals: data.evals || [], createdAt: nowISO() });
  if (!force) { const c = scheduleConflicts(d, id); if (c.length) { const e = new Error(c[0]); e.conflicts = c; throw e; } }
  const b = store.batch(); b.set(ref, d, { merge: true }); await store.commit(b);
  resetPublished();
  return { id: ref.id, ...(id ? store.group(id) : {}), ...d };
}
export async function setGroupStatus(g, status) { await store.save('groups', g.id, { status, updatedAt: nowISO() }); resetPublished(); }
export async function saveEvals(g, evals) {
  const list = evals.map((e) => ({ id: e.id || 'e' + genCode(5).toLowerCase(), name: str(e.name, 50) || 'Evaluación', weight: round2(e.weight), date: e.date || '' })).filter((e) => e.weight > 0);
  await store.save('groups', g.id, { evals: list, updatedAt: nowISO() });
  resetPublished();
  return list;
}

// ======================================================================
// PROFESORES
// ======================================================================
export async function saveTeacher(data, id = null) {
  const ref = id ? store.ref('teachers', id) : store.newRef('teachers');
  const prev = id ? store.teacher(id) : null;
  const d = clean({
    name: str(data.name, 80), idDoc: str(data.idDoc, 20), phone: str(data.phone, 20), email: str(data.email, 80), specialty: str(data.specialty, 80),
    payMode: data.payMode || 'hora', rate: round2(data.rate), bank: str(data.bank, 160), notes: str(data.notes, 300), active: data.active !== false, updatedAt: nowISO()
  });
  if (!d.name) throw new Error('Escribe el nombre del profesor.');
  if (!prev) Object.assign(d, { createdAt: nowISO(), portalCode: genCode(8) });
  else if (!prev.portalCode) d.portalCode = genCode(8);
  const b = store.batch(); b.set(ref, d, { merge: true }); await store.commit(b);
  const saved = { id: ref.id, ...(prev || {}), ...d };
  if (saved.active !== false && saved.portalCode) await publishTeacherPortal(saved).catch((e) => console.warn('[portal]', e?.code || e));
  resetPublished();
  return saved;
}
export async function renewTeacherCode(t) {
  const code = genCode(8);
  const updated = { ...t, portalCode: code };
  const docData = JSON.parse(JSON.stringify(teacherPortalDoc(updated)));
  const b = store.batch();
  if (t.portalCode) b.delete(store.portalRef(t.portalCode));
  b.set(store.ref('teachers', t.id), { portalCode: code, updatedAt: nowISO() }, { merge: true });
  if (updated.active !== false) b.set(store.portalRef(code), docData);
  await store.commit(b);
  published.delete('p:' + t.portalCode);
  const { updatedAt, ...cmp } = docData;
  published.set('p:' + code, JSON.stringify(cmp));
  return code;
}
export async function setTeacherActive(t, active) {
  const b = store.batch(); b.set(store.ref('teachers', t.id), { active, updatedAt: nowISO() }, { merge: true });
  if (!active && t.portalCode) b.delete(store.portalRef(t.portalCode));
  await store.commit(b); resetPublished();
}

/** Clases dictadas y monto a pagar a un profesor en un mes (según las listas de asistencia pasadas) */
export function teacherPay(t, period = currentPeriod()) {
  const sheets = store.attendance.filter((a) => (a.date || '').startsWith(period) && (a.teacherId || store.group(a.groupId)?.teacherId) === t.id);
  const hours = round2(sheets.reduce((a, s) => a + (Number(s.hours) || 0), 0));
  const rate = Number(t.rate) || 0;
  const groups = store.teacherGroups(t.id);
  let base = 0, amount = 0;
  if (t.payMode === 'hora') amount = hours * rate;
  else if (t.payMode === 'clase') amount = sheets.length * rate;
  else if (t.payMode === 'fijo') amount = rate;
  else if (t.payMode === 'pct') { base = groups.reduce((a, g) => a + groupFee(g, store.course(g.courseId)) * store.roster(g.id).length, 0); amount = base * rate / 100; }
  const paid = round2(store.payouts.filter((p) => p.teacherId === t.id && p.period === period && p.status !== 'anulado').reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const byGroup = {};
  for (const s of sheets) { const k = s.groupId; byGroup[k] ||= { group: store.group(k), classes: 0, hours: 0 }; byGroup[k].classes++; byGroup[k].hours = round2(byGroup[k].hours + (Number(s.hours) || 0)); }
  return { classes: sheets.length, hours, base: round2(base), amount: round2(amount), paid, pending: round2(Math.max(0, amount - paid)), byGroup: Object.values(byGroup), groups };
}
export async function payTeacher(t, { period, amount, method = 'transferencia', reference = '', note = '', date = todayKey(), detail = '' }) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('Indica el monto a pagar.');
  const b = store.batch();
  const ref = store.newRef('payouts');
  const d = { teacherId: t.id, teacherName: t.name, period, amount: amt, method, reference: str(reference, 40), note: str(note, 200), detail: str(detail, 300), date, number: fmtSeq('H', store.nextSeq(b, 'payout'), 5), status: 'pagado', createdAt: nowISO(), by: by() };
  b.set(ref, d);
  await store.commit(b);
  return { id: ref.id, ...d };
}
export async function voidPayout(p) { await store.save('payouts', p.id, { status: 'anulado', voidedAt: nowISO(), voidedBy: by() }); }

// ======================================================================
// ALUMNOS
// ======================================================================
export function cleanStudent(d) {
  return clean({
    name: str(d.name, 80), idDoc: str(d.idDoc, 20), birthDate: d.birthDate || '', gender: d.gender || '', phone: str(d.phone, 20), email: str(d.email, 80),
    address: str(d.address, 160), school: str(d.school, 80), guardianName: str(d.guardianName, 80), guardianPhone: str(d.guardianPhone, 20),
    guardianRelation: str(d.guardianRelation, 30), guardianIdDoc: str(d.guardianIdDoc, 20), health: str(d.health, 300), notes: str(d.notes, 400),
    discountPct: Math.min(100, Math.max(0, Number(d.discountPct) || 0)), discountReason: str(d.discountReason, 40), howFound: str(d.howFound, 40)
  });
}
export async function saveStudent(data, id = null) {
  const ref = id ? store.ref('students', id) : store.newRef('students');
  const prev = id ? store.student(id) : null;
  const d = { ...cleanStudent(data), updatedAt: nowISO() };
  if (!d.name) throw new Error('Escribe el nombre del alumno.');
  const b = store.batch();
  if (!prev) {
    Object.assign(d, { code: fmtSeq('A', store.nextSeq(b, 'student'), 4), billed: 0, paid: 0, ledger: [], groupIds: [], status: 'activo', createdAt: nowISO(), enrolledAt: todayKey(), portalCode: genCode(8) });
    if (data.photo) d.photo = data.photo;
  } else {
    if (!prev.portalCode) d.portalCode = genCode(8);
    if (data.photo !== undefined) d.photo = data.photo || '';
  }
  if (d.idDoc) { const dup = store.students.find((s) => s.id !== ref.id && s.idDoc && normalize(s.idDoc) === normalize(d.idDoc) && s.status !== 'retirado'); if (dup) throw new Error(`Ya existe un alumno con ese documento: ${dup.name} (${dup.code}).`); }
  b.set(ref, d, { merge: true });
  await store.commit(b);
  const saved = { id: ref.id, ...(prev || {}), ...d };
  if (saved.status !== 'retirado' && saved.portalCode) await publishStudentPortal(saved).catch((e) => console.warn('[portal]', e?.code || e));
  resetPublished();
  return saved;
}
export async function setStudentStatus(s, status) {
  const b = store.batch();
  b.set(store.ref('students', s.id), { status, ...(status === 'retirado' ? { retiredAt: todayKey() } : {}), ...(status === 'egresado' ? { graduatedAt: todayKey() } : {}), updatedAt: nowISO() }, { merge: true });
  await store.commit(b); resetPublished();
}
export async function renewPortalCode(s) {
  const code = genCode(8);
  const updated = { ...s, portalCode: code };
  const docData = JSON.parse(JSON.stringify(portalDoc(updated)));
  const b = store.batch();
  if (s.portalCode) b.delete(store.portalRef(s.portalCode));
  b.set(store.ref('students', s.id), { portalCode: code, updatedAt: nowISO() }, { merge: true });
  if (updated.status !== 'retirado') b.set(store.portalRef(code), docData);
  await store.commit(b);
  published.delete('p:' + s.portalCode);
  const { updatedAt, ...cmp } = docData;
  published.set('p:' + code, JSON.stringify(cmp));
  return code;
}
/** Inscribe al alumno en un grupo (revisa el cupo). Con chargeEnroll cobra la inscripción del curso. */
export async function enroll(s, groupId, { chargeEnroll = false, force = false } = {}) {
  const g = store.group(groupId);
  if (!g) throw new Error('Grupo no encontrado.');
  if ((s.groupIds || []).includes(groupId)) return;
  const n = store.roster(groupId).length;
  if (!force && g.capacity && n >= g.capacity) { const e = new Error(`El grupo ${store.groupLabel(g)} está lleno (${n}/${g.capacity}).`); e.full = true; throw e; }
  const b = store.batch();
  b.set(store.ref('students', s.id), { groupIds: [...(s.groupIds || []), groupId], status: 'activo', updatedAt: nowISO() }, { merge: true });
  await store.commit(b);
  if (chargeEnroll) {
    const c = store.course(g.courseId);
    const fee = c?.enrollFee != null ? Number(c.enrollFee) : Number(store.settings.enrollFee) || 0;
    if (fee > 0) await addStudentCharge(store.student(s.id) || { ...s, groupIds: [...(s.groupIds || []), groupId] }, { concept: `Inscripción · ${c?.name || 'curso'}`, amount: fee, kind: 'inscripcion' });
  }
  resetPublished();
}
export async function unenroll(s, groupId) {
  await store.save('students', s.id, { groupIds: (s.groupIds || []).filter((x) => x !== groupId), updatedAt: nowISO() });
  resetPublished();
}
/** Saldo inicial (deuda anterior al sistema o saldo a favor) */
export async function setOpeningBalance(s, amount, note = 'Saldo anterior') {
  const amt = round2(amount);
  if (!amt) return;
  if (amt > 0) return addStudentCharge(s, { concept: note, amount: amt, kind: 'otro' });
  await store.save('students', s.id, { paid: store.inc(-amt), updatedAt: nowISO() });
}
/** Importa alumnos desde filas CSV: nombre; documento; nacimiento; teléfono; correo; representante; tel. representante; grupo */
export async function importStudents(rows) {
  let created = 0, updated = 0;
  const ops = [];
  let seq = Number(store.counters.student) || 0;
  for (const r of rows) {
    const name = str(r.name, 80);
    if (!name) continue;
    const prev = r.idDoc ? store.students.find((s) => s.idDoc && normalize(s.idDoc) === normalize(r.idDoc)) : store.students.find((s) => normalize(s.name) === normalize(name));
    const ref = prev ? store.ref('students', prev.id) : store.newRef('students');
    const d = { ...cleanStudent({ ...prev, ...r, name }), updatedAt: nowISO() };
    const gid = r.groupId && store.group(r.groupId) ? r.groupId : '';
    if (!prev) {
      Object.assign(d, { code: fmtSeq('A', ++seq, 4), billed: 0, paid: 0, ledger: [], groupIds: gid ? [gid] : [], status: 'activo', createdAt: nowISO(), enrolledAt: r.enrolledAt || todayKey(), portalCode: genCode(8) });
      const debt = round2(Number(String(r.debt || '').replace(',', '.')) || 0);
      if (debt > 0) Object.assign(d, { billed: debt, ledger: [{ id: 'saldo', p: addMonths(currentPeriod(), -1), c: 0, t: debt, n: 'Saldo anterior', d: todayKey(), k: 'extra' }] });
      created++;
    } else {
      if (gid && !(prev.groupIds || []).includes(gid)) d.groupIds = [...(prev.groupIds || []), gid];
      updated++;
    }
    ops.push((b) => b.set(ref, d, { merge: true }));
  }
  ops.push((b) => b.set(store.ref('config', 'counters'), { student: seq }, { merge: true }));
  store.counters = { ...store.counters, student: seq };
  await chunked(ops);
  resetPublished();
  return { created, updated };
}

// ======================================================================
// MENSUALIDADES (cierre del mes) Y CARGOS
// ======================================================================
export function previewMonthly(period) {
  return computeMonthly({ students: store.students, groups: store.groups, courses: store.courses, settings: store.settings, period });
}
const trimLedger = (s, extra) => {
  const all = [...(s.ledger || []), extra];
  const st = ledgerStatus({ ...s, ledger: all });
  return all.filter((x, i) => st[i].rest > 0.009 || i >= all.length - 24);
};
export async function emitMonthly(period, { dueDate = null, note = '' } = {}) {
  if (store.closing(period)) throw new Error(`Las mensualidades de ${periodName(period)} ya se generaron.`);
  const { summary, rows } = previewMonthly(period);
  if (!rows.length) throw new Error('No hay alumnos activos inscritos en grupos con mensualidad.');
  const due = dueDate || dueDateFor(store.settings, period);
  const closingId = `m_${period}`;
  const rate = Number(store.settings.fx?.enabled && store.settings.fx.rate) || 0;
  const now = nowISO();
  const b0 = store.batch();
  const firstSeq = (Number(store.counters.receipt) || 0) + 1;
  b0.set(store.ref('config', 'counters'), { receipt: firstSeq + rows.length - 1 }, { merge: true });
  store.counters = { ...store.counters, receipt: firstSeq + rows.length - 1 };
  await store.commit(b0);
  const prefix = store.settings.invoicePrefix || 'M';
  const ops = [];
  rows.forEach((r, i) => {
    const s = r.student;
    const id = `${closingId}_${s.id}`;
    const number = fmtSeq(prefix, firstSeq + i, 6);
    const cumBefore = Number(s.billed) || 0;
    const prevDebt = round2(Math.max(0, studentBalance(s)));
    const credit = round2(Math.max(0, -studentBalance(s)));
    ops.push((b) => b.set(store.ref('receipts', id), { closingId, period, studentId: s.id, studentCode: s.code || '', studentName: s.name || '', items: r.items, total: r.total, number, dueDate: due, cumBefore, prevDebt, credit, emittedAt: now, fxRate: rate, kind: 'mes', by: by() }));
    const entry = { id, p: period, c: cumBefore, t: r.total, n: number, d: due, k: 'mes' };
    ops.push((b) => b.set(store.ref('students', s.id), { billed: store.inc(r.total), ledger: trimLedger(s, entry), updatedAt: now }, { merge: true }));
  });
  ops.push((b) => b.set(store.ref('closings', closingId), { period, status: 'emitido', dueDate: due, emittedAt: now, by: by(), note: str(note, 300), fxRate: rate, ...summary, receipts: rows.length, firstNumber: fmtSeq(prefix, firstSeq, 6), lastNumber: fmtSeq(prefix, firstSeq + rows.length - 1, 6) }));
  await chunked(ops);
  resetPublished();
  return { closingId, summary, count: rows.length };
}
/** Anula la generación del mes (si ningún alumno tiene cargos posteriores) */
export async function annulMonthly(closing) {
  const list = await store.periodReceipts(closing.period);
  const blocked = list.filter((r) => { const s = store.student(r.studentId); return s && Math.abs((Number(s.billed) || 0) - (Number(r.cumBefore) || 0) - (Number(r.total) || 0)) > 0.009; });
  if (blocked.length) throw new Error(`No se puede anular: ${blocked.length} alumno(s) tienen cargos posteriores a este mes.`);
  const now = nowISO();
  const ops = [];
  for (const r of list) {
    const s = store.student(r.studentId);
    ops.push((b) => b.delete(store.ref('receipts', r.id)));
    if (s) ops.push((b) => b.set(store.ref('students', s.id), { billed: store.inc(-r.total), ledger: (s.ledger || []).filter((x) => x.id !== r.id), updatedAt: now }, { merge: true }));
  }
  ops.push((b) => b.set(store.ref('closings', closing.id), { status: 'anulado', annulledAt: now, by: by() }, { merge: true }));
  await chunked(ops);
  resetPublished();
}
/** Cargo individual (inscripción, materiales, uniforme, examen, certificado…) */
export async function addStudentCharge(s, { concept, amount, kind = 'otro', due = null }) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('Indica el monto.');
  const b = store.batch();
  const ref = store.newRef('receipts');
  const number = fmtSeq('C', store.nextSeq(b, 'charge'), 5);
  const cumBefore = Number(s.billed) || 0;
  const period = currentPeriod();
  const d = due || dayKey(addDays(new Date(), 7));
  b.set(ref, { closingId: '', period, studentId: s.id, studentCode: s.code || '', studentName: s.name || '', items: [{ concept: str(concept, 120) || CHARGE_KINDS[kind] || 'Cargo', amount: amt, kind }], total: amt, number, dueDate: d, cumBefore, emittedAt: nowISO(), kind: 'cargo', chargeKind: kind, by: by() });
  b.set(store.ref('students', s.id), { billed: store.inc(amt), ledger: trimLedger(s, { id: ref.id, p: period, c: cumBefore, t: amt, n: str(concept, 60) || number, d, k: 'extra' }), updatedAt: nowISO() }, { merge: true });
  await store.commit(b);
  resetPublished();
}

// ======================================================================
// COBRANZA
// ======================================================================
export async function registerPayment(p) {
  const s = store.student(p.studentId);
  if (!s) throw new Error('Alumno no encontrado.');
  const amount = round2(p.amount);
  if (!(amount > 0)) throw new Error('Indica el monto del pago.');
  if (p.reference && store.payments.some((x) => x.status === 'confirmado' && x.reference && x.reference === String(p.reference).trim() && x.method === p.method && Math.abs((Number(x.amount) || 0) - amount) < 0.01)) {
    throw new Error(`Ya hay un pago confirmado con la referencia ${p.reference}. Revisa que no esté duplicado.`);
  }
  const b = store.batch();
  const ref = store.newRef('payments');
  const number = fmtSeq('P', store.nextSeq(b, 'payment'), 6);
  const applied = [];
  let left = amount;
  for (const x of ledgerStatus(s)) { if (left <= 0.009) break; if (x.rest <= 0.009) continue; const a = round2(Math.min(left, x.rest)); applied.push({ n: x.n, p: x.p, k: x.k, amount: a }); left = round2(left - a); }
  const d = clean({
    studentId: s.id, studentCode: s.code || '', studentName: s.name || '', amount, date: p.date || todayKey(),
    method: p.method || 'transferencia', bank: str(p.bank, 60), reference: str(p.reference, 40), amountBs: round2(p.amountBs || 0), rate: Number(p.rate) || 0,
    payer: str(p.payer, 80), note: str(p.note, 300), status: 'confirmado', number, applied, advance: left > 0.009 ? left : 0, source: p.inboxId ? 'portal' : 'oficina', inboxId: p.inboxId || '',
    createdAt: nowISO(), by: by()
  });
  b.set(ref, d);
  b.set(store.ref('students', s.id), { paid: store.inc(amount), lastPaymentAt: d.date, updatedAt: nowISO() }, { merge: true });
  if (p.inboxId) b.set(store.inboxRef(p.inboxId), { status: 'procesada', paymentId: ref.id, processedAt: nowISO() }, { merge: true });
  await store.commit(b);
  resetPublished();
  return { id: ref.id, ...d };
}
export async function voidPayment(pay, reason = '') {
  if (pay.status !== 'confirmado') return;
  const b = store.batch();
  b.set(store.ref('payments', pay.id), { status: 'anulado', voidReason: str(reason, 200), voidedAt: nowISO(), voidedBy: by() }, { merge: true });
  b.set(store.ref('students', pay.studentId), { paid: store.inc(-(Number(pay.amount) || 0)), updatedAt: nowISO() }, { merge: true });
  await store.commit(b);
  resetPublished();
}
export async function rejectReport(item, reason = '') {
  await setInbox(item, { status: 'rechazada', reply: str(reason, 300) || 'No pudimos verificar el pago. Comunícate con la academia.' });
}

// ======================================================================
// ASISTENCIA Y NOTAS
// ======================================================================
export async function saveAttendance(groupId, date, marks, { topic = '', via = 'oficina' } = {}) {
  const g = store.group(groupId);
  if (!g) throw new Error('Grupo no encontrado.');
  const dow = new Date(date + 'T12:00:00').getDay();
  const sl = slotsOn(g, dow);
  const hours = round2(sl.length ? sl.reduce((a, s) => a + slotHours(s), 0) : (g.schedule?.[0] ? slotHours(g.schedule[0]) : 1));
  const clean = {};
  for (const [k, v] of Object.entries(marks || {})) if (['P', 'A', 'T', 'J'].includes(v)) clean[k] = v;
  const id = `${groupId}_${date}`;
  await store.save('attendance', id, { groupId, date, marks: clean, topic: str(topic, 200), teacherId: g.teacherId || '', hours, via, updatedAt: nowISO(), by: via === 'profesor' ? 'profesor' : by() }, false);
  resetPublished();
  return id;
}
export async function deleteAttendance(sheet) { await store.remove('attendance', sheet.id); resetPublished(); }
export async function saveScores(groupId, evalId, scores) {
  const max = scaleOf(store.settings).max;
  const out = {};
  for (const [k, v] of Object.entries(scores || {})) {
    if (v === '' || v == null) { out[k] = null; continue; }
    const n = Number(String(v).replace(',', '.'));
    if (isFinite(n)) out[k] = Math.max(0, Math.min(max, round2(n)));
  }
  const cur = store.gradesOf(groupId);
  const merged = { ...(cur[evalId] || {}), ...out };
  for (const k of Object.keys(merged)) if (merged[k] == null) delete merged[k];
  await store.save('grades', groupId, { scores: { ...cur, [evalId]: merged }, updatedAt: nowISO() }, false);
  resetPublished();
}
/** Las listas y notas que envían los profesores desde su portal se pasan a la academia */
export async function processTeacherInbox() {
  const pend = store.inbox.filter((x) => (x.type === 'asistencia' || x.type === 'notas') && x.status === 'nueva');
  let n = 0;
  for (const x of pend) {
    const g = store.group(x.groupId);
    const t = store.teacher(x.who);
    let ok = !!(g && t && g.teacherId === t.id);
    try {
      if (ok && x.type === 'asistencia') {
        const ids = new Set(store.roster(g.id).map((s) => s.id));
        const marks = {}; for (const [k, v] of Object.entries(x.marks || {})) if (ids.has(k)) marks[k] = v;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || x.date > todayKey()) ok = false;
        else await saveAttendance(g.id, x.date, marks, { topic: x.topic || '', via: 'profesor' });
      } else if (ok && x.type === 'notas') {
        if (!(g.evals || []).some((e) => e.id === x.evalId)) ok = false;
        else { const ids = new Set(store.roster(g.id).map((s) => s.id)); const sc = {}; for (const [k, v] of Object.entries(x.scores || {})) if (ids.has(k)) sc[k] = v; await saveScores(g.id, x.evalId, sc); }
      }
    } catch (e) { console.warn('[profesor]', e); ok = false; }
    const b = store.batch();
    b.set(store.inboxRef(x.id), { status: ok ? 'procesada' : 'rechazada', processedAt: nowISO() }, { merge: true });
    await store.commit(b);
    n++;
  }
  return n;
}

// ======================================================================
// CERTIFICADOS (verificables con QR)
// ======================================================================
export async function issueCertificate(s, g, { grade = null, hours = 0, date = todayKey(), mention = '' } = {}) {
  const c = store.course(g.courseId);
  const b = store.batch();
  const ref = store.newRef('certificates');
  const number = fmtSeq('CERT', store.nextSeq(b, 'cert'), 5);
  const verify = genCode(10);
  const d = { studentId: s.id, studentName: s.name, studentIdDoc: s.idDoc || '', groupId: g.id, courseId: g.courseId, courseName: c?.name || '', groupName: g.name || '', level: c?.level || '', hours: Number(hours) || Number(c?.hours) || 0, grade: grade == null ? null : Number(grade), mention: str(mention, 80), date, number, verify, teacherName: store.teacher(g.teacherId)?.name || '', status: 'valido', createdAt: nowISO(), by: by() };
  b.set(ref, d);
  const mask = (v) => (v ? String(v).replace(/.(?=.{3})/g, '•') : '');
  b.set(store.certRef(verify), { tenantId: store.tenantId, number, academy: store.businessName, manager: store.settings.manager || '', student: s.name, idDoc: mask(s.idDoc), course: d.courseName, level: d.level, hours: d.hours, grade: d.grade, scaleMax: scaleOf(store.settings).max, mention: d.mention, date, teacher: d.teacherName, status: 'valido', updatedAt: nowISO() });
  await store.commit(b);
  resetPublished();
  return { id: ref.id, ...d };
}
export async function voidCertificate(cert) {
  const b = store.batch();
  b.set(store.ref('certificates', cert.id), { status: 'anulado', voidedAt: nowISO() }, { merge: true });
  if (cert.verify) b.set(store.certRef(cert.verify), { status: 'anulado', updatedAt: nowISO() }, { merge: true });
  await store.commit(b); resetPublished();
}

// ======================================================================
// GASTOS DE LA ACADEMIA
// ======================================================================
export async function saveExpense(data, id = null) {
  const ref = id ? store.ref('expenses', id) : store.newRef('expenses');
  const amount = round2(data.amount);
  if (!(amount > 0)) throw new Error('Indica el monto del gasto.');
  const date = data.date || todayKey();
  const b = store.batch();
  const d = clean({ period: date.slice(0, 7), date, category: data.category || 'otros', concept: str(data.concept, 140), supplier: str(data.supplier, 80), amount, method: data.method || '', reference: str(data.reference, 40), status: 'activo', updatedAt: nowISO(), by: by() });
  if (!id) { d.number = fmtSeq('G', store.nextSeq(b, 'expense')); d.createdAt = nowISO(); }
  b.set(ref, d, { merge: true });
  await store.commit(b);
  return { id: ref.id, ...d };
}
export async function voidExpense(e) { await store.save('expenses', e.id, { status: 'anulado', updatedAt: nowISO(), by: by() }); }

// ======================================================================
// COMUNICADOS Y SOLICITUDES
// ======================================================================
export async function saveNotice(data, id = null) {
  const ref = id ? store.ref('notices', id) : store.newRef('notices');
  const d = clean({ target: data.target || '', title: str(data.title, 100), body: str(data.body, 2000), kind: data.kind || 'aviso', pinned: !!data.pinned, date: data.date || todayKey(), until: data.until || '', updatedAt: nowISO(), by: by() });
  if (!d.title) throw new Error('Escribe el título del comunicado.');
  const b = store.batch(); b.set(ref, d, { merge: true }); await store.commit(b);
  resetPublished();
  return { id: ref.id, ...d };
}
export async function deleteNotice(n) { await store.remove('notices', n.id); resetPublished(); }
/** ¿A qué alumnos llega un comunicado? target: '' todos · 'c:ID' un curso · 'g:ID' un grupo */
export function noticeAudience(target) {
  if (!target) return store.activeStudents;
  const [k, id] = target.split(':');
  if (k === 'g') return store.roster(id);
  if (k === 'c') { const gs = new Set(store.groupsOf(id).map((g) => g.id)); return store.activeStudents.filter((s) => (s.groupIds || []).some((x) => gs.has(x))); }
  return store.activeStudents;
}
export const targetName = (target) => {
  if (!target) return 'Toda la academia';
  const [k, id] = target.split(':');
  return k === 'g' ? store.groupLabel(store.group(id)) : store.course(id)?.name || 'Curso';
};
const noticeFor = (s) => (n) => !n.target || (n.target.startsWith('g:') ? (s.groupIds || []).includes(n.target.slice(2)) : (s.groupIds || []).some((gid) => store.group(gid)?.courseId === n.target.slice(2)));

export async function setInbox(item, patch) {
  const b = store.batch(); b.set(store.inboxRef(item.id), { ...patch, updatedAt: nowISO() }, { merge: true }); await store.commit(b);
  resetPublished();
}
export async function createRequest({ studentId, category, text }) {
  const s = store.student(studentId);
  if (!s) throw new Error('Elige el alumno.');
  if (str(text).length < 4) throw new Error('Describe la solicitud.');
  const b = store.batch();
  b.set(store.newInboxRef(), { tenantId: store.tenantId, code: s.portalCode || '', who: s.id, studentCode: s.code || '', studentName: s.name || '', type: 'solicitud', category: category || 'otro', text: str(text, 600), name: 'Academia', phone: '', status: 'nueva', createdAt: nowISO() });
  await store.commit(b);
}
/** Convierte una preinscripción en alumno inscrito */
export async function convertEnrollment(item, { groupId, chargeEnroll = true }) {
  const s = await saveStudent({ name: item.name, idDoc: item.idDoc, birthDate: item.birthDate, phone: item.phone, email: item.email, guardianName: item.guardianName, guardianPhone: item.guardianPhone, howFound: 'Inscripción en línea', notes: item.note ? `Preinscripción: ${item.note}` : '' });
  await new Promise((r) => setTimeout(r, 200));
  if (groupId) await enroll(store.student(s.id) || s, groupId, { chargeEnroll, force: true });
  await setInbox(item, { status: 'procesada', studentId: s.id, processedAt: nowISO() });
  return store.student(s.id) || s;
}

// ======================================================================
// PORTALES PÚBLICOS (alumno, profesor) Y CATÁLOGO DE INSCRIPCIÓN
// ======================================================================
const fxRate = () => (store.settings.fx?.enabled ? Number(store.settings.fx.rate) || 0 : 0);
const groupPub = (g) => {
  const c = store.course(g.courseId);
  return { id: g.id, course: c?.name || 'Curso', name: g.name || '', color: c?.color || catOf(c?.category).color, teacher: store.teacher(g.teacherId)?.name || '', room: store.roomName(g.room), schedule: (g.schedule || []).map((s) => ({ day: s.day, from: s.from, to: s.to })), text: scheduleText(g) };
};
export function portalDoc(s) {
  const st = store.settings;
  const scale = scaleOf(st);
  const led = ledgerStatus(s);
  const groups = (s.groupIds || []).map((id) => store.group(id)).filter((g) => g && g.status !== 'finalizado');
  const allGroups = (s.groupIds || []).map((id) => store.group(id)).filter(Boolean);
  const grades = st.portal?.grades !== false ? allGroups.filter((g) => (g.evals || []).length).map((g) => {
    const sc = store.gradesOf(g.id);
    const avg = studentAverage(g, sc, s.id);
    return { group: store.groupLabel(g), evals: g.evals.map((e) => ({ name: e.name, weight: e.weight, score: sc[e.id]?.[s.id] ?? null })), avg, pass: avg == null ? null : avg >= scale.pass };
  }) : [];
  const attendance = st.portal?.attendance !== false ? groups.map((g) => {
    const sheets = store.sheetsOf(g.id);
    const a = attendanceOf(s.id, sheets);
    return { group: store.groupLabel(g), pct: a.pct, P: a.P, T: a.T, A: a.A, J: a.J, last: sheets.filter((x) => x.marks?.[s.id]).slice(0, 8).map((x) => ({ date: x.date, m: x.marks[s.id] })) };
  }).filter((x) => x.P + x.T + x.A + x.J > 0) : [];
  const notices = store.notices.filter(noticeFor(s)).filter((n) => !n.until || n.until >= todayKey()).slice(0, 6).map((n) => ({ title: n.title, body: String(n.body || '').slice(0, 600), kind: n.kind, date: n.date, pinned: !!n.pinned }));
  const pays = store.payments.filter((p) => p.studentId === s.id && p.status === 'confirmado').slice(0, 6).map((p) => ({ n: p.number, date: p.date, amount: p.amount, method: p.method, ref: p.reference || '' }));
  const reports = store.inbox.filter((x) => x.who === s.id && x.type === 'pago').slice(0, 4).map((x) => ({ date: (x.createdAt || '').slice(0, 10), amount: x.amount, status: x.status, reply: x.reply || '' }));
  const reqs = store.inbox.filter((x) => x.who === s.id && x.type === 'solicitud').slice(0, 5).map((x) => ({ date: (x.createdAt || '').slice(0, 10), category: x.category, text: String(x.text || '').slice(0, 160), status: x.status, reply: x.reply || '' }));
  const certs = store.certificates.filter((c) => c.studentId === s.id && c.status !== 'anulado').slice(0, 6).map((c) => ({ number: c.number, course: c.courseName, date: c.date, verify: c.verify }));
  return {
    kind: 'alumno', tenantId: store.tenantId, who: s.id, code: s.portalCode,
    academy: store.businessName, academyPhone: st.whatsapp || st.phone || '', academyEmail: st.email || '', address: st.address || '', country: st.country || 'VE', currency: st.currency || '',
    name: String(s.name || '').split(' ').slice(0, 3).join(' '), studentCode: s.code || '', status: s.status || 'activo',
    balance: studentBalance(s), months: monthsOwed(s), rate: fxRate(), fxSym: st.fx?.sym || 'Bs',
    charges: led.slice(-12).reverse().map((x) => ({ n: x.n, p: x.p, t: x.t, rest: x.rest, d: x.d || '', st: x.status, k: x.k || 'mes' })),
    payments: pays, reports, requests: reqs, notices, certs, groups: groups.map(groupPub), grades, attendance,
    scale: { max: scale.max, pass: scale.pass },
    banks: (st.banks || []).filter((b) => b.active !== false).slice(0, 6).map((b) => ({ type: b.type, bank: b.bank, holder: b.holder, number: b.number, idDoc: b.idDoc, phone: b.phone, email: b.email })),
    allow: { reports: st.portal?.reports !== false, requests: st.portal?.requests !== false },
    active: s.status !== 'retirado' && st.portal?.enabled !== false,
    updatedAt: nowISO()
  };
}
export function teacherPortalDoc(t) {
  const st = store.settings;
  const groups = store.teacherGroups(t.id).map((g) => {
    const roster = store.roster(g.id).map((s) => ({ id: s.id, name: s.name }));
    const sc = store.gradesOf(g.id);
    return { ...groupPub(g), roster, evals: (g.evals || []).map((e) => ({ id: e.id, name: e.name, weight: e.weight, scores: Object.fromEntries(roster.map((r) => [r.id, sc[e.id]?.[r.id] ?? null])) })), taken: store.sheetsOf(g.id).slice(0, 12).map((x) => x.date) };
  });
  const pay = teacherPay(t);
  return {
    kind: 'profesor', tenantId: store.tenantId, who: t.id, code: t.portalCode, academy: store.businessName, academyPhone: st.whatsapp || st.phone || '', country: st.country || 'VE', currency: st.currency || '',
    name: t.name, specialty: t.specialty || '', groups, groupIds: groups.map((g) => g.id), scale: { max: scaleOf(st).max, pass: scaleOf(st).pass },
    month: { period: currentPeriod(), classes: pay.classes, hours: pay.hours, amount: pay.amount, paid: pay.paid, mode: t.payMode || 'hora' },
    payouts: store.payouts.filter((p) => p.teacherId === t.id && p.status !== 'anulado').slice(0, 4).map((p) => ({ n: p.number, date: p.date, amount: p.amount, period: p.period })),
    allow: { attendance: true, grades: true }, active: t.active !== false && st.portal?.teachers !== false, updatedAt: nowISO()
  };
}
export function catalogDoc() {
  const st = store.settings;
  const courses = store.liveCourses.map((c) => ({
    id: c.id, name: c.name, category: c.category || 'otros', level: c.level || '', description: String(c.description || '').slice(0, 400), monthlyFee: Number(c.monthlyFee) || 0,
    enrollFee: c.enrollFee != null ? Number(c.enrollFee) : Number(st.enrollFee) || 0, hours: c.hours || 0, months: c.months || 0, color: c.color || catOf(c.category).color,
    groups: store.groupsOf(c.id).filter((g) => g.status !== 'finalizado').map((g) => ({ id: g.id, name: g.name || '', text: scheduleText(g), seats: g.capacity ? Math.max(0, g.capacity - store.roster(g.id).length) : null, start: g.startDate || '', fee: groupFee(g, c), teacher: (store.teacher(g.teacherId)?.name || '').split(' ')[0] }))
  })).filter((c) => c.groups.length);
  return {
    tenantId: store.tenantId, code: st.catalogCode, academy: store.businessName, slogan: st.slogan || '', phone: st.whatsapp || st.phone || '', email: st.email || '', address: st.address || '',
    country: st.country || 'VE', currency: st.currency || '', rate: fxRate(), fxSym: st.fx?.sym || 'Bs', courses, groupIds: courses.flatMap((c) => c.groups.map((g) => g.id)), active: st.portal?.enroll !== false && st.portal?.enabled !== false, updatedAt: nowISO()
  };
}
/** Publica de inmediato el catálogo de inscripción en línea (/inscripcion/CODIGO) */
export async function publishCatalogNow() {
  if (!store.tenantId || !store.settings.catalogCode) return null;
  const code = store.settings.catalogCode;
  const data = JSON.parse(JSON.stringify(catalogDoc()));
  const { updatedAt, ...cmp } = data;
  const b = store.batch();
  b.set(store.catalogRef(code), data);
  await store.commit(b);
  published.set('c:' + code, JSON.stringify(cmp));
  return code;
}
/** Publica de inmediato el portal de un alumno */
export async function publishStudentPortal(s) {
  if (!store.tenantId || !s) return null;
  let stu = s;
  if (!stu.portalCode) {
    const code = genCode(8);
    const b0 = store.batch(); b0.set(store.ref('students', stu.id), { portalCode: code, updatedAt: nowISO() }, { merge: true }); await store.commit(b0);
    stu = { ...stu, portalCode: code };
  }
  const data = JSON.parse(JSON.stringify(portalDoc(stu)));
  const { updatedAt, ...cmp } = data;
  const b = store.batch(); b.set(store.portalRef(stu.portalCode), data); await store.commit(b);
  published.set('p:' + stu.portalCode, JSON.stringify(cmp));
  return stu.portalCode;
}
/** Publica de inmediato el portal de un profesor */
export async function publishTeacherPortal(t) {
  if (!store.tenantId || !t) return null;
  let tc = t;
  if (!tc.portalCode) {
    const code = genCode(8);
    const b0 = store.batch(); b0.set(store.ref('teachers', tc.id), { portalCode: code, updatedAt: nowISO() }, { merge: true }); await store.commit(b0);
    tc = { ...tc, portalCode: code };
  }
  const data = JSON.parse(JSON.stringify(teacherPortalDoc(tc)));
  const { updatedAt, ...cmp } = data;
  const b = store.batch(); b.set(store.portalRef(tc.portalCode), data); await store.commit(b);
  published.set('p:' + tc.portalCode, JSON.stringify(cmp));
  return tc.portalCode;
}
/** Asegura que la academia tenga su código de catálogo y lo publica de inmediato */
export async function ensureCatalogCode() {
  if (!store.settings.catalogCode) {
    const code = genCode(6);
    await store.saveSettings({ catalogCode: code });
  }
  await publishCatalogNow().catch((e) => console.warn('[catalogo]', e?.code || e));
  return store.settings.catalogCode;
}

let published = new Map();
export function resetPublished() { published = new Map(); schedulePublish?.(); }
let schedulePublish = null;
export function setPublishScheduler(fn) { schedulePublish = fn; }
/** Publica (solo lo que cambió) el portal de cada alumno y profesor, y el catálogo de inscripción */
export async function publishPortals() {
  if (!store.tenantId || !store.ready) return 0;
  if (!store.settings.catalogCode && store.courses.length) {
    await store.saveSettings({ catalogCode: genCode(6) }).catch(() => {});
  }
  const ops = [];
  const add = (key, ref, d) => {
    const data = JSON.parse(JSON.stringify(d));
    const { updatedAt, ...cmp } = data;
    const h = JSON.stringify(cmp);
    if (published.get(key) === h) return;
    ops.push({ key, h, fn: (b) => b.set(ref, data) });
  };
  for (const s of store.students) {
    if (!s.portalCode) continue;
    add('p:' + s.portalCode, store.portalRef(s.portalCode), portalDoc(s));
  }
  for (const t of store.liveTeachers) if (t.portalCode) add('p:' + t.portalCode, store.portalRef(t.portalCode), teacherPortalDoc(t));
  if (store.settings.catalogCode) add('c:' + store.settings.catalogCode, store.catalogRef(store.settings.catalogCode), catalogDoc());
  if (!ops.length) return 0;
  await chunked(ops.map((o) => o.fn), 50);
  ops.forEach((o) => published.set(o.key, o.h));
  return ops.length;
}

export { addDays, dayKey, fmtDate, normalize, toast, num, isSolvent, openCharges };
