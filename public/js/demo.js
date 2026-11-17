// SanoAcademia — Modo demo (sesión anónima de 30 minutos) con una academia de ejemplo llena de vida
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, query, where, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS } from './store.js';
import { saveTeacher, saveCourse, saveGroup, emitMonthly, saveNotice, payTeacher, teacherPay, issueCertificate, fmtSeq, genCode, chunked } from './ops.js';
import { round2, nowISO, todayKey, dayKey, addDays, sha256, scaleUSD } from './utils.js';
import { currentPeriod, addMonths, ledgerStatus, periodName, classDates, slotsOn, slotHours, studentAverage, ROOMS_DEFAULT } from './academy.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['courses', 'groups', 'students', 'teachers', 'attendance', 'grades', 'closings', 'receipts', 'payments', 'payouts', 'expenses', 'notices', 'certificates', 'config'];
const BIZ = 'Academia Arcoíris (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

export async function createDemoTenant(uid) {
  const expiresAt = Timestamp.fromMillis(Date.now() + DEMO_MINUTES * 60 * 1000);
  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();
  const ref = (name, id) => doc(db, 'tenants', uid, name, id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, slogan: 'Idiomas, música, tecnología y arte para toda la familia', rif: 'J-50123456-7', manager: 'Lcda. Mariana Quintero',
    phone: '0241-8251234', whatsapp: '0414-4251234', email: 'demo@sanoacademia.app', address: 'Av. Bolívar Norte, C.C. Las Acacias, nivel 2, Valencia',
    dueDay: 5, enrollFee: 15, siblingPct: 10, lateFee: { enabled: true, mode: 'fijo', value: 3 }, grades: { max: 20, pass: 10 }, invoicePrefix: 'M',
    rooms: ROOMS_DEFAULT,
    banks: [
      { id: 'k1', type: 'pagomovil', bank: 'Banesco (0134)', phone: '0414-4251234', idDoc: 'J-50123456-7', holder: 'Academia Arcoíris, C.A.', active: true },
      { id: 'k2', type: 'transferencia', bank: 'Mercantil', number: '0105-0000-11-0000654321', holder: 'Academia Arcoíris, C.A.', idDoc: 'J-50123456-7', active: true },
      { id: 'k3', type: 'zelle', email: 'pagos@arcoiris-demo.com', holder: 'Arcoiris Academy LLC', active: true },
      { id: 'k4', type: 'efectivo', active: true }
    ],
    receiptNote: 'Paga la mensualidad antes del día 5 y evita el recargo. Reporta tu pago desde el portal del alumno.',
    portal: { enabled: true, reports: true, grades: true, attendance: true, requests: true, teachers: true, enroll: true },
    catalogCode: genCode(6)
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 8000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}
function rng(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const NAMES = ['Sofía Valentina Rojas', 'Diego Alejandro Rojas', 'Camila Andrea Pérez', 'Santiago José Díaz', 'Valeria Gabriela Márquez', 'Mateo Andrés Salazar', 'Isabella Lucía Gómez', 'Sebastián David Briceño',
  'Mariana Sofía Rivas', 'Samuel Elías Hernández', 'Victoria Alejandra Mora', 'Emiliano José Castillo', 'Lucía Fernanda Suárez', 'Gabriel Antonio Ortiz', 'Antonella Medina', 'Thiago Medina',
  'Daniela Paola Contreras', 'Joaquín Ramírez', 'Paula Andrea Morales', 'Nicolás Fuentes', 'Ariana Villalobos', 'Martín Gutiérrez', 'Renata Bravo', 'Leonardo Quintero',
  'Carlos Eduardo Landaeta', 'María José Chacón', 'Andrés Felipe Arias', 'Gabriela Pacheco', 'José Miguel Lugo', 'Andrea Carolina Montilla', 'Luis Enrique Colmenares', 'Patricia Rangel',
  'Ricardo Peña', 'Verónica Mendoza', 'Fernando Escalona', 'Laura Aponte', 'Héctor Nieves', 'Elena Sánchez', 'Rafael Torres', 'Carolina Silva',
  'Juan Pablo Ferrer', 'Alejandra Vargas', 'Miguel Ángel Rondón', 'Natalia Paredes', 'Óscar Linares', 'Fabiana Ochoa', 'Eduardo Blanco', 'Rosa Elena Pineda',
  'Ana Victoria León', 'Manuel Herrera', 'Valentina Guerra', 'Javier Sandoval', 'Luciana Prieto', 'Alejandro Duarte', 'Emma Carvajal', 'Benjamín Zambrano',
  'Sara Lucía Requena', 'Tomás Urdaneta', 'Mía Salcedo', 'Adrián Becerra', 'Julieta Moreno', 'Matías Rincón', 'Daniel Ignacio Vera', 'Clara Ibáñez'];
const GUARDIANS = ['Andreína Rojas de Mora', 'Carlos Pérez', 'Yelitza Díaz', 'Marisol Márquez', 'Rubén Salazar', 'Karina Gómez', 'Ángel Briceño', 'Luisana Rivas', 'Henry Hernández', 'Beatriz Mora', 'Omar Castillo', 'Milagros Suárez', 'Wilmer Ortiz', 'Yuleidy Medina'];
// Conducta de pago por índice de alumno
const DEBTOR = new Set([5, 18, 33]);
const LATE = new Set([9, 27, 44]);
const PARTIAL = new Set([12, 50]);
const ABSENT = new Set([7, 31]);

export async function seedDemoActivity() {
  const money = (v) => scaleUSD(v);
  const R = rng(23);
  const p0 = currentPeriod();
  const P = [addMonths(p0, -3), addMonths(p0, -2), addMonths(p0, -1)];
  const day = (p, d) => `${p}-${String(Math.min(28, d)).padStart(2, '0')}`;
  const phone = () => `04${['14', '24', '12', '16', '26'][Math.floor(R() * 5)]}-${String(1000000 + Math.floor(R() * 8999999))}`;
  const today = todayKey();

  // 1) Profesores
  const T = {};
  for (const [k, name, specialty, payMode, rate] of [
    ['t1', 'Andreína Rojas', 'Inglés infantil', 'hora', 8], ['t2', 'Daniel Herrera', 'Inglés para adultos', 'hora', 9], ['t3', 'Luis «Lucho» Marcano', 'Guitarra y piano', 'clase', 12],
    ['t4', 'Ing. Carla Pérez', 'Computación y Excel', 'fijo', 380], ['t5', 'Ing. Miguel Ángel Soto', 'Robótica y matemática', 'pct', 40], ['t6', 'Valentina Ochoa', 'Arte y ballet', 'hora', 7]]) {
    T[k] = (await saveTeacher({ name, specialty, payMode, rate: payMode === 'pct' ? rate : money(rate), phone: phone(), idDoc: `V-${12 + Math.floor(R() * 14)}.${100 + Math.floor(R() * 899)}.${100 + Math.floor(R() * 899)}`, bank: 'Pago móvil Banesco ' + phone() })).id;
  }
  // 2) Cursos
  const C = {};
  for (const [k, name, category, level, fee, hours, months, description] of [
    ['c1', 'Inglés para niños', 'idiomas', 'Niños 7 a 11 años', 35, 96, 6, 'Aprenden inglés jugando: canciones, cuentos y conversación. Material incluido.'],
    ['c2', 'Inglés conversacional', 'idiomas', 'Adultos · Intermedio', 45, 120, 6, 'Habla con fluidez para el trabajo y los viajes. Grupos reducidos y clubes de conversación.'],
    ['c3', 'Guitarra', 'musica', 'Todos los niveles', 40, 72, 6, 'Acordes, ritmos y tus canciones favoritas desde la primera clase.'],
    ['c4', 'Piano', 'musica', 'Niños y adultos', 50, 48, 6, 'Lectura musical, técnica e interpretación. Grupos de máximo 4 alumnos.'],
    ['c5', 'Computación y Excel', 'computacion', 'Adultos', 40, 64, 4, 'Windows, Word, Excel de básico a tablas dinámicas, y herramientas de Google.'],
    ['c6', 'Robótica para niños', 'programacion', 'Niños 8 a 13 años', 55, 64, 4, 'Arman y programan robots con bloques y Arduino. Desarrolla lógica y creatividad.'],
    ['c7', 'Dibujo y pintura', 'arte', 'Niños y jóvenes', 30, 48, 6, 'Técnicas de lápiz, acuarela y acrílico. Exposición de fin de curso.'],
    ['c8', 'Matemática preuniversitaria', 'preu', 'Bachilleres', 60, 72, 3, 'Preparación para pruebas de admisión: álgebra, geometría y razonamiento.'],
    ['c9', 'Ballet infantil', 'danza', 'Niñas 5 a 10 años', 35, 48, 6, 'Postura, coordinación y expresión. Presentación de fin de año.']]) {
    C[k] = (await saveCourse({ name, category, level, monthlyFee: money(fee), enrollFee: '', hours, months, description })).id;
  }
  await waitFor(() => store.courses.length >= 9 && store.teachers.length >= 6);

  // 3) Grupos con horario (sin choques)
  const start = day(P[0], 1);
  const ev = (list) => list.map(([name, weight, d], i) => ({ id: 'e' + (i + 1), name, weight, date: d }));
  const EV_STD = ev([['Parcial 1', 25, day(P[1], 20)], ['Parcial 2', 25, day(P[2], 20)], ['Proyecto', 20, day(p0, 25)], ['Examen final', 30, dayKey(addDays(new Date(), 40))]]);
  const EV_LANG = ev([['Expresión oral', 30, day(P[1], 22)], ['Prueba escrita', 30, day(P[2], 18)], ['Tareas y participación', 20, day(p0, 20)], ['Examen final', 20, dayKey(addDays(new Date(), 45))]]);
  const EV_ART = ev([['Técnica', 30, day(P[1], 25)], ['Ensayos y participación', 30, day(P[2], 25)], ['Presentación final', 40, dayKey(addDays(new Date(), 50))]]);
  const EV_XL = ev([['Práctica Word', 25, day(P[0], 25)], ['Práctica Excel', 35, day(P[1], 25)], ['Proyecto final', 40, day(P[2], 12)]]);
  const S = (day0, from, to) => ({ day: day0, from, to });
  const G = {};
  const groupsDef = [
    ['g1a', 'c1', 'Grupo A', 't1', 'aula1', 12, [S(1, '15:00', '16:30'), S(3, '15:00', '16:30')], EV_LANG],
    ['g1b', 'c1', 'Grupo B', 't1', 'aula1', 12, [S(2, '15:00', '16:30'), S(4, '15:00', '16:30')], EV_LANG],
    ['g2n', 'c2', 'Nocturno', 't2', 'aula1', 12, [S(1, '18:30', '20:00'), S(3, '18:30', '20:00')], EV_LANG],
    ['g2s', 'c2', 'Sabatino', 't2', 'aula2', 12, [S(6, '09:00', '12:00')], EV_LANG],
    ['g3', 'c3', 'Tarde', 't3', 'salon', 8, [S(2, '16:00', '17:30'), S(4, '16:00', '17:30')], EV_ART],
    ['g4', 'c4', 'Grupo reducido', 't3', 'salon', 6, [S(1, '16:00', '17:00'), S(3, '16:00', '17:00')], EV_ART],
    ['g5m', 'c5', 'Mañana', 't4', 'lab', 10, [S(2, '09:00', '11:00'), S(4, '09:00', '11:00')], EV_STD],
    ['g6s', 'c6', 'Sábados', 't4', 'lab', 10, [S(6, '13:00', '15:00')], EV_STD],
    ['g6f', 'c6', 'Viernes', 't5', 'lab', 10, [S(5, '15:00', '17:00')], EV_STD],
    ['g7', 'c7', 'Viernes', 't6', 'aula2', 12, [S(5, '15:00', '17:00')], EV_ART],
    ['g8', 'c8', 'Intensivo', 't5', 'aula2', 15, [S(1, '17:00', '18:30'), S(3, '17:00', '18:30'), S(5, '17:15', '18:45')], EV_STD],
    ['g9', 'c9', 'Pre-ballet', 't6', 'salon', 12, [S(2, '17:30', '18:30'), S(4, '17:30', '18:30')], EV_ART],
    ['gxl', 'c5', 'Excel intensivo', 't4', 'lab', 10, [S(6, '09:00', '12:00')], EV_XL, day(P[2], 15)],
    ['g2new', 'c2', 'Nuevo grupo nocturno', 't2', 'aula2', 12, [S(2, '18:30', '20:00'), S(4, '18:30', '20:00')], [], null, `${addMonths(p0, 1)}-01`, 'abierto']
  ];
  for (const [k, c, name, t, room, capacity, schedule, evals, endDate, startDate, status] of groupsDef) {
    G[k] = (await saveGroup({ courseId: C[c], name, teacherId: T[t], room, capacity, schedule, evals, startDate: startDate || start, endDate: endDate || '', status: status || 'en_curso' }, null, { force: true })).id;
  }
  await waitFor(() => store.groups.length >= groupsDef.length);

  // 4) Alumnos: grupo principal y algunos en dos cursos
  const plan = [['g1a', 7], ['g1b', 6], ['g2n', 6], ['g2s', 5], ['g3', 5], ['g4', 4], ['g5m', 5], ['g6s', 5], ['g6f', 3], ['g7', 4], ['g8', 5], ['g9', 8]];
  const kidG = new Set(['g1a', 'g1b', 'g6s', 'g6f', 'g7', 'g9']);
  const teenG = new Set(['g8']);
  const rows = [];
  let n = 0;
  for (const [gk, cnt] of plan) for (let i = 0; i < cnt; i++) rows.push({ i: n, name: NAMES[n++], gk });
  const second = { 0: 'g6s', 2: 'g7', 3: 'g6f', 8: 'g9', 10: 'g7', 14: 'g9', 15: 'g6f', 20: 'g8', 24: 'gxl', 25: 'gxl', 26: 'gxl', 34: 'gxl', 21: 'g3', 39: 'g4' };
  const enrollOf = (i) => (i % 9 === 4 ? day(P[1], 3 + (i % 7)) : i % 13 === 6 ? day(P[2], 2 + (i % 9)) : i >= 60 ? day(p0, 2) : day(P[0], 1 + (i % 9)));
  let seq = Number(store.counters.student) || 0;
  const sOps = [];
  const sib = { 0: 0, 1: 0, 14: 13, 15: 13 }; // hermanos: Rojas (0,1) y Medina (14,15)
  for (const r of rows) {
    const kid = kidG.has(r.gk); const teen = teenG.has(r.gk);
    const age = kid ? 6 + Math.floor(R() * 7) : teen ? 16 + Math.floor(R() * 2) : 19 + Math.floor(R() * 30);
    const bd = new Date(); bd.setFullYear(bd.getFullYear() - age); bd.setDate(bd.getDate() + Math.floor(R() * 360) - 180);
    if (r.i === 3 || r.i === 46) bd.setTime(addDays(new Date(new Date().getFullYear() - age, new Date().getMonth(), new Date().getDate()), r.i === 3 ? 0 : 3).getTime());
    const minor = age < 18;
    const gi = sib[r.i] != null ? sib[r.i] : r.i % GUARDIANS.length;
    const gPhone = sib[r.i] != null ? ['0414-4401122', '0424-7783344'][r.i < 10 ? 0 : 1] : phone();
    const ref = store.newRef('students');
    const groupIds = [G[r.gk]];
    if (second[r.i]) groupIds.push(G[second[r.i]]);
    const d = {
      name: r.name, idDoc: minor && age < 9 ? '' : `V-${minor ? 30 + Math.floor(R() * 4) : 10 + Math.floor(R() * 20)}.${100 + Math.floor(R() * 899)}.${100 + Math.floor(R() * 899)}`,
      birthDate: dayKey(bd), gender: '', phone: minor ? '' : phone(), email: minor ? '' : `${r.name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}${r.i}@correo.com`, address: '', school: kid ? ['U.E. Colegio Don Bosco', 'U.E. Los Robles', 'Colegio San José'][r.i % 3] : '',
      guardianName: minor ? GUARDIANS[gi] : '', guardianPhone: minor ? gPhone : '', guardianRelation: minor ? (r.i % 3 ? 'Madre' : 'Padre') : '', guardianIdDoc: '', health: r.i === 8 ? 'Asma leve: tiene su inhalador en el bolso.' : '', notes: '',
      discountPct: r.i === 11 ? 50 : r.i === 29 ? 25 : 0, discountReason: r.i === 11 ? 'Beca académica' : r.i === 29 ? 'Convenio empresa' : '', howFound: ['Instagram', 'Recomendación', 'Pasaba por aquí', 'Google', 'WhatsApp'][r.i % 5],
      code: fmtSeq('A', ++seq, 4), billed: 0, paid: 0, ledger: [], groupIds, status: r.i === 46 || r.i === 47 ? 'activo' : 'activo', createdAt: nowISO(), enrolledAt: enrollOf(r.i), portalCode: genCode(8), updatedAt: nowISO()
    };
    r.id = ref.id;
    sOps.push((b) => b.set(ref, d));
  }
  sOps.push((b) => b.set(store.ref('config', 'counters'), { student: seq }, { merge: true }));
  store.counters = { ...store.counters, student: seq };
  await chunked(sOps);
  await waitFor(() => store.students.length >= rows.length);
  const idOf = (i) => rows[i]?.id;

  // 5) Tres meses: mensualidades → pagos según la conducta de cada alumno
  const rate = Number(store.settings.fx?.enabled && store.settings.fx.rate) || 0;
  const methods = rate ? ['pagomovil', 'pagomovil', 'transferencia', 'zelle', 'efectivo_usd', 'pagomovil'] : ['transferencia', 'transferencia', 'zelle', 'efectivo'];
  const banks = ['Banesco', 'Mercantil', 'Venezuela', 'Provincial', 'BNC', 'Bancamiga'];
  let pSeq = Number(store.counters.payment) || 0;
  const payBatch = async (pays) => {
    const paidBy = {};
    const ops = [];
    for (const x of pays.sort((a, b) => a.date.localeCompare(b.date))) {
      const s = store.student(x.id); if (!s) continue;
      const before = (Number(s.paid) || 0) + (paidBy[x.id] || 0);
      const led = ledgerStatus({ ...s, paid: before });
      const applied = []; let left = x.amount;
      for (const c of led) { if (left <= 0.009) break; if (c.rest <= 0.009) continue; const a = round2(Math.min(left, c.rest)); applied.push({ n: c.n, p: c.p, k: c.k, amount: a }); left = round2(left - a); }
      paidBy[x.id] = round2((paidBy[x.id] || 0) + x.amount);
      const method = methods[Math.floor(R() * methods.length)];
      const isBs = rate && ['pagomovil', 'transferencia'].includes(method);
      const num = fmtSeq('P', ++pSeq, 6);
      ops.push((b) => b.set(store.newRef('payments'), { studentId: s.id, studentCode: s.code, studentName: s.name, amount: x.amount, date: x.date, method, bank: method.startsWith('efectivo') ? '' : banks[Math.floor(R() * banks.length)], reference: method.startsWith('efectivo') ? '' : String(10000000 + Math.floor(R() * 89999999)), amountBs: isBs ? round2(x.amount * rate) : 0, rate: isBs ? rate : 0, payer: s.guardianName || s.name, note: '', status: 'confirmado', number: num, applied, advance: left > 0.009 ? left : 0, source: R() < 0.5 ? 'portal' : 'oficina', inboxId: '', createdAt: `${x.date}T${String(12 + Math.floor(R() * 9)).padStart(2, '0')}:${String(Math.floor(R() * 59)).padStart(2, '0')}:00.000Z`, by: 'demo' }));
    }
    for (const [id, v] of Object.entries(paidBy)) { const last = pays.filter((x) => x.id === id).map((x) => x.date).sort().pop(); ops.push((b) => b.set(store.ref('students', id), { paid: store.inc(v), lastPaymentAt: last, updatedAt: nowISO() }, { merge: true })); }
    ops.push((b) => b.set(store.ref('config', 'counters'), { payment: pSeq }, { merge: true }));
    store.counters = { ...store.counters, payment: pSeq };
    await chunked(ops, 60);
    await waitFor(() => Object.entries(paidBy).every(([id]) => store.student(id)?.lastPaymentAt), 6000);
  };
  const dueIn = (s, p) => round2(ledgerStatus(s).filter((x) => x.p === p).reduce((a, x) => a + x.rest, 0));
  const PM = [...P, p0];
  const dueNow = today.slice(8) > '05' ? dayKey(addDays(new Date(), 4)) : null;
  for (let m = 0; m < 4; m++) {
    try { await emitMonthly(PM[m], m === 3 && dueNow ? { dueDate: dueNow } : {}); } catch (e) { console.warn('[demo] mensualidades', e); }
    await waitFor(() => !!store.closing(PM[m]) && rows.some((r) => (store.student(r.id)?.ledger || []).some((x) => x.p === PM[m])), 8000);
    await new Promise((r) => setTimeout(r, 300));
    const pays = [];
    for (const r of rows) {
      const s = store.student(r.id); if (!s) continue;
      const d = dueIn(s, PM[m]);
      if (m === 3) { // mes en curso: algo más de la mitad ya pagó
        if (DEBTOR.has(r.i) || LATE.has(r.i) || PARTIAL.has(r.i) || d <= 0.009 || R() > 0.58) continue;
        const dd = Math.min(Number(today.slice(8)), 1 + Math.floor(R() * 6));
        pays.push({ id: r.id, date: day(p0, dd), amount: d }); continue;
      }
      if (DEBTOR.has(r.i)) { if (r.i === 33 && m === 0) pays.push({ id: r.id, date: day(P[1], 9), amount: round2(d * 0.5) }); continue; }
      if (LATE.has(r.i)) { if (m === 2) { const all = round2(ledgerStatus(s).reduce((a, x) => a + x.rest, 0)); if (all > 0) pays.push({ id: r.id, date: dayKey(addDays(new Date(), -2 - (r.i % 4))), amount: all }); } continue; }
      if (PARTIAL.has(r.i)) { if (d > 0) pays.push({ id: r.id, date: day(m < 2 ? P[m] : p0, 8), amount: round2(d * (m === 2 ? 0.5 : 1)) }); continue; }
      if (d <= 0.009) continue;
      if (m === 2 && R() < 0.18) continue; // aún no paga el mes pasado
      const late = R() < 0.15;
      pays.push({ id: r.id, date: m === 2 && late ? dayKey(addDays(new Date(), -Math.floor(R() * 6))) : late ? day(P[m], 9 + Math.floor(R() * 12)) : day(P[m], 1 + Math.floor(R() * 5)), amount: d });
    }
    await payBatch(pays.filter((x) => x.amount > 0.009 && x.date <= today));
    if (m === 0) { // Dos alumnos se retiran después del primer mes
      const b = store.batch();
      for (const i of [40, 57]) b.set(store.ref('students', idOf(i)), { status: 'retirado', retiredAt: day(P[1], 3), updatedAt: nowISO() }, { merge: true });
      await store.commit(b);
    }
    if (m === 1) await store.save('students', idOf(22), { status: 'pausado', updatedAt: nowISO() });
  }
  await store.save('groups', G.gxl, { status: 'finalizado', updatedAt: nowISO() });
  const egr = store.batch();
  for (const i of [35, 36]) egr.set(store.ref('students', idOf(i)), { groupIds: [G.gxl], status: 'egresado', graduatedAt: day(P[2], 16), updatedAt: nowISO() }, { merge: true });
  await store.commit(egr);

  // 6) Asistencia desde el mes antepasado hasta ayer (hoy queda para pasar lista)
  const attFrom = day(P[1], 1);
  const yest = dayKey(addDays(new Date(), -1));
  const aOps = [];
  for (const g of store.groups) {
    if (g.status === 'abierto') continue;
    const roster = store.students.filter((s) => (s.groupIds || []).includes(g.id) && s.status !== 'retirado');
    for (const d of classDates(g, attFrom, yest)) {
      const marks = {};
      for (const s of roster) {
        if ((s.enrolledAt || '') > d) continue;
        const r = rows.find((x) => x.id === s.id);
        const x = R();
        marks[s.id] = ABSENT.has(r?.i) ? (x < 0.42 ? 'A' : x < 0.5 ? 'T' : 'P') : x < 0.86 ? 'P' : x < 0.93 ? 'T' : x < 0.98 ? 'A' : 'J';
      }
      const sl = slotsOn(g, new Date(d + 'T12:00:00').getDay());
      const hours = round2(sl.reduce((a, s) => a + slotHours(s), 0));
      aOps.push((b) => b.set(store.ref('attendance', `${g.id}_${d}`), { groupId: g.id, date: d, marks, topic: '', teacherId: g.teacherId || '', hours, via: R() < 0.4 ? 'profesor' : 'oficina', updatedAt: nowISO(), by: 'demo' }));
    }
  }
  await chunked(aOps, 80);

  // 7) Notas de las evaluaciones ya presentadas
  const gOps = [];
  for (const g of store.groups) {
    const scores = {};
    const roster = store.students.filter((s) => (s.groupIds || []).includes(g.id));
    for (const e of g.evals || []) {
      if (!e.date || e.date > today) continue;
      scores[e.id] = {};
      for (const s of roster) { if ((s.enrolledAt || '') > e.date) continue; const r = rows.find((x) => x.id === s.id); const base = ABSENT.has(r?.i) ? 9 : r?.i % 7 === 0 ? 18 : 14.5; scores[e.id][s.id] = Math.max(4, Math.min(20, Math.round((base + (R() * 6 - 3)) * 2) / 2)); }
    }
    if (Object.keys(scores).length) gOps.push((b) => b.set(store.ref('grades', g.id), { scores, updatedAt: nowISO() }));
  }
  await chunked(gOps);
  await waitFor(() => store.attendance.length > 50 && store.grades.length > 5, 8000);

  // 8) Pagos a profesores: el mes antepasado completo, el pasado a casi todos
  try {
    for (const t of store.liveTeachers) {
      const a = teacherPay(t, P[1]);
      if (a.amount > 0) await payTeacher(t, { period: P[1], amount: a.amount, method: 'pagomovil', reference: String(30000000 + Math.floor(R() * 9999999)), date: day(P[2], 3), detail: `Honorarios ${periodName(P[1])} · ${a.classes} clase(s), ${a.hours} h` });
    }
    for (const t of store.liveTeachers.slice(0, 4)) {
      const a = teacherPay(t, P[2]);
      if (a.amount > 0) await payTeacher(t, { period: P[2], amount: a.amount, method: 'transferencia', reference: String(30000000 + Math.floor(R() * 9999999)), date: day(p0, 3) > today ? today : day(p0, 3), detail: `Honorarios ${periodName(P[2])} · ${a.classes} clase(s), ${a.hours} h` });
    }
  } catch (e) { console.warn('[demo] profesores', e); }

  // 9) Gastos de la academia
  try {
    const EXP = [['alquiler', 'Alquiler del local', 450, 1], ['servicios', 'Electricidad y agua', 70, 6], ['servicios', 'Internet fibra 300 Mb', 35, 8], ['materiales', 'Material didáctico y fotocopias', 55, 10], ['publicidad', 'Publicidad en Instagram', 40, 12], ['mantenimiento', 'Limpieza y artículos de aseo', 30, 15], ['bancarios', 'Comisiones bancarias', 9, 27]];
    const eOps = [];
    let eSeq = Number(store.counters.expense) || 0;
    const add = (p, [category, concept, amt, d]) => { const v = round2(money(amt) * (0.95 + R() * 0.1)); const date = day(p, d); if (date > today) return; eOps.push((b) => b.set(store.newRef('expenses'), { period: p, date, category, concept, supplier: '', amount: v, method: 'transferencia', reference: '', status: 'activo', number: fmtSeq('G', ++eSeq), createdAt: nowISO(), updatedAt: nowISO(), by: 'demo' })); };
    for (const p of P) EXP.forEach((x) => add(p, x));
    EXP.slice(0, 4).forEach((x) => add(p0, x));
    add(P[1], ['equipos', 'Kit de robótica Arduino (x4)', 220, 14]);
    add(P[2], ['equipos', 'Afinación del piano', 45, 19]);
    eOps.push((b) => b.set(store.ref('config', 'counters'), { expense: eSeq }, { merge: true }));
    store.counters = { ...store.counters, expense: eSeq };
    await chunked(eOps);
  } catch (e) { console.warn('[demo] gastos', e); }

  // 10) Certificados del grupo que terminó
  try {
    const gx = store.group(G.gxl);
    const sc = store.gradesOf(G.gxl);
    for (const s of store.students.filter((x) => (x.groupIds || []).includes(G.gxl)).slice(0, 5)) {
      const avg = studentAverage(gx, sc, s.id);
      if (avg == null || avg >= 10) await issueCertificate(s, gx, { grade: avg, date: day(P[2], 16), hours: 36, mention: avg >= 17 ? 'Con mención honorífica' : '' });
    }
  } catch (e) { console.warn('[demo] certificados', e); }

  // 11) Comunicados
  try {
    await saveNotice({ kind: 'feriado', title: 'No habrá clases el lunes', body: 'El próximo lunes no habrá clases por el feriado. Las clases de los grupos de lunes se recuperan el sábado en la tarde. ¡Disfruten el descanso!', target: '', date: dayKey(addDays(new Date(), -1)), until: dayKey(addDays(new Date(), 7)), pinned: true });
    await saveNotice({ kind: 'evento', title: 'Recital de fin de año 🎸🩰', body: 'Los alumnos de guitarra, piano y ballet se presentarán el sábado 13 a las 4:00 p.m. en el salón de la academia. Cada alumno puede traer 3 invitados.', target: `c:${C.c3}`, date: dayKey(addDays(new Date(), -4)) });
    await saveNotice({ kind: 'examen', title: 'Semana de evaluaciones', body: 'La próxima semana se presentan las pruebas del período. Revisen el plan de evaluación en el portal y repasen los temas vistos. ¡Éxito!', target: `g:${G.g8}`, date: dayKey(addDays(new Date(), -2)) });
    await saveNotice({ kind: 'aviso', title: '¡Inscripciones abiertas! Nuevo grupo nocturno de inglés', body: 'Abrimos un nuevo grupo de Inglés conversacional martes y jueves de 6:30 a 8:00 p.m. Cupos limitados: inscríbete en línea o en la recepción.', target: '', date: dayKey(addDays(new Date(), -6)) });
  } catch (e) { console.warn('[demo] comunicados', e); }

  // 12) Bandeja: pagos reportados, justificativos, solicitudes y preinscripciones en línea
  try {
    const b = store.batch();
    const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
    const inbox = (s, type, data, minsAgo) => b.set(store.newInboxRef(), { tenantId: store.tenantId, code: s?.portalCode || '', who: s?.id || '', studentCode: s?.code || '', studentName: s?.name || '', type, status: 'nueva', name: s ? (s.guardianName || s.name) : '', phone: s ? (s.guardianPhone || s.phone || '') : '', createdAt: ago(minsAgo), ...data });
    const pend = rows.map((r) => store.student(r.id)).filter((s) => s && s.status === 'activo' && !DEBTOR.has(rows.find((r) => r.id === s.id).i) && (s.billed - (s.paid || 0)) > 1);
    pend.slice(0, 2).forEach((s, i) => { const amt = round2(s.billed - s.paid); inbox(s, 'pago', { amount: amt, amountBs: rate ? round2(amt * rate) : null, rate: rate || null, method: rate ? 'pagomovil' : 'transferencia', date: today, bank: ['Banesco', 'Mercantil'][i], reference: String(40000000 + Math.floor(R() * 9999999)), note: i === 0 ? `Mensualidad de ${periodName(P[2]).toLowerCase()}` : '' }, 25 + i * 110); });
    const ab = store.student(idOf(7));
    inbox(ab, 'solicitud', { category: 'justificativo', text: 'No pudo asistir el miércoles porque tuvo fiebre. Tenemos el récipe médico.', date: dayKey(addDays(new Date(), -5)) }, 60);
    inbox(store.student(idOf(20)), 'solicitud', { category: 'constancia', text: 'Necesito una constancia de estudios para el trabajo, por favor.', status: 'en_proceso', reply: 'La tendremos lista el viernes en la recepción.' }, 1500);
    inbox(store.student(idOf(3)), 'solicitud', { category: 'horario', text: '¿Puede pasar al grupo de los sábados? Los viernes tiene natación.', status: 'resuelta', reply: 'Listo: desde el próximo sábado está en el grupo Sábados.' }, 9000);
    const g2new = store.group(G.g2new); const c1 = store.course(C.c1);
    const pre = (data, minsAgo, status = 'nueva') => b.set(store.newInboxRef(), { tenantId: store.tenantId, code: store.settings.catalogCode || '', type: 'inscripcion', status, createdAt: ago(minsAgo), idDoc: '', email: '', guardianName: '', guardianPhone: '', note: '', birthDate: '', ...data });
    pre({ courseId: C.c2, courseName: 'Inglés conversacional', groupId: G.g2new, groupText: `${g2new?.name || ''} · Mar y Jue 6:30 p. m.`, name: 'Karla Fernández', idDoc: 'V-24.556.781', phone: phone(), email: 'karla.f@correo.com', birthDate: '1996-03-14', note: 'Tengo nivel básico' }, 35);
    pre({ courseId: C.c2, courseName: 'Inglés conversacional', groupId: G.g2new, groupText: `${g2new?.name || ''} · Mar y Jue 6:30 p. m.`, name: 'Jesús Alberto Rivero', phone: phone(), birthDate: '1989-11-02' }, 260);
    pre({ courseId: C.c1, courseName: c1?.name || 'Inglés para niños', groupId: G.g1b, groupText: 'Grupo B · Mar y Jue 3:00 p. m.', name: 'Lucas Mendoza', birthDate: `${new Date().getFullYear() - 8}-06-21`, guardianName: 'Paola Mendoza', guardianPhone: phone(), note: 'Viene de otro instituto' }, 2900, 'contactada');
    await store.commit(b);
  } catch (e) { console.warn('[demo] bandeja', e); }
}

/** Borra todos los datos de una cuenta: sus portales públicos, catálogo, certificados, su bandeja y sus colecciones. */
export async function purgeTenant(tenantId, onlyDemo = true, codes = null, extra = {}) {
  const del = async (refs) => { for (let i = 0; i < refs.length; i += 80) { const b = writeBatch(db); refs.slice(i, i + 80).forEach((r) => b.delete(r)); await b.commit().catch((e) => console.warn('[purge]', e?.code || e)); } };
  try {
    let list = codes;
    if (!list) {
      const [st, te] = await Promise.all([getDocs(collection(db, 'tenants', tenantId, 'students')), getDocs(collection(db, 'tenants', tenantId, 'teachers'))]);
      list = [...st.docs, ...te.docs].map((d) => d.data().portalCode).filter(Boolean);
    }
    await del(list.map((c) => doc(db, 'portals', c)));
  } catch (e) { console.warn('[purge] portales', e?.code || e); }
  try {
    let catalog = extra.catalog;
    if (catalog === undefined) { const s = await getDoc(doc(db, 'tenants', tenantId, 'config', 'settings')); catalog = s.exists() ? s.data().catalogCode : ''; }
    if (catalog) await del([doc(db, 'catalogs', catalog)]);
    let certs = extra.certs;
    if (!certs) { const cs = await getDocs(collection(db, 'tenants', tenantId, 'certificates')); certs = cs.docs.map((d) => d.data().verify).filter(Boolean); }
    await del(certs.map((c) => doc(db, 'certs', c)));
  } catch (e) { console.warn('[purge] catálogo/certificados', e?.code || e); }
  try {
    const rq = await getDocs(query(collection(db, 'inbox'), where('tenantId', '==', tenantId)));
    await del(rq.docs.map((d) => d.ref));
  } catch (e) { console.warn('[purge] bandeja', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try { const snap = await getDocs(collection(db, 'tenants', tenantId, c)); await del(snap.docs.map((d) => d.ref)); }
    catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] cuenta', e?.code || e); }
  }
}

export async function cleanupDemo(tenantId, codes = null, extra = {}) {
  await purgeTenant(tenantId, true, codes && codes.length ? codes : null, extra);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
