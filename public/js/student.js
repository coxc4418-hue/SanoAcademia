// SanoAcademia — Alumnos: selector, formulario, ficha, inscripción, cobro y portal
import { store } from './store.js';
import { esc, usd, bs, num, fmtDate, toast, openModal, setBusy, parseNum, normalize, round2, todayKey, PAY_METHODS, methodLabel, loc, fx, emptyState, confirmDialog, promptDialog, fmtDateTime, compressImage, initials, colorFor } from './utils.js';
import { icon } from './icons.js';
import {
  studentBalance, ledgerStatus, openCharges, monthsOwed, debtTone, debtLabel, periodName, badge, PAY_STATUS, REQUEST_CATS, REQUEST_STATUS, isSolvent,
  STUDENT_STATUS, ageOf, isMinor, contactPhone, scheduleText, attendanceOf, ATT, studentAverage, scaleOf, CHARGE_KINDS, catOf, groupFee
} from './academy.js';
import { saveStudent, registerPayment, addStudentCharge, setStudentStatus, renewPortalCode, voidPayment, setOpeningBalance, createRequest, enroll, unenroll, issueCertificate } from './ops.js';
import { waStudent, PORTAL_URL, qrDataURL, printStatement, printStudyProof, printPayment, printReceipts, printCard, printReportCard, printCertificate } from './shared.js';
import { isVE } from './bcv.js';

export function studentAvatar(s, size = '') {
  const t = debtTone(s);
  return s?.photo
    ? `<span class="s-av ${size} ring-${t}"><img src="${s.photo}" alt=""></span>`
    : `<span class="s-av ${size} ring-${t}" style="background:${colorFor(s?.name || '?')}">${esc(initials(s?.name || '?'))}</span>`;
}
export const debtBadge = (s) => `<span class="badge badge-${debtTone(s)}"><i class="dotc"></i>${debtLabel(s)}</span>`;
export const groupChip = (g) => { if (!g) return ''; const c = store.course(g.courseId); return `<span class="g-chip" style="--gc:${c?.color || catOf(c?.category).color}">${esc(c?.name || 'Curso')}${g.name ? ` · ${esc(g.name)}` : ''}</span>`; };
export const studentGroups = (s) => (s?.groupIds || []).map((id) => store.group(id)).filter(Boolean);
export const studentSub = (s) => [s.code, ageOf(s.birthDate) != null ? `${ageOf(s.birthDate)} años` : '', isMinor(s) && s.guardianName ? `rep. ${s.guardianName}` : ''].filter(Boolean).join(' · ');

/** <option> de grupos agrupados por curso */
export function groupOptions(selected = '', { all = false, allLabel = 'Todos los grupos', includeEnded = false } = {}) {
  const list = includeEnded ? store.groups : store.liveGroups;
  const byCourse = {};
  for (const g of list) (byCourse[g.courseId] ||= []).push(g);
  return `${all ? `<option value="">${esc(allLabel)}</option>` : ''}${Object.entries(byCourse).map(([cid, gs]) => `<optgroup label="${esc(store.course(cid)?.name || 'Curso')}">${gs.map((g) => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.name || store.course(cid)?.name || 'Grupo')} · ${esc(scheduleText(g))}</option>`).join('')}</optgroup>`).join('')}`;
}

/** Elegir un alumno (busca por nombre, matrícula, cédula, teléfono o representante) */
export function pickStudent({ title = 'Elegir alumno', filter = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><label class="search"><svg></svg><input data-q placeholder="Nombre, matrícula, cédula, teléfono o representante…" autofocus autocomplete="off"></label><div class="list pick-list" data-l style="max-height:52vh;overflow:auto"></div></div>`,
      onClose: () => { if (!done) resolve(null); }
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (q = '') => {
      const t = normalize(q).replace(/\s+/g, '');
      const list = store.students.filter((s) => s.status !== 'retirado' || studentBalance(s) > 0.009).filter((s) => (!filter || filter(s)) && (!t || normalize(`${s.name}${s.code}${s.idDoc}${s.phone}${s.guardianName}${s.guardianPhone}`).replace(/\s+/g, '').includes(t))).slice(0, 80);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((s) => `<button type="button" class="list-item linkish" data-s="${s.id}" style="width:100%;text-align:left">${studentAvatar(s)}<div class="grow" style="min-width:0"><b>${esc(s.name)}</b><div class="t-sub ellipsis">${esc(studentSub(s))}</div></div><div class="r"><b class="num ${studentBalance(s) > 0.009 ? 'text-danger' : ''}">${usd(Math.max(0, studentBalance(s)))}</b><div class="t-sub">${debtLabel(s)}</div></div></button>`).join('')
        : emptyState('search', 'Sin resultados', 'Prueba con otro nombre o número.');
      m.el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { done = true; m.close(); resolve(store.student(b.dataset.s)); });
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    draw();
  });
}

// ======================================================================
// FORMULARIO DEL ALUMNO
// ======================================================================
export function studentForm(student = null, preset = {}) {
  return new Promise((resolve) => {
    const s = { ...preset, ...(student || {}) };
    let photo = s.photo || '';
    let picked = new Set(preset.groupIds || []);
    let done = false;
    const minorNow = () => { const b = m.el.querySelector('[name="birthDate"]').value; const a = ageOf(b); return a != null && a < 18; };
    const m = openModal({
      title: student ? `Editar · ${esc(student.name)}` : 'Nuevo alumno', size: 'lg',
      sub: student ? `Matrícula ${esc(student.code || '')}` : 'Datos del alumno, su representante (si es menor) y los grupos donde se inscribe.',
      body: `<form class="stack" data-f>
        <div class="row" style="gap:14px;align-items:flex-start;flex-wrap:nowrap">
          <label class="photo-pick" title="Foto (opcional)"><span data-ph>${photo ? `<img src="${photo}" alt="">` : icon('camera')}</span><input type="file" accept="image/*" capture="user" hidden data-photo></label>
          <div class="form-grid grow">
            <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(s.name || '')}" ${student ? '' : 'autofocus'} placeholder="Ej.: Valentina Rojas"></div>
            <div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(s.idDoc || '')}"></div>
            <div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" value="${esc(s.birthDate || '')}" max="${todayKey()}"></div>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Teléfono / WhatsApp del alumno</label><input class="input" name="phone" inputmode="tel" value="${esc(s.phone || '')}"></div>
          <div class="field"><label>Correo</label><input class="input" name="email" type="email" value="${esc(s.email || '')}"></div>
          <div class="field"><label>Colegio / universidad / ocupación</label><input class="input" name="school" value="${esc(s.school || '')}"></div>
          <div class="field"><label>¿Cómo nos conoció?</label><select class="input select" name="howFound">${['', 'Instagram', 'Facebook / TikTok', 'Recomendación', 'Google', 'Pasó por el local', 'Volante / afiche', 'Inscripción en línea', 'Otro'].map((x) => `<option ${s.howFound === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        </div>
        <div class="section-title">${icon('users')} Representante <span class="t-sub" data-rep-h>${isMinor(s) ? '(obligatorio para menores)' : '(si es menor de edad)'}</span></div>
        <div class="form-grid">
          <div class="field"><label>Nombre del representante</label><input class="input" name="guardianName" value="${esc(s.guardianName || '')}"></div>
          <div class="field"><label>Parentesco</label><select class="input select" name="guardianRelation">${['', 'Madre', 'Padre', 'Abuelo(a)', 'Tío(a)', 'Hermano(a)', 'Tutor(a)'].map((x) => `<option ${s.guardianRelation === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label>WhatsApp del representante</label><input class="input" name="guardianPhone" inputmode="tel" value="${esc(s.guardianPhone || '')}"><span class="hint">Si coincide con otro alumno activo se aplica el descuento por hermanos.</span></div>
          <div class="field"><label>${esc(loc().id)} del representante</label><input class="input" name="guardianIdDoc" value="${esc(s.guardianIdDoc || '')}"></div>
        </div>
        ${student ? '' : `<div class="section-title">${icon('layers')} Inscribir en</div>
          ${store.liveGroups.length ? `<div class="pick-groups" data-groups>${store.liveGroups.map((g) => { const c = store.course(g.courseId); const n = store.roster(g.id).length; const full = g.capacity && n >= g.capacity; return `<button type="button" class="pg ${picked.has(g.id) ? 'on' : ''} ${full ? 'full' : ''}" data-g="${g.id}" style="--gc:${c?.color || '#4f46e5'}"><b>${esc(c?.name || '')}${g.name ? ` · ${esc(g.name)}` : ''}</b><small>${esc(scheduleText(g))}</small><small>${usd(groupFee(g, c))}/mes · ${n}${g.capacity ? '/' + g.capacity : ''} alumnos${full ? ' · lleno' : ''}</small></button>`; }).join('')}</div>
            <label class="check"><input type="checkbox" name="chargeEnroll" checked> <span>Cobrar la inscripción del curso (si tiene)</span></label>` : `<div class="box small">Aún no hay grupos. Créalos en <b>Cursos y grupos</b>; luego inscribes al alumno desde su ficha.</div>`}`}
        <div class="section-title">${icon('percent')} Beca o descuento</div>
        <div class="form-grid">
          <div class="field"><label>Descuento en la mensualidad (%)</label><input class="input" name="discountPct" inputmode="decimal" value="${s.discountPct || ''}" placeholder="0"></div>
          <div class="field"><label>Motivo</label><input class="input" name="discountReason" value="${esc(s.discountReason || '')}" placeholder="Beca, convenio, hijo de profesor…"></div>
          ${student ? '' : `<div class="field"><label>Saldo anterior (opcional)</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input" name="opening" inputmode="decimal" placeholder="0"></div><span class="hint">Lo que ya debía antes de usar el sistema.</span></div>`}
        </div>
        <div class="form-grid">
          <div class="field full"><label>Salud, alergias o condiciones (opcional)</label><input class="input" name="health" value="${esc(s.health || '')}" placeholder="Ej.: asma, alergia a…"></div>
          <div class="field full"><label>Notas</label><textarea class="input textarea" name="notes" rows="2">${esc(s.notes || '')}</textarea></div>
        </div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${student ? 'Guardar' : 'Inscribir alumno'}</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const $ = (q) => m.el.querySelector(q);
    $('[data-photo]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { photo = await compressImage(f, 240, 0.72); $('[data-ph]').innerHTML = `<img src="${photo}" alt="">`; } catch (_) { toast('No se pudo leer la imagen', 'warning'); } };
    $('[name="birthDate"]').onchange = () => { $('[data-rep-h]').textContent = minorNow() ? '(obligatorio para menores)' : '(si es menor de edad)'; };
    m.el.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { if (picked.has(b.dataset.g)) picked.delete(b.dataset.g); else picked.add(b.dataset.g); b.classList.toggle('on'); });
    const submit = async (e) => {
      e?.preventDefault();
      const F = $('[data-f]').elements;
      const err = $('[data-err]');
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre del alumno.'; return; }
      if (minorNow() && !F.guardianName.value.trim()) { err.textContent = 'El alumno es menor de edad: escribe el nombre de su representante.'; return; }
      const data = { name: F.name.value, idDoc: F.idDoc.value, birthDate: F.birthDate.value, phone: F.phone.value, email: F.email.value, school: F.school.value, howFound: F.howFound.value, guardianName: F.guardianName.value, guardianRelation: F.guardianRelation.value, guardianPhone: F.guardianPhone.value, guardianIdDoc: F.guardianIdDoc.value, discountPct: parseNum(F.discountPct.value), discountReason: F.discountReason.value, health: F.health.value, notes: F.notes.value, photo };
      const btn = $('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        let saved = await saveStudent(data, student?.id || null);
        if (!student) {
          const op = F.opening ? parseNum(F.opening.value) : 0;
          if (op > 0) await setOpeningBalance({ ...saved, billed: 0, paid: 0, ledger: [] }, op, 'Saldo anterior');
          for (const gid of picked) {
            const cur = store.student(saved.id) || saved;
            try { await enroll(cur, gid, { chargeEnroll: F.chargeEnroll?.checked, force: true }); } catch (ex) { toast(ex.message, 'warning', 5000); }
          }
          saved = store.student(saved.id) || saved;
        }
        done = true; m.close(); toast(student ? 'Datos actualizados' : `${saved.name} inscrito · matrícula ${saved.code}`); resolve(saved);
        if (!student) welcome(saved);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
    $('[data-f]').onsubmit = submit;
    $('[data-ok]').onclick = submit;
  });
}
function welcome(s0) {
  const s = store.student(s0.id) || s0;
  const m = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:16px 0 4px;align-items:center">${studentAvatar(s, 'xl')}<div><div style="font-size:20px;font-weight:800">¡${esc(s.name.split(' ')[0])} quedó inscrito! 🎉</div><div class="muted small">Matrícula <b>${esc(s.code || '')}</b>${studentGroups(s).length ? ` · ${studentGroups(s).length} grupo(s)` : ''}</div></div>
      ${studentBalance(s) > 0.009 ? `<div class="pay-status due" style="width:100%"><span>Por pagar (inscripción)</span><span class="num">${usd(studentBalance(s))}</span></div>` : ''}</div>`,
    footer: `<button class="btn btn-secondary" data-card>${icon('user')} Carnet</button>${contactPhone(s) ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Bienvenida</button>` : ''}${studentBalance(s) > 0.009 ? `<button class="btn btn-success" data-pay>${icon('wallet')} Cobrar</button>` : ''}<button class="btn btn-primary" data-close>Listo</button>`
  });
  m.el.querySelector('[data-card]').onclick = () => printCard([store.student(s.id) || s]);
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waStudent('bienvenida', { student: store.student(s.id) || s }));
  m.el.querySelector('[data-pay]')?.addEventListener('click', () => { m.close(); paymentModal(store.student(s.id) || s); });
}

// ======================================================================
// INSCRIBIR EN OTRO GRUPO
// ======================================================================
export function enrollModal(s) {
  return new Promise((resolve) => {
    let ok = false;
    const avail = store.liveGroups.filter((g) => !(s.groupIds || []).includes(g.id));
    const m = openModal({
      title: `Inscribir a ${esc(s.name.split(' ')[0])} en un grupo`, size: 'md',
      body: avail.length ? `<div class="pick-groups">${avail.map((g) => { const c = store.course(g.courseId); const n = store.roster(g.id).length; const full = g.capacity && n >= g.capacity; return `<button type="button" class="pg ${full ? 'full' : ''}" data-g="${g.id}" style="--gc:${c?.color || '#4f46e5'}"><b>${esc(c?.name || '')}${g.name ? ` · ${esc(g.name)}` : ''}</b><small>${esc(scheduleText(g))}</small><small>${usd(groupFee(g, c))}/mes · ${n}${g.capacity ? '/' + g.capacity : ''}${full ? ' · lleno' : ''}</small></button>`; }).join('')}</div>
        <label class="check mt"><input type="checkbox" data-ce checked> <span>Cobrar la inscripción del curso (si tiene)</span></label>` : emptyState('layers', 'No hay más grupos', 'Ya está en todos los grupos abiertos o aún no hay grupos creados.'),
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>',
      onClose: () => resolve(ok)
    });
    m.el.querySelectorAll('[data-g]').forEach((b) => b.onclick = async () => {
      try { await enroll(store.student(s.id) || s, b.dataset.g, { chargeEnroll: m.el.querySelector('[data-ce]')?.checked }); ok = true; toast('Inscrito en ' + store.groupLabel(store.group(b.dataset.g))); m.close(); }
      catch (ex) {
        if (ex.full && await confirmDialog({ title: 'Grupo lleno', message: `${ex.message} ¿Inscribirlo de todas formas?`, confirmText: 'Inscribir igual' })) { await enroll(store.student(s.id) || s, b.dataset.g, { chargeEnroll: m.el.querySelector('[data-ce]')?.checked, force: true }); ok = true; toast('Inscrito (sobrecupo)'); m.close(); }
        else if (!ex.full) toast(ex.message, 'danger');
      }
    });
  });
}

// ======================================================================
// REGISTRAR PAGO
// ======================================================================
export async function paymentModal(s0 = null, preset = {}) {
  const st0 = s0 || await pickStudent({ title: 'Registrar pago · ¿quién paga?' });
  if (!st0) return null;
  return new Promise((resolve) => {
    const s = store.student(st0.id) || st0;
    const bal = Math.max(0, studentBalance(s));
    const rateNow = Number(fx()?.rate) || 0;
    const allowBs = isVE() && rateNow > 0;
    let cur = preset.amountBs && allowBs ? 'bs' : 'main';
    let done = false;
    const open = openCharges(s);
    const banks = (store.settings.banks || []).filter((b) => b.active !== false);
    const m = openModal({
      title: `Registrar pago · ${esc(s.name)}`, size: 'md',
      sub: `${esc(s.code || '')}${bal > 0 ? ` · debe <b>${usd(bal)}</b>${bs(bal) ? ` (${bs(bal)})` : ''}` : ' · al día'}`,
      body: `<form class="stack" data-f>
        ${open.length ? `<div class="box"><div class="section-title" style="margin-top:0">Pendiente</div>${open.slice(0, 8).map((x) => `<div class="between small"><span>${esc(x.k === 'mes' ? `Mensualidad ${periodName(x.p)}` : x.n)}${x.d && x.d < todayKey() ? ' <span class="text-danger">· vencido</span>' : ''}</span><b class="num">${usd(x.rest)}</b></div>`).join('')}</div>` : ''}
        ${allowBs ? `<div class="seg seg-block" data-cur><button type="button" data-c="main" class="${cur === 'main' ? 'on' : ''}">Pagó en ${esc(loc().sym)}</button><button type="button" data-c="bs" class="${cur === 'bs' ? 'on' : ''}">Pagó en bolívares</button></div>` : ''}
        <div class="form-grid">
          <div class="field" data-main-f><label>Monto (${esc(loc().sym)})</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input input-lg" name="amount" inputmode="decimal" value="${preset.amount ? num(preset.amount) : ''}" placeholder="0" autofocus></div></div>
          ${allowBs ? `<div class="field" data-bs-f><label>Monto en Bs</label><div class="input-group"><span class="prefix">Bs</span><input class="input input-lg" name="amountBs" inputmode="decimal" value="${preset.amountBs ? num(preset.amountBs) : ''}" placeholder="0"></div></div>
          <div class="field" data-bs-f><label>Tasa (Bs por 1 $)</label><input class="input" name="rate" inputmode="decimal" value="${num(preset.rate || rateNow, 2)}"><span class="hint">Tasa BCV del día del pago.</span></div>` : ''}
          <div class="field"><label>Fecha del pago</label><input class="input" type="date" name="date" value="${preset.date || todayKey()}" max="${todayKey()}"></div>
          <div class="field"><label>Forma de pago</label><select class="input select" name="method">${Object.entries(PAY_METHODS).map(([k, p]) => `<option value="${k}" ${(preset.method || (allowBs ? 'pagomovil' : 'efectivo')) === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
          <div class="field"><label>Banco / cuenta destino</label>${banks.length ? `<select class="input select" name="bank"><option value="">—</option>${banks.map((b) => `<option ${preset.bank === b.bank ? 'selected' : ''}>${esc(b.bank || b.type)}</option>`).join('')}</select>` : `<input class="input" name="bank" value="${esc(preset.bank || '')}">`}</div>
          <div class="field"><label>Referencia</label><input class="input" name="reference" value="${esc(preset.reference || '')}" placeholder="Últimos dígitos"></div>
          <div class="field"><label>Pagó</label><input class="input" name="payer" value="${esc(preset.payer || (isMinor(s) ? s.guardianName || '' : s.name || ''))}"></div>
          <div class="field full"><label>Nota</label><input class="input" name="note" value="${esc(preset.note || '')}"></div>
        </div>
        <div class="pay-status due" data-st></div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `${bal > 0 ? `<button class="btn btn-ghost" data-all>Paga todo ${usd(bal)}</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success" data-ok>${icon('check')} Registrar pago</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const F = m.el.querySelector('[data-f]').elements;
    const $ = (q) => m.el.querySelector(q);
    const amount = () => cur === 'bs' ? round2(parseNum(F.amountBs.value) / Math.max(0.0001, parseNum(F.rate.value))) : round2(parseNum(F.amount.value));
    const paint = () => {
      m.el.querySelectorAll('[data-bs-f]').forEach((x) => { x.hidden = cur !== 'bs'; });
      $('[data-main-f]').hidden = cur === 'bs';
      const a = amount();
      const st = $('[data-st]');
      if (!(a > 0)) { st.className = 'pay-status due'; st.innerHTML = '<span>Escribe el monto</span><span></span>'; return; }
      const rest = round2(bal - a);
      st.className = 'pay-status ' + (rest <= 0.009 ? 'ok' : 'due');
      st.innerHTML = `<span>${cur === 'bs' ? `Equivale a <b>${usd(a)}</b> · ` : ''}${rest > 0.009 ? 'Queda debiendo' : rest < -0.009 ? 'Queda a favor' : `${icon('check')} Queda al día`}</span><span class="num">${Math.abs(rest) > 0.009 ? usd(Math.abs(rest)) : ''}</span>`;
    };
    m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cur = b.dataset.c; m.el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); if (cur === 'bs') F.method.value = 'pagomovil'; paint(); });
    ['amount', 'amountBs', 'rate'].forEach((n) => { if (F[n]) F[n].oninput = paint; });
    $('[data-all]')?.addEventListener('click', () => { if (cur === 'bs') F.amountBs.value = num(bal * parseNum(F.rate.value), 2); else F.amount.value = num(bal); paint(); });
    paint();
    $('[data-ok]').onclick = async (e) => {
      const err = $('[data-err]'); err.textContent = '';
      const a = amount();
      if (!(a > 0)) { err.textContent = 'Escribe el monto del pago.'; return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Registrando…');
      try {
        const p = await registerPayment({ studentId: s.id, amount: a, date: F.date.value, method: F.method.value, bank: F.bank.value, reference: F.reference.value, payer: F.payer.value, note: F.note.value, amountBs: cur === 'bs' ? parseNum(F.amountBs.value) : 0, rate: cur === 'bs' ? parseNum(F.rate.value) : rateNow, inboxId: preset.inboxId || '' });
        done = true; m.close(); resolve(p);
        paidDone(p);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}
export function paidDone(p) {
  const s = store.student(p.studentId);
  const m = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:18px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('check')}</div>
      <div><div class="muted small">Pago registrado · ${esc(p.studentName)}</div><div style="font-size:28px;font-weight:800">${usd(p.amount)}</div>${p.amountBs ? `<div class="muted">Bs ${num(p.amountBs, 2)}</div>` : ''}</div>
      <div>${s ? debtBadge(s) : ''}</div>
    </div>`,
    footer: `<button class="btn btn-secondary" data-pr>${icon('print')} Comprobante</button>${s && contactPhone(s) ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Avisar</button>` : ''}<button class="btn btn-primary" data-close autofocus>Listo</button>`
  });
  m.el.querySelector('[data-pr]').onclick = () => printPayment(p);
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waStudent('pago', { student: store.student(p.studentId), payment: p }));
}

// ======================================================================
// PORTAL: QR y enlace
// ======================================================================
export async function portalModal(s) {
  const { publishStudentPortal } = await import('./ops.js');
  const code = await publishStudentPortal(s).catch(() => s.portalCode);
  const stu = code && code !== s.portalCode ? { ...s, portalCode: code } : s;
  const url = PORTAL_URL(stu);
  const qr = await qrDataURL(url, 6);
  const m = openModal({
    title: `Portal de ${esc(stu.name.split(' ')[0])}`, size: 'sm',
    sub: 'El alumno o su representante ve horario, asistencia, notas, mensualidades y avisos; reporta pagos y envía justificativos. Sin usuario ni contraseña: solo con este enlace.',
    body: `<div class="center stack" style="align-items:center"><img src="${qr}" alt="QR" width="220" height="220" style="image-rendering:pixelated;border-radius:12px;background:#fff;padding:6px"><code class="mono" style="font-size:20px;letter-spacing:.15em">${esc(stu.portalCode)}</code><input class="input input-ro small" readonly value="${esc(url)}"></div>`,
    footer: `<button class="btn btn-ghost" data-new>${icon('refresh')} Cambiar código</button><button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><a class="btn btn-secondary" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')} Abrir</a>${contactPhone(stu) ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>` : ''}`
  });
  m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (_) { toast('No se pudo copiar', 'warning'); } };
  m.el.querySelector('[data-wa]')?.addEventListener('click', () => waStudent('portal', { student: stu }));
  m.el.querySelector('[data-new]').onclick = async () => {
    if (!(await confirmDialog({ title: 'Cambiar el código del portal', message: 'El enlace anterior dejará de funcionar.', confirmText: 'Cambiar' }))) return;
    await renewPortalCode(stu); m.close(); toast('Código renovado'); portalModal(store.student(stu.id) || stu);
  };
}

// ======================================================================
// FICHA DEL ALUMNO
// ======================================================================
export async function openStudent(id, { tab = 'resumen' } = {}) {
  let s = store.student(id);
  if (!s) { toast('Alumno no encontrado', 'warning'); return; }
  let cur = tab;
  let receipts = null, payments = null;
  const m = openModal({ title: '', size: 'lg', body: '<div data-b></div>' });
  const body = m.el.querySelector('[data-b]');
  const load = async () => {
    [receipts, payments] = await Promise.all([store.studentReceipts(id).catch(() => []), store.studentPayments(id).catch(() => [])]);
    if (document.body.contains(body)) draw();
  };
  const draw = () => {
    s = store.student(id) || s;
    const bal = studentBalance(s);
    const led = ledgerStatus(s).slice().reverse();
    const groups = studentGroups(s);
    const reqs = store.inbox.filter((x) => x.who === id && x.type === 'solicitud');
    const certs = store.certificates.filter((c) => c.studentId === id);
    const age = ageOf(s.birthDate);
    body.innerHTML = `
      <div class="u-head">
        ${studentAvatar(s, 'xl')}
        <div class="grow" style="min-width:0"><div class="u-title">${esc(s.name)}</div>
          <div class="t-sub">${esc(s.code || '')}${age != null ? ` · ${age} años` : ''}${s.idDoc ? ` · ${esc(loc().id)} ${esc(s.idDoc)}` : ''}</div>
          <div class="mt-xs row" style="gap:6px;flex-wrap:wrap">${badge(STUDENT_STATUS, s.status || 'activo')} ${debtBadge(s)} ${s.discountPct ? `<span class="badge badge-violet">${icon('percent')} ${num(s.discountPct, 0)}% ${esc(s.discountReason || 'beca')}</span>` : ''}</div></div>
        <div class="u-bal ${bal > 0.009 ? 'due' : 'ok'}"><small>${bal > 0.009 ? 'Debe' : bal < -0.009 ? 'A favor' : 'Al día'}</small><b>${usd(Math.abs(bal))}</b>${bs(Math.abs(bal)) && Math.abs(bal) > 0.009 ? `<small>${bs(Math.abs(bal))}</small>` : ''}</div>
      </div>
      ${s.health ? `<div class="vital-alert warning mt-sm">${icon('alert')} ${esc(s.health)}</div>` : ''}
      <div class="u-actions">
        <button class="btn btn-success btn-sm" data-a="pay">${icon('wallet')} Cobrar</button>
        ${contactPhone(s) ? `<button class="btn btn-whatsapp btn-sm" data-a="wa">${icon('whatsapp')} ${bal > 0.009 ? 'Recordar pago' : 'WhatsApp'}</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-a="portal">${icon('qr')} Portal</button>
        <button class="btn btn-secondary btn-sm" data-a="enroll">${icon('plus')} Inscribir en grupo</button>
        <button class="btn btn-secondary btn-sm" data-a="docs">${icon('file')} Documentos</button>
        <button class="btn btn-ghost btn-sm" data-a="charge">${icon('receipt')} Cargo</button>
        <button class="btn btn-ghost btn-sm" data-a="edit">${icon('edit')} Editar</button>
      </div>
      <div class="tabs" data-tabs>${[['resumen', 'Resumen'], ['cuenta', `Mensualidades (${led.length})`], ['pagos', 'Pagos'], ['academico', 'Notas y asistencia'], ['solicitudes', `Solicitudes${reqs.length ? ` (${reqs.length})` : ''}`], ['certificados', `Certificados${certs.length ? ` (${certs.length})` : ''}`]].map(([k, l]) => `<button data-t="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div data-tab></div>`;
    const tb = body.querySelector('[data-tab]');
    if (cur === 'resumen') {
      tb.innerHTML = `
        ${groups.length ? `<div class="section-title" style="margin-top:4px">${icon('layers')} Grupos</div><div class="list">${groups.map((g) => { const a = attendanceOf(id, store.sheetsOf(g.id)); const t = store.teacher(g.teacherId); return `<div class="list-item"><span class="kpi-icon" style="width:36px;height:36px;background:color-mix(in srgb, ${store.course(g.courseId)?.color || '#4f46e5'} 16%, transparent);color:${store.course(g.courseId)?.color || '#4f46e5'}">${icon(catOf(store.course(g.courseId)?.category).icon)}</span><div class="grow" style="min-width:0"><b>${esc(store.groupLabel(g))}</b>${g.status === 'finalizado' ? ' <span class="badge badge-neutral">Finalizado</span>' : ''}<div class="t-sub">${esc(scheduleText(g))}${t ? ` · ${esc(t.name)}` : ''}${store.roomName(g.room) ? ` · ${esc(store.roomName(g.room))}` : ''}</div></div>${a.pct != null ? `<span class="badge badge-${a.pct >= 85 ? 'success' : a.pct >= 70 ? 'warning' : 'danger'}">${a.pct}% asist.</span>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-ung="${g.id}" title="Sacar del grupo">${icon('x')}</button></div>`; }).join('')}</div>` : `<div class="box">${icon('info')} No está inscrito en ningún grupo. <button class="linkish text-brand" data-a="enroll"><b>Inscribir ahora</b></button></div>`}
        <div class="kv mt">
          <div><span>Teléfono</span><b>${esc(s.phone || '—')}</b></div>
          <div><span>Correo</span><b>${esc(s.email || '—')}</b></div>
          <div><span>Nacimiento</span><b>${s.birthDate ? fmtDate(s.birthDate) : '—'}</b></div>
          <div><span>Colegio / ocupación</span><b>${esc(s.school || '—')}</b></div>
          <div><span>Representante</span><b>${esc(s.guardianName || '—')}${s.guardianRelation ? ` (${esc(s.guardianRelation)})` : ''}</b></div>
          <div><span>WhatsApp representante</span><b>${esc(s.guardianPhone || '—')}</b></div>
          <div><span>Inscrito desde</span><b>${fmtDate(s.enrolledAt || s.createdAt)}</b></div>
          <div><span>Último pago</span><b>${s.lastPaymentAt ? fmtDate(s.lastPaymentAt) : '—'}</b></div>
          <div><span>Nos conoció por</span><b>${esc(s.howFound || '—')}</b></div>
          <div><span>Código del portal</span><b class="mono">${esc(s.portalCode || '—')}</b></div>
        </div>
        ${s.notes ? `<div class="box mt"><b>Notas:</b> ${esc(s.notes)}</div>` : ''}
        ${openCharges(s).length ? `<div class="section-title mt">Pendiente por pagar</div><div class="list">${openCharges(s).map((x) => `<div class="list-item"><span class="kpi-icon tone-${x.d && x.d < todayKey() ? 'danger' : 'warning'}" style="width:34px;height:34px">${icon('receipt')}</span><div class="grow"><b>${esc(x.k === 'mes' ? `Mensualidad ${periodName(x.p)}` : x.n)}</b><div class="t-sub">vence ${fmtDate(x.d)}${x.status === 'parcial' ? ` · abonado ${usd(x.covered)}` : ''}</div></div><b class="num">${usd(x.rest)}</b></div>`).join('')}</div>` : ''}
        <div class="row mt-lg" style="justify-content:flex-end;gap:6px">${s.status === 'activo' ? `<button class="btn btn-ghost btn-sm" data-st="pausado">${icon('pause')} Pausar</button><button class="btn btn-ghost btn-sm" data-st="egresado">${icon('medal')} Egresado</button><button class="btn btn-ghost btn-sm text-danger" data-st="retirado">${icon('userX')} Retirar</button>` : `<button class="btn btn-secondary btn-sm" data-st="activo">${icon('userCheck')} Reactivar</button>`}</div>`;
      tb.querySelectorAll('[data-ung]').forEach((b) => b.onclick = async () => { if (await confirmDialog({ title: 'Sacar del grupo', message: `¿Sacar a ${esc(s.name)} de ${esc(store.groupLabel(store.group(b.dataset.ung)))}? Ya no se le cobrará su mensualidad.`, confirmText: 'Sacar', danger: true })) { await unenroll(s, b.dataset.ung); toast('Listo'); draw(); } });
      tb.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
        const stt = b.dataset.st;
        const msg = { retirado: 'Deja de generar mensualidades y su portal se desactiva. Su deuda se conserva.', pausado: 'No se le generan mensualidades mientras esté en pausa.', egresado: 'Terminó sus estudios: ya no se le generan mensualidades.', activo: 'Vuelve a generar mensualidades en sus grupos.' }[stt];
        if (!(await confirmDialog({ title: `${STUDENT_STATUS[stt].label}: ${esc(s.name)}`, message: msg, confirmText: 'Confirmar', danger: stt === 'retirado' }))) return;
        await setStudentStatus(s, stt); toast('Estado actualizado'); draw();
      });
    } else if (cur === 'cuenta') {
      if (!receipts) { tb.innerHTML = '<div class="empty"><div class="spinner"></div></div>'; return; }
      tb.innerHTML = receipts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Concepto</th><th class="hide-sm">Vence</th><th class="r">Monto</th><th>Estado</th><th></th></tr></thead><tbody>
        ${receipts.map((r) => { const x = led.find((y) => y.id === r.id); return `<tr><td class="mono small">${esc(r.number)}</td><td>${esc(r.kind === 'cargo' ? (r.items?.[0]?.concept || 'Cargo') : `Mensualidad ${periodName(r.period)}`)}</td><td class="hide-sm">${fmtDate(r.dueDate)}</td><td class="r num">${usd(r.total)}</td><td>${x ? (x.status === 'pagado' ? '<span class="badge badge-success">Pagado</span>' : x.status === 'parcial' ? `<span class="badge badge-warning">Resta ${usd(x.rest)}</span>` : '<span class="badge badge-danger">Pendiente</span>') : '<span class="badge badge-success">Pagado</span>'}</td><td><button class="btn btn-ghost btn-icon btn-sm" data-pr="${r.id}" title="Imprimir">${icon('print')}</button></td></tr>`; }).join('')}
        </tbody></table></div>` : emptyState('receipt', 'Sin mensualidades todavía', 'Aparecen al generar las mensualidades del mes.');
      tb.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipts([receipts.find((x) => x.id === b.dataset.pr)]));
    } else if (cur === 'pagos') {
      if (!payments) { tb.innerHTML = '<div class="empty"><div class="spinner"></div></div>'; return; }
      tb.innerHTML = payments.length ? `<div class="list">${payments.map((p) => `<div class="list-item"><span class="kpi-icon tone-${p.status === 'confirmado' ? 'success' : 'neutral'}" style="width:34px;height:34px">${icon('wallet')}</span><div class="grow" style="min-width:0"><b>${usd(p.amount)}</b> <span class="t-sub">${esc(p.number)}</span><div class="t-sub">${fmtDate(p.date)} · ${esc(methodLabel(p.method))}${p.reference ? ` · ref. ${esc(p.reference)}` : ''}${p.amountBs ? ` · Bs ${num(p.amountBs, 2)}` : ''}</div></div>${badge(PAY_STATUS, p.status)}<button class="btn btn-ghost btn-icon btn-sm" data-pp="${p.id}">${icon('print')}</button>${p.status === 'confirmado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-pv="${p.id}" title="Anular">${icon('x')}</button>` : ''}</div>`).join('')}</div>`
        : emptyState('wallet', 'Sin pagos registrados');
      tb.querySelectorAll('[data-pp]').forEach((b) => b.onclick = () => printPayment(payments.find((x) => x.id === b.dataset.pp)));
      tb.querySelectorAll('[data-pv]').forEach((b) => b.onclick = async () => {
        const { requirePin } = await import('./auth.js');
        if (!(await requirePin('Anular un pago'))) return;
        const reason = await promptDialog({ title: 'Anular pago', label: 'Motivo', confirmText: 'Anular' });
        if (reason == null) return;
        await voidPayment(payments.find((x) => x.id === b.dataset.pv), reason); toast('Pago anulado'); load();
      });
    } else if (cur === 'academico') {
      const scale = scaleOf(store.settings);
      const all = (s.groupIds || []).map((gid) => store.group(gid)).filter(Boolean);
      tb.innerHTML = all.length ? `<div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-rc>${icon('print')} Boletín</button></div>` + all.map((g) => {
        const sc = store.gradesOf(g.id); const avg = studentAverage(g, sc, id); const sheets = store.sheetsOf(g.id); const a = attendanceOf(id, sheets);
        return `<div class="card mt" style="padding:14px"><div class="between"><b>${esc(store.groupLabel(g))}</b>${avg != null ? `<span class="badge badge-${avg >= scale.pass ? 'success' : 'danger'}">Promedio ${num(avg, 2)}/${scale.max}</span>` : ''}</div>
          ${(g.evals || []).length ? `<div class="grade-row mt-sm">${g.evals.map((e) => { const v = sc[e.id]?.[id]; return `<div class="grade-cell ${v == null ? '' : v >= scale.pass ? 'ok' : 'bad'}"><small>${esc(e.name)} · ${num(e.weight, 0)}%</small><b>${v != null ? num(v, v % 1 ? 1 : 0) : '—'}</b></div>`; }).join('')}</div>` : '<div class="t-sub mt-xs">Sin evaluaciones configuradas.</div>'}
          ${a.total ? `<div class="mt-sm small">Asistencia <b>${a.pct}%</b> · ${a.P} P · ${a.T} T · ${a.A} A · ${a.J} J</div><div class="att-dots mt-xs">${sheets.filter((x) => x.marks?.[id]).slice(0, 20).reverse().map((x) => `<i class="tone-${ATT[x.marks[id]].tone}" title="${fmtDate(x.date)}: ${ATT[x.marks[id]].label}">${x.marks[id]}</i>`).join('')}</div>` : '<div class="t-sub mt-xs">Sin listas de asistencia todavía.</div>'}</div>`;
      }).join('') : emptyState('clipboard', 'Sin grupos', 'Inscríbelo en un grupo para ver sus notas y asistencia.');
      tb.querySelector('[data-rc]')?.addEventListener('click', () => printReportCard(s));
    } else if (cur === 'solicitudes') {
      tb.innerHTML = `<div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-a="req">${icon('plus')} Nueva solicitud</button></div>
        ${reqs.length ? `<div class="list mt">${reqs.map((x) => `<div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon(REQUEST_CATS[x.category]?.icon || 'info')}</span><div class="grow" style="min-width:0"><b>${esc(REQUEST_CATS[x.category]?.label || 'Solicitud')}</b><div class="t-sub">${esc(x.text)}</div><div class="t-sub">${fmtDateTime(x.createdAt)}${x.reply ? ` · respuesta: ${esc(x.reply)}` : ''}</div></div>${badge(REQUEST_STATUS, x.status)}</div>`).join('')}</div>` : emptyState('inbox', 'Sin solicitudes')}`;
    } else {
      tb.innerHTML = `<div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-a="cert">${icon('medal')} Emitir certificado</button></div>
        ${certs.length ? `<div class="list mt">${certs.map((c) => `<div class="list-item ${c.status === 'anulado' ? 'is-void' : ''}"><span class="kpi-icon tone-warning" style="width:34px;height:34px">${icon('medal')}</span><div class="grow"><b>${esc(c.courseName)}</b><div class="t-sub">${esc(c.number)} · ${fmtDate(c.date)}${c.grade != null ? ` · nota ${num(c.grade, 2)}` : ''}${c.status === 'anulado' ? ' · anulado' : ''}</div></div><button class="btn btn-ghost btn-icon btn-sm" data-cp="${c.id}" title="Imprimir">${icon('print')}</button></div>`).join('')}</div>` : emptyState('medal', 'Sin certificados', 'Emite el certificado cuando apruebe un curso. Lleva un QR para verificarlo en línea.')}`;
      tb.querySelectorAll('[data-cp]').forEach((b) => b.onclick = () => printCertificate(certs.find((c) => c.id === b.dataset.cp)));
    }
    body.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { cur = b.dataset.t; draw(); });
    body.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => act(b.dataset.a));
  };
  const act = async (a) => {
    if (a === 'pay') { const p = await paymentModal(s); if (p) load(); }
    if (a === 'wa') waStudent(studentBalance(s) > 0.009 ? (monthsOwed(s) >= 2 ? 'moroso' : 'recordatorio') : 'portal', { student: s });
    if (a === 'portal') portalModal(s);
    if (a === 'enroll') { if (await enrollModal(s)) draw(); }
    if (a === 'edit') { const r = await studentForm(s); if (r) draw(); }
    if (a === 'charge') { if (await chargeModal(s)) load(); }
    if (a === 'req') { if (await requestModal(s)) draw(); }
    if (a === 'cert') { if (await certModal(s)) draw(); }
    if (a === 'docs') {
      const dm = openModal({
        title: 'Documentos del alumno', size: 'sm',
        body: `<div class="list">${[['stmt', 'file', 'Estado de cuenta'], ['proof', 'clipboard', 'Constancia de estudios'], ['solv', 'shieldCheck', 'Constancia de solvencia'], ['card', 'user', 'Carnet con QR'], ['rc', 'chart', 'Boletín de notas y asistencia']].map(([k, ic, l]) => `<button class="list-item linkish" data-d="${k}" style="width:100%;text-align:left"><span class="kpi-icon tone-brand" style="width:34px;height:34px">${icon(ic)}</span><b class="grow">${l}</b>${icon('print')}</button>`).join('')}</div>`
      });
      dm.el.querySelectorAll('[data-d]').forEach((b) => b.onclick = async () => {
        const k = b.dataset.d;
        if (k === 'stmt') printStatement(s, receipts || await store.studentReceipts(id), payments || await store.studentPayments(id));
        if (k === 'proof') printStudyProof(s);
        if (k === 'solv') printStudyProof(s, { solvency: true });
        if (k === 'card') printCard([s]);
        if (k === 'rc') printReportCard(s);
      });
    }
  };
  const off = store.on('students', () => { if (document.body.contains(body)) draw(); else off(); });
  draw(); load();
}

export function chargeModal(s) {
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: `Cargo a ${esc(s.name.split(' ')[0])}`, size: 'sm', sub: 'Inscripción, materiales, uniforme, examen, recital… Se suma a su cuenta.',
      body: `<form class="stack" data-f><div class="field"><label>Tipo</label><div class="chips chips-wrap">${Object.entries(CHARGE_KINDS).filter(([k]) => k !== 'mora').map(([k, l], i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-k="${k}">${esc(l)}</button>`).join('')}</div></div>
        <div class="field"><label>Concepto</label><input class="input" name="concept" autofocus placeholder="Ej.: Libro de inglés A1"></div><div class="field"><label>Monto</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input" name="amount" inputmode="decimal"></div></div><div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('plus')} Cargar</button>`,
      onClose: () => resolve(ok)
    });
    let kind = 'inscripcion';
    m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; m.el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b)); const F = m.el.querySelector('[data-f]').elements; if (!F.concept.value.trim() || Object.values(CHARGE_KINDS).includes(F.concept.value)) F.concept.value = CHARGE_KINDS[kind]; });
    const go = async (e) => {
      e?.preventDefault();
      const F = m.el.querySelector('[data-f]').elements;
      try { await addStudentCharge(store.student(s.id) || s, { concept: F.concept.value || CHARGE_KINDS[kind], amount: parseNum(F.amount.value), kind }); ok = true; toast('Cargo registrado'); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; }
    };
    m.el.querySelector('[data-f]').onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

export function requestModal(s0 = null) {
  return new Promise(async (resolve) => {
    const s = s0 || await pickStudent({ title: 'Solicitud de…' });
    if (!s) { resolve(false); return; }
    let ok = false;
    const m = openModal({
      title: `Nueva solicitud · ${esc(s.name)}`, size: 'sm',
      body: `<form class="stack" data-f><div class="field"><label>Tipo</label><select class="input select" name="category">${Object.entries(REQUEST_CATS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</select></div><div class="field"><label>Descripción</label><textarea class="input textarea" name="text" rows="3" autofocus></textarea></div><div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(ok)
    });
    const go = async (e) => {
      e?.preventDefault();
      const F = m.el.querySelector('[data-f]').elements;
      try { await createRequest({ studentId: s.id, category: F.category.value, text: F.text.value }); ok = true; toast('Solicitud registrada'); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; }
    };
    m.el.querySelector('[data-f]').onsubmit = go; m.el.querySelector('[data-ok]').onclick = go;
  });
}

/** Emitir certificado de un curso al alumno */
export function certModal(s, groupId = '') {
  return new Promise((resolve) => {
    let ok = false;
    const groups = (s.groupIds || []).map((gid) => store.group(gid)).filter(Boolean);
    const scale = scaleOf(store.settings);
    if (!groups.length) { toast('El alumno no tiene grupos.', 'warning'); resolve(false); return; }
    const avgOf = (gid) => { const g = store.group(gid); return studentAverage(g, store.gradesOf(gid), s.id); };
    const first = groupId || groups[0].id;
    const m = openModal({
      title: `Certificado · ${esc(s.name)}`, size: 'sm', sub: 'Se imprime con diseño de diploma y un QR para verificarlo en línea.',
      body: `<form class="stack" data-f>
        <div class="field"><label>Curso</label><select class="input select" name="g">${groups.map((g) => `<option value="${g.id}" ${g.id === first ? 'selected' : ''}>${esc(store.groupLabel(g))}</option>`).join('')}</select></div>
        <div class="form-grid"><div class="field"><label>Nota final (opcional)</label><input class="input" name="grade" inputmode="decimal" value="${avgOf(first) != null ? num(avgOf(first), 2) : ''}"></div><div class="field"><label>Horas académicas</label><input class="input" name="hours" inputmode="numeric" value="${store.course(store.group(first)?.courseId)?.hours || ''}"></div></div>
        <div class="form-grid"><div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${todayKey()}"></div><div class="field"><label>Mención (opcional)</label><input class="input" name="mention" placeholder="De aprobación · Honor al mérito…"></div></div>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('medal')} Emitir e imprimir</button>`,
      onClose: () => resolve(ok)
    });
    const F = m.el.querySelector('[data-f]').elements;
    F.g.onchange = () => { const a = avgOf(F.g.value); F.grade.value = a != null ? num(a, 2) : ''; F.hours.value = store.course(store.group(F.g.value)?.courseId)?.hours || ''; };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const grade = F.grade.value.trim() === '' ? null : parseNum(F.grade.value);
      if (grade != null && grade < scale.pass && !(await confirmDialog({ title: 'Nota por debajo de la mínima', message: `La nota ${num(grade, 2)} es menor que ${scale.pass}. ¿Emitir el certificado de todas formas?`, confirmText: 'Emitir' }))) return;
      setBusy(e.currentTarget, true, 'Emitiendo…');
      try { const c = await issueCertificate(s, store.group(F.g.value), { grade, hours: parseNum(F.hours.value), date: F.date.value || todayKey(), mention: F.mention.value }); ok = true; m.close(); toast('Certificado ' + c.number); printCertificate(c); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  });
}
