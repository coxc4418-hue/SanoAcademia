// SanoAcademia — Capa de datos (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, writeBatch, increment
} from './firebase.js';
import { sha256, toast, todayKey, dayKey, addDays, applyLocale, setFx, round2 } from './utils.js';
import { EXPENSE_CATEGORIES, ROOMS_DEFAULT, studentBalance, monthsOwed, currentPeriod, addMonths, isSolvent, slotsOn } from './academy.js';

const DEFAULT_SETTINGS = {
  businessName: '', rif: '', phone: '', whatsapp: '', email: '', address: '', manager: '', slogan: '',
  country: '', currency: '', fx: { enabled: false, sym: 'Bs', name: 'Bolívares', rate: 0, updatedAt: '' },
  dueDay: 5,
  enrollFee: 0,
  siblingPct: 0,
  lateFee: { enabled: false, mode: 'fijo', value: 0 },
  grades: { max: 20, pass: 10 },
  categories: EXPENSE_CATEGORIES,
  rooms: ROOMS_DEFAULT,
  banks: [],
  receiptNote: 'Paga la mensualidad antes del día de vencimiento. Reporta tu pago desde el portal del alumno.',
  portal: { enabled: true, reports: true, grades: true, attendance: true, requests: true, teachers: true, enroll: true },
  catalogCode: '',
  invoicePrefix: 'M'
};

class Store {
  constructor() {
    this.tenantId = null; this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {}; this.announcement = null;
    this.courses = []; this.groups = []; this.students = []; this.teachers = []; this.attendance = []; this.grades = [];
    this.payments = []; this.closings = []; this.payouts = []; this.expenses = []; this.notices = []; this.certificates = []; this.inbox = [];
    this.ready = false; this._unsubs = []; this._listeners = {}; this._loaded = new Set();
  }

  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) {
    (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  portalRef(code) { return doc(db, 'portals', String(code)); }
  catalogRef(code) { return doc(db, 'catalogs', String(code)); }
  certRef(code) { return doc(db, 'certs', String(code)); }
  inboxRef(id) { return doc(db, 'inbox', String(id)); }
  newInboxRef() { return doc(collection(db, 'inbox')); }
  batch() { return writeBatch(db); }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /** La caché local aplica el cambio al instante (también sin internet); se espera al servidor como máximo unos segundos. */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la cuenta esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }
  async save(name, id, data, merge = true) { const b = this.batch(); b.set(this.ref(name, id), data, { merge }); await this.commit(b); }
  async remove(name, id) { const b = this.batch(); b.delete(this.ref(name, id)); await this.commit(b); }

  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'courses', 'groups', 'students', 'payments'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };
    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));
    const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });

    listen(this.tenantRef(), 'tenant', (s) => { this.tenant = s.exists() ? { id: s.id, ...s.data() } : null; });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      applyLocale(this.settings.country || 'VE', this.settings.currency);
      if (!Array.isArray(this.settings.categories) || !this.settings.categories.length) this.settings.categories = EXPENSE_CATEGORIES;
      if (!Array.isArray(this.settings.rooms)) this.settings.rooms = ROOMS_DEFAULT;
      if (!Array.isArray(this.settings.banks)) this.settings.banks = [];
      for (const k of ['portal', 'fx', 'lateFee', 'grades']) this.settings[k] = { ...DEFAULT_SETTINGS[k], ...(this.settings[k] || {}) };
      setFx(this.settings.fx);
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(this.ref('config', 'counters'), (s) => { this.counters = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(this.col('courses'), 'courses', (s) => { this.courses = rows(s).sort(byName); this._cMap = null; });
    listen(this.col('groups'), 'groups', (s) => { this.groups = rows(s).sort(byName); this._gMap = null; });
    listen(this.col('students'), 'students', (s) => { this.students = rows(s).sort(byName); this._sMap = null; });
    const paySince = dayKey(addDays(new Date(), -190));
    listen(query(this.col('payments'), where('date', '>=', paySince)), 'payments', (s) => {
      this.payments = rows(s).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    });
    const sub = (name, key, sort, q = null) => this._unsubs.push(onSnapshot(q || this.col(name), (s) => { this[key] = rows(s).sort(sort); if (key === 'teachers') this._tMap = null; this.emit(key); this.emit('change', key); }, (e) => console.warn('[store]', name, e?.code || e)));
    sub('teachers', 'teachers', byName);
    sub('attendance', 'attendance', (a, b) => (b.date || '').localeCompare(a.date || ''), query(this.col('attendance'), where('date', '>=', dayKey(addDays(new Date(), -150)))));
    sub('grades', 'grades', () => 0);
    sub('closings', 'closings', (a, b) => (b.period || '').localeCompare(a.period || ''));
    sub('payouts', 'payouts', (a, b) => (b.date || '').localeCompare(a.date || ''));
    sub('expenses', 'expenses', (a, b) => (b.date || '').localeCompare(a.date || ''), query(this.col('expenses'), where('period', '>=', addMonths(currentPeriod(), -12))));
    sub('notices', 'notices', (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.date || '').localeCompare(a.date || ''));
    sub('certificates', 'certificates', (a, b) => (b.date || '').localeCompare(a.date || ''));
    // Buzón público: pagos reportados, solicitudes, preinscripciones y listas/notas de los profesores
    this._unsubs.push(onSnapshot(query(collection(db, 'inbox'), where('tenantId', '==', tenantId)), (s) => {
      this.inbox = rows(s).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      this.emit('inbox');
    }, (e) => console.warn('[store] inbox', e?.code || e)));

    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = []; this.ready = false;
    this.tenant = null; this.courses = []; this.groups = []; this.students = []; this.teachers = []; this.attendance = []; this.grades = [];
    this.payments = []; this.closings = []; this.payouts = []; this.expenses = []; this.notices = []; this.certificates = []; this.inbox = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {};
    this._sMap = this._gMap = this._cMap = this._tMap = null;
  }

  // ---------- Ajustes ----------
  get country() { return this.settings.country || ''; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi academia'; }
  get categories() { return this.settings.categories || EXPENSE_CATEGORIES; }
  get rooms() { return (this.settings.rooms || []).filter((r) => r.active !== false); }
  room(id) { return (this.settings.rooms || []).find((r) => r.id === id) || null; }
  roomName(id) { return this.room(id)?.name || ''; }

  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    if (patch.fx) setFx(this.settings.fx);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }
  async setCountry(code, currency = null) {
    const l = applyLocale(code, currency);
    await this.saveSettings({ country: code, currency: l.cur, countrySetAt: new Date().toISOString() });
    this.emit('rate', 1);
  }
  nextSeq(b, key) {
    const n = (Number(this.counters[key]) || 0) + 1;
    this.counters = { ...this.counters, [key]: n };
    b.set(this.ref('config', 'counters'), { [key]: n }, { merge: true });
    return n;
  }

  // ---------- PIN ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) { const s = await getDoc(this.ref('config', 'security')).catch(() => null); if (s?.exists()) this.security = s.data(); }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Cursos, grupos y profesores ----------
  course(id) { if (!this._cMap) this._cMap = new Map(this.courses.map((c) => [c.id, c])); return this._cMap.get(id) || null; }
  group(id) { if (!this._gMap) this._gMap = new Map(this.groups.map((g) => [g.id, g])); return this._gMap.get(id) || null; }
  teacher(id) { if (!this._tMap) this._tMap = new Map(this.teachers.map((t) => [t.id, t])); return this._tMap.get(id) || null; }
  get liveCourses() { return this.courses.filter((c) => c.active !== false); }
  get liveGroups() { return this.groups.filter((g) => g.status !== 'finalizado' && g.active !== false); }
  get liveTeachers() { return this.teachers.filter((t) => t.active !== false); }
  groupsOf(courseId) { return this.groups.filter((g) => g.courseId === courseId); }
  groupLabel(g) { if (!g) return '—'; const c = this.course(g.courseId); return `${c?.name || 'Curso'}${g.name ? ' · ' + g.name : ''}`; }
  roster(groupId) { return this.students.filter((s) => s.status === 'activo' && (s.groupIds || []).includes(groupId)); }
  teacherGroups(teacherId) { return this.liveGroups.filter((g) => g.teacherId === teacherId); }
  /** Clases de una fecha: [{ group, slot }] ordenadas por hora */
  classesOn(dateKey = todayKey()) {
    const d = new Date(dateKey + 'T12:00:00').getDay();
    const out = [];
    for (const g of this.liveGroups) {
      if (g.startDate && dateKey < g.startDate) continue;
      if (g.endDate && dateKey > g.endDate) continue;
      for (const s of slotsOn(g, d)) out.push({ group: g, slot: s });
    }
    return out.sort((a, b) => (a.slot.from || '').localeCompare(b.slot.from || ''));
  }
  sheet(groupId, date) { return this.attendance.find((a) => a.groupId === groupId && a.date === date) || null; }
  sheetsOf(groupId) { return this.attendance.filter((a) => a.groupId === groupId); }
  gradesOf(groupId) { return this.grades.find((g) => g.id === groupId)?.scores || {}; }

  // ---------- Alumnos ----------
  student(id) { if (!this._sMap) this._sMap = new Map(this.students.map((s) => [s.id, s])); return this._sMap.get(id) || null; }
  get activeStudents() { return this.students.filter((s) => s.status === 'activo'); }
  get debtors() { return this.students.filter((s) => studentBalance(s) > 0.009).sort((a, b) => studentBalance(b) - studentBalance(a)); }
  get delinquent() { return this.debtors.filter((s) => monthsOwed(s) >= 2).sort((a, b) => monthsOwed(b) - monthsOwed(a) || studentBalance(b) - studentBalance(a)); }
  get totalDebt() { return round2(this.debtors.reduce((a, s) => a + studentBalance(s), 0)); }
  get solventPct() { const l = this.activeStudents; return l.length ? Math.round(l.filter(isSolvent).length / l.length * 100) : 0; }
  findStudent(text) {
    const raw = String(text || '').trim();
    const v = raw.toLowerCase().replace(/\s+/g, '');
    if (!v) return null;
    const url = /\/portal\/([a-z0-9]+)/i.exec(raw);
    if (url) return this.students.find((s) => (s.portalCode || '').toLowerCase() === url[1].toLowerCase()) || null;
    return this.students.find((s) => (s.code || '').toLowerCase() === v) || this.students.find((s) => (s.portalCode || '').toLowerCase() === v) || null;
  }

  // ---------- Buzón ----------
  inboxOf(type, status = null) { return this.inbox.filter((x) => x.type === type && (!status || (Array.isArray(status) ? status.includes(x.status) : x.status === status))); }
  get reportedPayments() { return this.inboxOf('pago', 'nueva'); }
  get openRequests() { return this.inboxOf('solicitud', ['nueva', 'en_proceso']); }
  get newRequests() { return this.inboxOf('solicitud', 'nueva'); }
  get preEnrollments() { return this.inboxOf('inscripcion', ['nueva', 'contactada']); }
  get newPreEnrollments() { return this.inboxOf('inscripcion', 'nueva'); }

  // ---------- Dinero ----------
  closing(period) { return this.closings.find((c) => c.period === period && c.status !== 'anulado') || null; }
  get confirmedPayments() { return this.payments.filter((p) => p.status === 'confirmado'); }
  collectedIn(period) { return round2(this.confirmedPayments.filter((p) => (p.date || '').startsWith(period)).reduce((a, p) => a + (Number(p.amount) || 0), 0)); }
  expensesIn(period) { return round2(this.expenses.filter((e) => e.period === period && e.status !== 'anulado').reduce((a, e) => a + (Number(e.amount) || 0), 0)); }
  payoutsIn(period) { return round2(this.payouts.filter((p) => p.period === period && p.status !== 'anulado').reduce((a, p) => a + (Number(p.amount) || 0), 0)); }

  // ---------- Consultas ----------
  async listBetween(name, field, from, to) {
    const s = await getDocs(query(this.col(name), where(field, '>=', from), where(field, '<=', to)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listAll(name) { const s = await getDocs(this.col(name)); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
  async getDocById(name, id) { const s = await getDoc(this.ref(name, id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
  async studentReceipts(id) { return (await this.listEq('receipts', 'studentId', id)).sort((a, b) => (b.emittedAt || '').localeCompare(a.emittedAt || '')); }
  async studentPayments(id) { return (await this.listEq('payments', 'studentId', id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
  async periodReceipts(period) { return (await this.listEq('receipts', 'closingId', `m_${period}`)).sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'es')); }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) { await setDoc(doc(db, 'tenants', id), data, { merge: true }); }
/** Cobros confirmados de una sede desde una fecha (para el panel del administrador) */
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'payments'), where('date', '>=', String(fromISO).slice(0, 10))));
  return s.docs.map((d) => d.data()).map((p) => ({ ...p, received: p.status === 'confirmado' ? Number(p.amount) || 0 : 0, status: p.status === 'confirmado' ? 'ok' : 'voided' }));
}
export async function getTenant(id) { const s = await getDoc(doc(db, 'tenants', id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
export async function createTenantDoc(id, data) { await setDoc(doc(db, 'tenants', id), data); }
export async function getUsername(username) { const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase())); return s.exists() ? s.data() : null; }
export async function setUsername(username, data) { await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data); }
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() { const s = await getDoc(doc(db, 'system', 'announcement')); return s.exists() ? s.data() : null; }
/** Páginas públicas: portal del alumno o del profesor, catálogo de inscripción y certificados */
export async function getPortal(code) { const s = await getDoc(doc(db, 'portals', String(code).toUpperCase())); return s.exists() ? s.data() : null; }
export async function getCatalog(code) { const s = await getDoc(doc(db, 'catalogs', String(code).toUpperCase())); return s.exists() ? s.data() : null; }
export async function getCert(code) { const s = await getDoc(doc(db, 'certs', String(code).toUpperCase())); return s.exists() ? s.data() : null; }
export { DEFAULT_SETTINGS };
