// SanoAcademia — Prueba de punta a punta contra los emuladores (datos creados por test-emu.sh)
// Uso: node e2e.mjs [url=http://127.0.0.1:5181] [carpeta de capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.argv[2] || 'http://127.0.0.1:5181';
const BASE = ORIGIN + '/?emu=1';
const OUT = path.resolve(here, process.argv[3] || 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; let passed = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? '  ✔' : '  ✘', name, extra); if (cond) passed++; else fails++; };
const errs = [];
const logs = [];
const near = (a, b, tol = 0.02) => Math.abs(Number(a) - Number(b)) <= tol;

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function newPage(w = 1366, h = 860) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(`${e.message} @ ${(e.stack || '').split(String.fromCharCode(10)).slice(1, 3).join(' ').trim()}`));
  p.on('dialog', (d) => d.accept());
  p.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(m.text()); });
  return { ctx, p };
}
// Ejecuta una función con acceso a los módulos de la app
const run = (p, fn, arg = null) => p.evaluate(async (src, a) => {
  const M = { store: (await import('/js/store.js')).store, ops: await import('/js/ops.js'), utils: await import('/js/utils.js'), aca: await import('/js/academy.js'), f: await import('/js/firebase.js') };
  M.wait = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } return f(); };
  return (0, eval)(src)(M, a);
}, fn.toString(), arg);
const go = async (p, route) => { await p.evaluate((r) => { location.hash = '#/' + r; }, route); await sleep(1100); };
const lastModalBtn = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(`.modal ${s}`)].pop()?.click(), sel);
const maybePin = async (p, value = acc.sede01.pin) => {
  const h = await p.waitForSelector('.modal [data-pin]', { timeout: 2500 }).catch(() => null);
  if (!h) return;
  await p.type('.modal [data-pin]', value);
  await lastModalBtn(p, '[data-ok]');
  await sleep(900);
};
const pickCountry = async (p, code) => {
  await p.waitForSelector(`.country-grid [data-c="${code}"]`, { timeout: 60000 });
  await p.click(`.country-grid [data-c="${code}"]`); await sleep(250);
  await lastModalBtn(p, '[data-ok]');
  await sleep(1500);
};
const login = async (p, user, pass) => {
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#login-form', { timeout: 30000 });
  await p.type('#lg-user', user); await p.type('#lg-pass', pass); await p.click('#lg-btn');
};
// Página pública (portal, profesor, inscripción, certificado) sin sesión, tamaño teléfono
const publicPage = async (url) => {
  const q = await newPage(390, 844);
  await q.p.goto(ORIGIN + url + '?emu=1', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  return q;
};
const VIEWS = ['inicio', 'horario', 'asistencia', 'notas', 'alumnos', 'profesores', 'cursos', 'inscripciones', 'mensualidades', 'cobranza', 'gastos', 'comunicados', 'solicitudes', 'certificados', 'reportes', 'ajustes'];

try {
  // ==================================================================
  console.log('1) Inicio de sesión y país');
  const A = await newPage();
  const p = A.p;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#login-form');
  await p.screenshot({ path: path.join(OUT, '01-login.png') });
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await pickCountry(p, 'VE');
  await p.waitForSelector('.sb-nav', { timeout: 30000 });
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const r1 = await run(p, ({ store }) => ({ c: store.settings.country, cur: store.settings.currency, name: store.businessName }));
  ok('sede01 entra con su usuario y elige Venezuela', r1.c === 'VE', JSON.stringify(r1));
  await p.screenshot({ path: path.join(OUT, '02-inicio-vacio.png') });

  // ==================================================================
  console.log('2) Configuración, profesores, cursos y grupos sin choques');
  const r2 = await run(p, async ({ store, ops, wait }) => {
    await store.saveSettings({ businessName: 'Instituto Las Acacias', siblingPct: 10, enrollFee: 10, dueDay: 5, lateFee: { enabled: true, mode: 'fijo', value: 3 }, grades: { max: 20, pass: 10 },
      fx: { enabled: true, sym: 'Bs', name: 'Bolívares', rate: 40, updatedAt: new Date().toISOString() },
      banks: [{ id: 'k1', type: 'pagomovil', bank: 'Banesco', phone: '04141234567', idDoc: 'J-1234', holder: 'Instituto', active: true }],
      portal: { enabled: true, reports: true, grades: true, attendance: true, requests: true, teachers: true, enroll: true } });
    const t1 = await ops.saveTeacher({ name: 'Ana Profe', payMode: 'hora', rate: 10, phone: '04141112233' });
    const t2 = await ops.saveTeacher({ name: 'Beto Profe', payMode: 'clase', rate: 15 });
    const c1 = await ops.saveCourse({ name: 'Inglés básico', category: 'idiomas', monthlyFee: 40 });
    const c2 = await ops.saveCourse({ name: 'Guitarra', category: 'musica', monthlyFee: 30 });
    await wait(() => store.teachers.length >= 2 && store.courses.length >= 2);
    const dow = new Date().getDay(); const other = (dow + 1) % 7;
    const g1 = await ops.saveGroup({ courseId: c1.id, name: 'A', teacherId: t1.id, room: 'aula1', capacity: 3, schedule: [{ day: dow, from: '15:00', to: '16:30' }, { day: other, from: '15:00', to: '16:30' }], startDate: '2026-01-01' });
    await wait(() => store.groups.length >= 1);
    const err = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
    const roomClash = await err(() => ops.saveGroup({ courseId: c2.id, name: 'X', teacherId: t2.id, room: 'aula1', schedule: [{ day: dow, from: '16:00', to: '17:00' }] }));
    const teacherClash = await err(() => ops.saveGroup({ courseId: c2.id, name: 'Y', teacherId: t1.id, room: 'aula2', schedule: [{ day: dow, from: '16:00', to: '17:00' }] }));
    const g2 = await ops.saveGroup({ courseId: c2.id, name: 'Tarde', teacherId: t2.id, room: 'aula2', capacity: 8, schedule: [{ day: dow, from: '16:30', to: '17:30' }], startDate: '2026-01-01' });
    await wait(() => store.groups.length >= 2);
    return { t1: t1.id, t2: t2.id, c1: c1.id, c2: c2.id, g1: g1.id, g2: g2.id, roomClash, teacherClash, groups: store.groups.length };
  });
  ok('Choque de aula detectado', /ocupada/.test(r2.roomClash), r2.roomClash);
  ok('Choque de profesor detectado', /ya da clase/.test(r2.teacherClash), r2.teacherClash);
  ok('Se guardan solo los grupos válidos', r2.groups === 2);
  const IDS = r2;
  await go(p, 'horario'); await sleep(600);
  ok('El horario semanal muestra los dos grupos', (await p.$$('.tt-block')).length >= 3);
  await p.screenshot({ path: path.join(OUT, '03-horario.png') });

  // ==================================================================
  console.log('3) Alumnos: hermanos, beca, cupo lleno');
  const r3 = await run(p, async ({ store, ops, wait }, I) => {
    const mk = async (d) => { const s = await ops.saveStudent(d); await wait(() => store.student(s.id)); return store.student(s.id); };
    const s1 = await mk({ name: 'Luis Pérez', birthDate: '2015-03-02', guardianName: 'Carmen Pérez', guardianPhone: '0414-5550001' });
    await new Promise((r) => setTimeout(r, 30));
    const s2 = await mk({ name: 'María Pérez', birthDate: '2017-07-09', guardianName: 'Carmen Pérez', guardianPhone: '04145550001' });
    const s3 = await mk({ name: 'José Becado', birthDate: '2014-01-01', guardianName: 'Rosa', guardianPhone: '0424-0000002', discountPct: 50, discountReason: 'Beca' });
    const s4 = await mk({ name: 'Adulta Guitarra', birthDate: '1990-05-05', phone: '0412-0000003' });
    for (const s of [s1, s2, s3]) await ops.enroll(store.student(s.id), I.g1);
    await ops.enroll(store.student(s4.id), I.g2, { chargeEnroll: true });
    let full = '';
    try { await ops.enroll(store.student(s4.id), I.g1); } catch (e) { full = e.message; }
    await wait(() => store.roster(I.g1).length === 3 && store.student(s4.id).billed > 0);
    return { s1: s1.id, s2: s2.id, s3: s3.id, s4: s4.id, roster: store.roster(I.g1).length, full, codes: [s1, s2, s3, s4].map((s) => store.student(s.id).code), enrollFee: store.student(s4.id).billed };
  }, IDS);
  Object.assign(IDS, r3);
  ok('Matrículas correlativas', r3.codes.join(',') === 'A-0001,A-0002,A-0003,A-0004', r3.codes.join(','));
  ok('Cupo lleno: no deja inscribir al 4.º alumno', r3.roster === 3 && /lleno/.test(r3.full), r3.full);
  ok('Cobra la inscripción al inscribir', near(r3.enrollFee, 10), String(r3.enrollFee));

  // ==================================================================
  console.log('4) Mensualidades del mes');
  const r4 = await run(p, async ({ store, ops, wait, aca }, I) => {
    const per = aca.currentPeriod();
    const prev = ops.previewMonthly(per);
    const r = await ops.emitMonthly(per);
    await wait(() => store.closing(per) && store.student(I.s1).ledger.some((x) => x.p === per));
    await new Promise((x) => setTimeout(x, 400));
    const b = (id) => aca.studentBalance(store.student(id));
    let again = ''; try { await ops.emitMonthly(per); } catch (e) { again = e.message; }
    return { count: r.count, prev: prev.summary, b1: b(I.s1), b2: b(I.s2), b3: b(I.s3), b4: b(I.s4), again };
  }, IDS);
  ok('Genera 4 mensualidades', r4.count === 4, JSON.stringify(r4.prev));
  ok('Precio completo, 10 % hermano y 50 % beca', near(r4.b1, 40) && near(r4.b2, 36) && near(r4.b3, 20), `${r4.b1} / ${r4.b2} / ${r4.b3}`);
  ok('Guitarra: mensualidad + inscripción', near(r4.b4, 40), String(r4.b4));
  ok('No deja generar el mismo mes dos veces', /ya se generaron/.test(r4.again));
  await go(p, 'mensualidades'); await sleep(500);
  await p.screenshot({ path: path.join(OUT, '04-mensualidades.png') });

  // ==================================================================
  console.log('5) Cobranza: abono, pago completo, saldo a favor, duplicado');
  const r5 = await run(p, async ({ store, ops, wait, aca }, I) => {
    await ops.registerPayment({ studentId: I.s1, amount: 15, method: 'pagomovil', reference: '1111', amountBs: 600, rate: 40 });
    await ops.registerPayment({ studentId: I.s3, amount: 20, method: 'efectivo_usd' });
    await ops.registerPayment({ studentId: I.s4, amount: 50, method: 'zelle', reference: 'Z-9' });
    await wait(() => store.payments.length >= 3);
    let dup = ''; try { await ops.registerPayment({ studentId: I.s1, amount: 15, method: 'pagomovil', reference: '1111' }); } catch (e) { dup = e.message; }
    const b = (id) => aca.studentBalance(store.student(id));
    return { b1: b(I.s1), b3: b(I.s3), b4: b(I.s4), dup, nums: store.payments.map((x) => x.number).sort().join(',') };
  }, IDS);
  ok('Abono descuenta del saldo', near(r5.b1, 25), String(r5.b1));
  ok('Pago completo deja al día', near(r5.b3, 0));
  ok('Pago de más queda como saldo a favor', near(r5.b4, -10), String(r5.b4));
  ok('Avisa la referencia duplicada', /referencia/.test(r5.dup), r5.dup);
  ok('Recibos numerados', r5.nums === 'P-000001,P-000002,P-000003', r5.nums);
  await go(p, 'cobranza'); await sleep(500);
  await p.screenshot({ path: path.join(OUT, '05-cobranza.png') });

  // ==================================================================
  console.log('6) Asistencia (pantalla) y pago del profesor');
  await go(p, 'asistencia'); await sleep(800);
  await p.evaluate((gid) => { const s = document.querySelector('#a-group'); if (s && s.value !== gid) { s.value = gid; s.dispatchEvent(new Event('change', { bubbles: true })); } }, IDS.g1);
  await sleep(700);
  const rows = await p.$$('.att-row');
  ok('La lista muestra los 3 alumnos del grupo', rows.length === 3, String(rows.length));
  await p.evaluate(() => { const r = [...document.querySelectorAll('.att-row')]; r[0].querySelector('[data-m="P"]').click(); r[1].querySelector('[data-m="T"]').click(); r[2].querySelector('[data-m="A"]').click(); });
  await p.screenshot({ path: path.join(OUT, '06-asistencia.png') });
  await p.click('#a-save'); await sleep(1500);
  await p.evaluate(() => document.querySelectorAll('.modal [data-close]').forEach((b) => b.click())); await sleep(300);
  const r6 = await run(p, async ({ store, ops, utils, wait }, I) => {
    await wait(() => store.sheet(I.g1, utils.todayKey()));
    const sh = store.sheet(I.g1, utils.todayKey());
    const pay = ops.teacherPay(store.teacher(I.t1));
    return { marks: sh ? Object.values(sh.marks).sort().join('') : '', hours: sh?.hours, pay };
  }, IDS);
  ok('Se guarda la lista (P, T, A)', r6.marks === 'APT', r6.marks);
  ok('Pago del profesor por horas dictadas (1,5 h × $10)', near(r6.pay.amount, 15) && r6.pay.classes === 1, JSON.stringify(r6.pay));

  // ==================================================================
  console.log('7) Notas y promedio ponderado');
  const r7 = await run(p, async ({ store, ops, wait, aca }, I) => {
    const ev = await ops.saveEvals(store.group(I.g1), [{ name: 'Parcial', weight: 40 }, { name: 'Final', weight: 60 }]);
    await wait(() => (store.group(I.g1).evals || []).length === 2);
    await ops.saveScores(I.g1, ev[0].id, { [I.s1]: 10, [I.s2]: 20, [I.s3]: 6 });
    await ops.saveScores(I.g1, ev[1].id, { [I.s1]: 15, [I.s2]: 18, [I.s3]: 8 });
    await wait(() => Object.keys(store.gradesOf(I.g1)[ev[1].id] || {}).length === 3);
    const g = store.group(I.g1); const sc = store.gradesOf(I.g1);
    return { a1: aca.studentAverage(g, sc, I.s1), a2: aca.studentAverage(g, sc, I.s2), a3: aca.studentAverage(g, sc, I.s3), evals: ev.map((e) => e.id) };
  }, IDS);
  IDS.evals = r7.evals;
  ok('Promedios 13 · 18,8 · 7,2', near(r7.a1, 13) && near(r7.a2, 18.8) && near(r7.a3, 7.2), `${r7.a1} / ${r7.a2} / ${r7.a3}`);
  await go(p, 'notas'); await sleep(600);
  await p.screenshot({ path: path.join(OUT, '07-notas.png') });

  // ==================================================================
  console.log('8) Portal del alumno (página pública, sin sesión)');
  await sleep(5000); // publicación de portales
  const pub = await run(p, ({ store }, I) => ({ st: store.student(I.s1).portalCode, te: store.teacher(I.t1).portalCode, cat: store.settings.catalogCode }), IDS);
  let q = await publicPage('/portal/' + pub.st);
  let t = await q.p.evaluate(() => document.body.innerText);
  ok('El portal muestra al alumno, su saldo y su horario', t.includes('Luis Pérez') && t.includes('25,00') && /Mi horario/i.test(t), t.slice(0, 120).replace(/\n/g, ' | '));
  await q.p.screenshot({ path: path.join(OUT, '10-portal.png'), fullPage: true });
  await q.p.click('[data-tab="notas"]'); await sleep(400);
  t = await q.p.evaluate(() => document.body.innerText);
  ok('Pestaña de notas con el promedio', t.includes('13,00'));
  await q.p.click('[data-tab="pagos"]'); await sleep(400);
  await q.p.evaluate(() => { const f = document.querySelector('#f-pay'); f.elements.amount.value = '25'; f.elements.reference.value = '777888'; f.elements.bank.value = 'Banesco'; });
  await q.p.click('#f-pay button.btn-primary'); await sleep(1500);
  ok('Reporta su pago desde el portal', (await q.p.evaluate(() => document.body.innerText)).includes('Pago reportado'));
  await q.p.click('[data-tab="solicitud"]'); await sleep(400);
  await q.p.click('[data-c="justificativo"]'); await sleep(200);
  await q.p.evaluate(() => { const f = document.querySelector('#f-req'); f.elements.text.value = 'Faltó por fiebre, tenemos el récipe.'; const d = new Date(); d.setDate(d.getDate() - 1); f.elements.date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await q.p.click('#f-req button.btn-primary'); await sleep(1500);
  t = await q.p.evaluate(() => document.body.innerText);
  ok('Envía un justificativo', t.includes('Solicitud enviada'), t.includes('Solicitud enviada') ? '' : (await q.p.evaluate(() => document.querySelector('#f-req [data-err]')?.textContent || '')) + ' | ' + logs.slice(-3).join(' || '));
  // Reglas: un portal no puede mandar a nombre de otro alumno ni tipos de profesor
  const rules = await q.p.evaluate(async (P) => {
    const f = await import('/js/firebase.js');
    const tryAdd = async (d) => { try { await f.setDoc(f.doc(f.collection(f.db, 'inbox')), { status: 'nueva', createdAt: new Date().toISOString(), ...d }); return 'ok'; } catch (e) { return e.code || 'err'; } };
    const base = { tenantId: P.tenant, code: P.st, who: P.s1, type: 'pago', amount: 5, reference: '12345' };
    return {
      good: await tryAdd(base),
      otherWho: await tryAdd({ ...base, who: P.s2 }),
      teacherType: await tryAdd({ ...base, type: 'asistencia', groupId: P.g1, date: '2026-01-05', marks: {} }),
      extraField: await tryAdd({ ...base, hacked: true }),
      readTenant: await f.getDocs(f.collection(f.db, 'tenants', P.tenant, 'students')).then(() => 'ok').catch((e) => e.code)
    };
  }, { ...IDS, ...pub, tenant: acc.sede01.uid });
  ok('Reglas: el portal crea su propio reporte', rules.good === 'ok', rules.good);
  ok('Reglas: rechaza otro alumno, tipos de profesor, campos extra y leer datos', ['otherWho', 'teacherType', 'extraField', 'readTenant'].every((k) => rules[k] === 'permission-denied'), JSON.stringify(rules));
  await q.ctx.close();

  // ==================================================================
  console.log('9) Portal del profesor: pasar lista y cargar notas');
  q = await publicPage('/profe/' + pub.te);
  t = await q.p.evaluate(() => document.body.innerText);
  ok('El portal del profesor muestra sus grupos', t.includes('Ana Profe') && t.includes('Inglés básico'), t.slice(0, 100).replace(/\n/g, ' | '));
  await q.p.click('[data-tab="lista"]'); await sleep(500);
  const yday = await q.p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await q.p.evaluate((d) => { const i = document.querySelector('#tp-d'); i.value = d; i.dispatchEvent(new Event('change', { bubbles: true })); }, yday); await sleep(400);
  await q.p.click('#tp-all'); await sleep(200);
  await q.p.screenshot({ path: path.join(OUT, '11-profe-lista.png'), fullPage: true });
  await q.p.click('#tp-send'); await sleep(1500);
  ok('Envía la lista', (await q.p.evaluate(() => document.body.innerText)).includes('Lista enviada'));
  await q.p.click('[data-tab="notas"]'); await sleep(500);
  await q.p.evaluate((P) => { document.querySelector(`.grade-cell[data-s="${P.s1}"]`).value = '19'; document.querySelector(`.grade-cell[data-s="${P.s2}"]`).value = '17,5'; }, IDS);
  await q.p.click('#tn-send'); await sleep(1500);
  const otherGroup = await q.p.evaluate(async (P) => {
    const f = await import('/js/firebase.js');
    try { await f.setDoc(f.doc(f.collection(f.db, 'inbox')), { tenantId: P.tenant, code: P.te, who: P.t1, type: 'asistencia', status: 'nueva', createdAt: new Date().toISOString(), groupId: P.g2, date: '2026-01-05', marks: {} }); return 'ok'; } catch (e) { return e.code; }
  }, { ...IDS, ...pub, tenant: acc.sede01.uid });
  ok('Reglas: el profesor no puede pasar lista de un grupo ajeno', otherGroup === 'permission-denied', otherGroup);
  await q.ctx.close();
  const r9 = await run(p, async ({ store, wait }, I) => {
    await wait(() => store.sheet(I.g1, I.yday) && (store.gradesOf(I.g1)[I.evals[0]] || {})[I.s1] === 19, 15000);
    const sh = store.sheet(I.g1, I.yday);
    return { via: sh?.via, n: sh ? Object.keys(sh.marks).length : 0, sc: (store.gradesOf(I.g1)[I.evals[0]] || {}), proc: store.inbox.filter((x) => ['asistencia', 'notas'].includes(x.type)).map((x) => x.status).join(',') };
  }, { ...IDS, yday });
  ok('La academia recibe la lista del profesor', r9.via === 'profesor' && r9.n === 3, JSON.stringify({ via: r9.via, n: r9.n }));
  ok('…y sus notas (19 y 17,5)', r9.sc[IDS.s1] === 19 && r9.sc[IDS.s2] === 17.5 && r9.proc === 'procesada,procesada', r9.proc);

  // ==================================================================
  console.log('10) Inscripción en línea');
  q = await publicPage('/inscripcion/' + pub.cat);
  t = await q.p.evaluate(() => document.body.innerText);
  ok('El catálogo muestra los cursos y cupos', t.includes('Inglés básico') && t.includes('Guitarra') && t.includes('Lleno'));
  await q.p.screenshot({ path: path.join(OUT, '12-inscripcion.png'), fullPage: true });
  ok('El grupo lleno no se puede elegir', await q.p.evaluate((g) => document.querySelector(`[data-g="${g}"]`)?.disabled === true, IDS.g1));
  await q.p.click(`[data-g="${IDS.g2}"]`); await sleep(500);
  await q.p.evaluate(() => { const f = document.querySelector('#f-en'); f.elements.name.value = 'Pedro Nuevo'; f.elements.phone.value = '0414-7778899'; f.elements.birthDate.value = '1995-04-04'; f.elements.birthDate.dispatchEvent(new Event('change')); });
  await q.p.click('#f-en button.btn-primary'); await sleep(1500);
  ok('Envía la preinscripción', (await q.p.evaluate(() => document.body.innerText)).includes('Preinscripción enviada'));
  await q.ctx.close();
  const r10 = await run(p, async ({ store, ops, wait }, I) => {
    await wait(() => store.newPreEnrollments.length === 1);
    const it = store.newPreEnrollments[0];
    const s = await ops.convertEnrollment(it, { groupId: it.groupId });
    await wait(() => store.roster(I.g2).length === 2 && store.newPreEnrollments.length === 0);
    return { name: it.name, roster: store.roster(I.g2).length, st: store.student(s.id)?.status, left: store.newPreEnrollments.length };
  }, IDS);
  ok('La preinscripción se convierte en alumno inscrito', r10.roster === 2 && r10.st === 'activo' && r10.left === 0, JSON.stringify(r10));

  // ==================================================================
  console.log('11) La academia confirma el pago reportado y atiende la solicitud');
  const r11 = await run(p, async ({ store, ops, wait, aca }, I) => {
    await wait(() => store.reportedPayments.length >= 2);
    const rep = store.reportedPayments.find((x) => x.reference === '777888');
    await ops.registerPayment({ studentId: rep.who, amount: rep.amount, method: rep.method, reference: rep.reference, date: rep.date, inboxId: rep.id });
    const junk = store.reportedPayments.find((x) => x.reference === '12345');
    if (junk) await ops.rejectReport(junk, 'No se encontró el pago');
    const req = store.inboxOf('solicitud', 'nueva')[0];
    if (req) await ops.setInbox(req, { status: 'resuelta', reply: 'Justificado, gracias.' });
    await wait(() => aca.studentBalance(store.student(I.s1)) < 0.01 && !store.reportedPayments.length);
    return { bal: aca.studentBalance(store.student(I.s1)), left: store.reportedPayments.length, cat: req?.category };
  }, IDS);
  ok('Pago confirmado: Luis queda al día', near(r11.bal, 0) && r11.left === 0, JSON.stringify(r11));
  ok('Solicitud de tipo justificativo atendida', r11.cat === 'justificativo');

  // ==================================================================
  console.log('12) Certificado con verificación pública');
  const r12 = await run(p, async ({ store, ops, wait }, I) => { const c = await ops.issueCertificate(store.student(I.s2), store.group(I.g1), { grade: 18.8 }); await wait(() => store.certificates.length === 1); return c.verify; }, IDS);
  q = await publicPage('/certificado/' + r12);
  t = await q.p.evaluate(() => document.body.innerText);
  ok('El QR verifica el certificado como auténtico', t.includes('Certificado auténtico') && t.includes('María Pérez'));
  await q.p.screenshot({ path: path.join(OUT, '13-certificado.png'), fullPage: true });
  await q.ctx.close();
  await run(p, async ({ store, ops }) => ops.voidCertificate(store.certificates[0]));
  await sleep(800);
  q = await publicPage('/certificado/' + r12);
  ok('Al anularlo, la verificación lo muestra anulado', (await q.p.evaluate(() => document.body.innerText)).includes('Certificado anulado'));
  await q.ctx.close();

  // ==================================================================
  console.log('13) Aislamiento entre sedes');
  const B = await newPage();
  await login(B.p, 'sede02', acc.sede02.password);
  await pickCountry(B.p, 'CO');
  await B.p.waitForSelector('.sb-nav', { timeout: 30000 });
  const iso = await B.p.evaluate(async (u) => {
    const f = await import('/js/firebase.js');
    const r = {};
    r.read = await f.getDocs(f.collection(f.db, 'tenants', u, 'students')).then(() => 'ok').catch((e) => e.code);
    r.write = await f.setDoc(f.doc(f.db, 'tenants', u, 'students', 'x'), { name: 'intruso' }).then(() => 'ok').catch((e) => e.code);
    r.inbox = await f.getDocs(f.query(f.collection(f.db, 'inbox'), f.where('tenantId', '==', u))).then(() => 'ok').catch((e) => e.code);
    const { store } = await import('/js/store.js');
    r.mine = store.students.length; r.cur = store.settings.currency;
    return r;
  }, acc.sede01.uid);
  ok('sede02 no ve ni escribe datos de sede01', iso.read === 'permission-denied' && iso.write === 'permission-denied' && iso.inbox === 'permission-denied' && iso.mine === 0, JSON.stringify(iso));
  ok('sede02 trabaja en pesos colombianos', iso.cur === 'COP', iso.cur);
  await B.ctx.close();

  // ==================================================================
  console.log('14) Todas las pantallas sin errores (escritorio y teléfono)');
  const b0 = errs.length;
  for (const v of VIEWS) { await go(p, v); await maybePin(p); await p.screenshot({ path: path.join(OUT, `20-${v}.png`) }); }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(500);
  let maxOvf = 0; let worst = '';
  for (const v of VIEWS) {
    await go(p, v); await maybePin(p); await p.screenshot({ path: path.join(OUT, `21-movil-${v}.png`) });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > maxOvf) { maxOvf = o; worst = v; }
  }
  ok('Pantallas sin errores', errs.length === b0, errs.slice(b0).join(' | '));
  ok('Sin desborde horizontal en el teléfono', maxOvf <= 1, `${maxOvf}px ${worst}`);
  await A.ctx.close();

  // ==================================================================
  console.log('15) Demo');
  let D = await newPage();
  await D.p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await D.p.waitForSelector('#lg-demo', { timeout: 60000 }); await D.p.click('#lg-demo');
  await pickCountry(D.p, 'VE');
  await D.p.waitForFunction(() => document.body.innerText.includes('Modo demo') && !document.getElementById('boot'), { timeout: 240000 });
  await sleep(3000);
  const d = await run(D.p, async ({ store }) => ({
    students: store.students.length, groups: store.groups.length, teachers: store.teachers.length, closings: store.closings.length, pays: store.payments.length, att: store.attendance.length, grades: store.grades.length,
    certs: store.certificates.length, payouts: store.payouts.length, debtors: store.debtors.length, reported: store.reportedPayments.length, pre: store.newPreEnrollments.length, notices: store.notices.length, exp: store.expenses.length,
    consistent: store.students.every((s) => Math.abs((s.ledger || []).reduce((a, x) => a + x.t, 0) - (s.billed || 0)) < 0.05),
    overCap: store.groups.filter((g) => g.capacity && store.roster(g.id).length > g.capacity).map((g) => store.groupLabel(g))
  }));
  ok('Demo: alumnos, grupos, profesores y 4 meses de mensualidades', d.students >= 60 && d.groups >= 13 && d.teachers === 6 && d.closings === 4, JSON.stringify({ s: d.students, g: d.groups, t: d.teachers, c: d.closings }));
  ok('Demo: pagos, asistencia, notas, certificados, profesores pagados, gastos', d.pays >= 100 && d.att >= 150 && d.grades >= 8 && d.certs >= 3 && d.payouts >= 6 && d.exp >= 20, JSON.stringify(d));
  ok('Demo: morosos, pagos reportados, preinscripciones y avisos', d.debtors >= 3 && d.reported >= 2 && d.pre >= 2 && d.notices >= 4);
  ok('Demo: libros consistentes y ningún grupo sobre el cupo', d.consistent && !d.overCap.length, d.overCap.join(', '));
  ok('Recorrido guiado abierto al entrar', !!(await D.p.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => null)));
  await D.p.screenshot({ path: path.join(OUT, '30-demo-tour.png') });
  await D.p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const b2 = errs.length;
  for (const v of VIEWS) { await go(D.p, v); await maybePin(D.p, '1234'); await D.p.screenshot({ path: path.join(OUT, `31-demo-${v}.png`) }); }
  ok('Pantallas de la demo sin errores', errs.length === b2, errs.slice(b2).join(' | '));
  await sleep(5000);
  const codes = await run(D.p, ({ store }) => ({ st: store.students.map((s) => s.portalCode), te: store.teachers.map((x) => x.portalCode), cat: store.settings.catalogCode, cert: store.certificates.map((c) => c.verify) }));
  const pubd = await D.p.evaluate(async (c) => { const f = await import('/js/firebase.js'); const ex = async (col, id) => (await f.getDoc(f.doc(f.db, col, id))).exists(); return (await ex('portals', c.st[0])) && (await ex('portals', c.te[0])) && (await ex('catalogs', c.cat)) && (await ex('certs', c.cert[0])); }, codes);
  ok('La demo publica portales, catálogo y certificados', pubd);
  for (const [tag, url] of [['portal', '/portal/' + codes.st[3]], ['profe', '/profe/' + codes.te[0]], ['inscripcion', '/inscripcion/' + codes.cat]]) {
    q = await publicPage(url);
    await q.p.screenshot({ path: path.join(OUT, `32-demo-${tag}.png`), fullPage: true });
    await q.ctx.close();
  }
  const uid = await D.p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await D.p.evaluate(() => document.getElementById('demo-end').click());
  await D.p.waitForSelector('.modal [data-yes]'); await D.p.click('.modal [data-yes]');
  let back = false;
  for (let i = 0; i < 90 && !back; i++) { await sleep(1000); back = await D.p.$('#login-form').then((h) => !!h).catch(() => false); }
  if (!back) { await D.p.screenshot({ path: path.join(OUT, '39-demo-fin.png') }); console.log('LOGS', logs.slice(-15).join(' || ')); }
  ok('Terminar la demo vuelve al login', back);
  await D.ctx.close();

  // ==================================================================
  console.log('16) Administrador general');
  D = await newPage();
  await login(D.p, 'admin', acc.admin.password);
  await D.p.waitForSelector('[data-enter]', { timeout: 30000 }); await sleep(2000);
  ok('Admin ve las sedes', (await D.p.$$('[data-enter]')).length === 3);
  await D.p.screenshot({ path: path.join(OUT, '40-admin.png') });
  const gone = await D.p.evaluate(async (u, c) => {
    const f = await import('/js/firebase.js');
    const ex = async (col, id) => (await f.getDoc(f.doc(f.db, col, id))).exists();
    const ib = await f.getDocs(f.query(f.collection(f.db, 'inbox'), f.where('tenantId', '==', u)));
    return !(await ex('tenants', u)) && !(await ex('portals', c.st[0])) && !(await ex('portals', c.te[0])) && !(await ex('catalogs', c.cat)) && !(await ex('certs', c.cert[0])) && ib.empty;
  }, uid, codes);
  ok('La demo, sus portales, catálogo, certificados y bandeja se borraron', gone);
  await D.ctx.close();
} catch (e) { console.log('ERROR', e.stack || e.message); fails++; }
await browser.close();
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
console.log(`${passed} OK · ${fails} fallas`);
process.exit(fails ? 1 : 0);
