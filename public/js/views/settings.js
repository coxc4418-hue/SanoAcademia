// SanoAcademia — Configuración: academia, reglas de cobro, notas, aulas, cuentas, portales, moneda y seguridad
import { store } from '../store.js';
import { requirePin, changePassword, authErrorMessage, session } from '../auth.js';
import { esc, num, toast, parseNum, setBusy, download, nowISO, round2, openModal, shortId, confirmDialog, emptyState, loc, flagImg, usd } from '../utils.js';
import { icon } from '../icons.js';
import { fxSectionHTML, bindFxSection } from '../bcv.js';
import { openCountryPicker, salesWa, SALES_PHONE_FMT, ENROLL_URL } from '../shared.js';
import { isStandalone, bindInstallButtons } from '../install.js';
import { EXPENSE_CATEGORIES, GRADE_SCALES, ROOMS_DEFAULT } from '../academy.js';
import { slugify, ensureCatalogCode } from '../ops.js';

const SECTIONS = { academia: 'Academia', cobro: 'Mensualidades y cobro', notas: 'Notas', aulas: 'Aulas', cuentas: 'Cuentas para cobrar', portal: 'Portales', moneda: 'Moneda', seguridad: 'Seguridad', apps: 'Instalar y respaldo' };
const sw = (name, on, title, sub) => `<label class="check box box-white"><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span><span><b>${title}</b><br><small class="muted">${sub}</small></span></label>`;
const save = (t) => `<div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} ${t || 'Guardar'}</button></div>`;
const BANK_TYPES = { transferencia: 'Transferencia bancaria', pagomovil: 'Pago móvil', zelle: 'Zelle', efectivo: 'Efectivo en la recepción', otro: 'Otro' };

export function mount(el, { params = {} }) {
  let sec = SECTIONS[params.tab || params.sec] ? (params.tab || params.sec) : 'academia';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Configuración</h1><p class="view-sub">Datos de la academia, reglas de cobro, escala de notas, aulas, cuentas, portales y seguridad.</p></div></div>
    <div class="tabs">${Object.entries(SECTIONS).map(([k, v]) => `<button data-s="${k}">${v}</button>`).join('')}</div>
    <div id="s-body" class="mt" style="max-width:980px"></div>`;
  const $ = (q) => el.querySelector(q);
  const s = () => store.settings;

  function render() {
    el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#s-body');

    if (sec === 'academia') {
      body.innerHTML = `<form class="card stack" id="f-adm">
        <div class="form-grid">
          <div class="field full"><label>Nombre de la academia o instituto</label><input class="input" name="businessName" value="${esc(s().businessName || store.tenant?.name || '')}" placeholder="Ej.: Academia de Idiomas Horizonte"></div>
          <div class="field full"><label>Lema (sale en la inscripción en línea y los impresos)</label><input class="input" name="slogan" value="${esc(s().slogan || '')}" placeholder="Ej.: Aprende haciendo, crece con nosotros"></div>
          <div class="field"><label>${esc(loc().tax)}</label><input class="input" name="rif" value="${esc(s().rif)}"></div>
          <div class="field"><label>Director(a) / firma</label><input class="input" name="manager" value="${esc(s().manager || '')}" placeholder="Firma constancias, boletines y certificados"></div>
          <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s().phone)}"></div>
          <div class="field"><label>WhatsApp de la academia</label><input class="input" name="whatsapp" value="${esc(s().whatsapp || '')}"><span class="hint">Aparece en los portales y en la inscripción en línea.</span></div>
          <div class="field"><label>Correo</label><input class="input" name="email" value="${esc(s().email || '')}"></div>
          <div class="field"><label>Dirección</label><input class="input" name="address" value="${esc(s().address)}"></div>
        </div>${save()}</form>`;
      $('#f-adm').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ businessName: F.businessName.value.trim(), slogan: F.slogan.value.trim(), rif: F.rif.value.trim(), manager: F.manager.value.trim(), phone: F.phone.value.trim(), whatsapp: F.whatsapp.value.trim(), email: F.email.value.trim(), address: F.address.value.trim() });
        if (F.businessName.value.trim() && !store.isDemo) { const { updateTenant } = await import('../store.js'); updateTenant(store.tenantId, { name: F.businessName.value.trim(), updatedAt: nowISO() }).catch(() => {}); }
        toast('Datos guardados');
      };
    }

    if (sec === 'cobro') {
      const late = s().lateFee || {};
      body.innerHTML = `<form class="card stack" id="f-rec">
        <div class="form-grid">
          <div class="field"><label>Día de vencimiento de la mensualidad</label><input class="input" name="dueDay" inputmode="numeric" value="${s().dueDay || 5}"><span class="hint">Del 1 al 28 de cada mes.</span></div>
          <div class="field"><label>Inscripción general</label><input class="input" name="enrollFee" inputmode="decimal" value="${num(s().enrollFee || 0, 2)}"><span class="hint">Cada curso puede tener la suya.</span></div>
          <div class="field"><label>Descuento por hermanos (%)</label><input class="input" name="siblingPct" inputmode="decimal" value="${num(s().siblingPct || 0, 0)}"><span class="hint">Desde el segundo hermano (mismo teléfono del representante). 0 = sin descuento.</span></div>
          <div class="field"><label>Prefijo del número de mensualidad</label><input class="input" name="invoicePrefix" maxlength="4" value="${esc(s().invoicePrefix || 'M')}"></div>
        </div>
        ${sw('lateOn', late.enabled, 'Cobrar recargo por mora', 'Al generar el mes, se agrega un recargo a quien tenga mensualidades vencidas sin pagar.')}
        <div class="form-grid"><div class="field"><label>Tipo de recargo</label><select class="input select" name="lateMode"><option value="fijo" ${late.mode !== 'pct' ? 'selected' : ''}>Monto fijo</option><option value="pct" ${late.mode === 'pct' ? 'selected' : ''}>% de lo vencido</option></select></div><div class="field"><label>Valor</label><input class="input" name="lateValue" inputmode="decimal" value="${num(late.value || 0, 2)}"></div></div>
        <div class="field"><label>Nota al pie de la mensualidad</label><textarea class="input textarea" name="receiptNote" rows="2">${esc(s().receiptNote || '')}</textarea></div>
        ${save()}</form>
        <div class="card mt-lg"><div class="card-head"><div class="card-title">${icon('tag')} Categorías de gasto</div><button class="btn btn-ghost btn-sm" id="c-reset">Restaurar</button></div>
          <div class="chips chips-wrap mt">${store.categories.map((c) => `<span class="chip">${icon(c.icon)} ${esc(c.name)}${EXPENSE_CATEGORIES.some((x) => x.id === c.id) ? '' : ` <button class="linkish" data-cdel="${c.id}">${icon('x')}</button>`}</span>`).join('')}<button class="chip" id="c-add">${icon('plus')} Agregar</button></div></div>`;
      $('#f-rec').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ dueDay: Math.min(28, Math.max(1, parseInt(F.dueDay.value, 10) || 5)), enrollFee: round2(parseNum(F.enrollFee.value)), siblingPct: Math.min(100, Math.max(0, parseNum(F.siblingPct.value))), lateFee: { enabled: F.lateOn.checked, mode: F.lateMode.value, value: round2(parseNum(F.lateValue.value)) }, invoicePrefix: F.invoicePrefix.value.trim().toUpperCase() || 'M', receiptNote: F.receiptNote.value.trim() });
        toast('Reglas de cobro guardadas');
      };
      $('#c-add').onclick = async () => {
        const { promptDialog } = await import('../utils.js');
        const name = await promptDialog({ title: 'Nueva categoría de gasto', label: 'Nombre', placeholder: 'Ej.: Uniformes' });
        if (!name?.trim()) return;
        await store.saveSettings({ categories: [...store.categories, { id: 'c' + shortId(5), name: name.trim(), icon: 'tag' }] }); render();
      };
      $('#c-reset').onclick = async () => { await store.saveSettings({ categories: EXPENSE_CATEGORIES }); render(); };
      body.querySelectorAll('[data-cdel]').forEach((x) => x.onclick = async () => { await store.saveSettings({ categories: store.categories.filter((c) => c.id !== x.dataset.cdel) }); render(); });
    }

    if (sec === 'notas') {
      const g = s().grades || {};
      body.innerHTML = `<form class="card stack" id="f-gr">
        <div class="field"><label>Escala de notas</label><div class="stack-sm">${Object.entries(GRADE_SCALES).map(([k, v]) => `<label class="check box box-white"><input type="radio" name="max" value="${k}" ${Number(g.max || 20) === Number(k) ? 'checked' : ''}> <span><b>${esc(v.label)}</b></span></label>`).join('')}</div></div>
        <div class="field" style="max-width:260px"><label>Nota mínima aprobatoria</label><input class="input" name="pass" inputmode="decimal" value="${num(g.pass ?? 10, 0)}"></div>
        <p class="hint" style="margin:0">El promedio de cada alumno se calcula con el peso de cada evaluación del grupo. Sale en el boletín, el portal y el certificado.</p>
        ${save()}</form>`;
      body.querySelectorAll('[name=max]').forEach((r) => r.onchange = () => { body.querySelector('[name=pass]').value = GRADE_SCALES[r.value].pass; });
      $('#f-gr').onsubmit = async (e) => { e.preventDefault(); const F = e.target.elements; const max = Number(body.querySelector('[name=max]:checked')?.value || 20); await store.saveSettings({ grades: { max, pass: Math.min(max, Math.max(0, parseNum(F.pass.value))) } }); toast('Escala guardada'); };
    }

    if (sec === 'aulas') {
      const list = s().rooms || [];
      body.innerHTML = `<div class="card card-flush"><div class="toolbar between"><div><b>Aulas y salones</b><div class="t-sub">Se usan en el horario para evitar que dos grupos coincidan en la misma aula.</div></div><button class="btn btn-primary btn-sm" id="r-new">${icon('plus')} Agregar</button></div>
        ${list.length ? `<div class="list" style="padding:6px 10px">${list.map((r) => { const n = store.liveGroups.filter((g) => g.room === r.id).length; return `<div class="list-item ${r.active === false ? 'is-void' : ''}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon('door')}</span><div class="grow"><b>${esc(r.name)}</b><div class="t-sub">${r.capacity ? `${r.capacity} puestos · ` : ''}${n} grupo(s)</div></div><button class="btn btn-ghost btn-icon btn-sm" data-re="${r.id}">${icon('edit')}</button>${n ? '' : `<button class="btn btn-ghost btn-icon btn-sm" data-rd="${r.id}">${icon('trash')}</button>`}</div>`; }).join('')}</div>` : `<div class="pd-3">${emptyState('door', 'Sin aulas', 'Agrega tus aulas, salones o laboratorios.')}</div>`}</div>`;
      $('#r-new').onclick = () => roomForm();
      body.querySelectorAll('[data-re]').forEach((x) => x.onclick = () => roomForm(list.find((r) => r.id === x.dataset.re)));
      body.querySelectorAll('[data-rd]').forEach((x) => x.onclick = async () => { await store.saveSettings({ rooms: list.filter((r) => r.id !== x.dataset.rd) }); render(); });
    }

    if (sec === 'cuentas') {
      const list = s().banks || [];
      body.innerHTML = `<div class="card card-flush"><div class="toolbar between"><div><b>Cuentas donde pagan los alumnos</b><div class="t-sub">Aparecen en la mensualidad, en los mensajes de WhatsApp y en el portal del alumno.</div></div><button class="btn btn-primary btn-sm" id="k-new">${icon('plus')} Agregar</button></div>
        ${list.length ? `<div class="list" style="padding:6px 10px">${list.map((b) => `<div class="list-item"><span class="kpi-icon tone-info" style="width:38px;height:38px">${icon(b.type === 'pagomovil' ? 'phone' : b.type === 'efectivo' ? 'cash' : 'card')}</span><div class="grow" style="min-width:0"><b>${esc(BANK_TYPES[b.type] || b.type)}${b.bank ? ` · ${esc(b.bank)}` : ''}</b><div class="t-sub ellipsis">${esc([b.number, b.phone, b.email, b.holder, b.idDoc].filter(Boolean).join(' · '))}</div></div><button class="btn btn-ghost btn-icon btn-sm" data-ke="${b.id}">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" data-kd="${b.id}">${icon('trash')}</button></div>`).join('')}</div>` : `<div class="pd-3">${emptyState('card', 'Sin cuentas', 'Agrega la cuenta bancaria, el pago móvil o el Zelle de la academia.')}</div>`}</div>`;
      $('#k-new').onclick = () => bankForm();
      body.querySelectorAll('[data-ke]').forEach((x) => x.onclick = () => bankForm(list.find((b) => b.id === x.dataset.ke)));
      body.querySelectorAll('[data-kd]').forEach((x) => x.onclick = async () => { await store.saveSettings({ banks: list.filter((b) => b.id !== x.dataset.kd) }); render(); });
    }

    if (sec === 'portal') {
      const P = s().portal || {};
      body.innerHTML = `<form class="card stack" id="f-portal">
        <p class="small muted" style="margin:0">Cada alumno y cada profesor tiene un enlace privado, sin usuario ni contraseña. El alumno ve <b>solo lo suyo</b>: horario, asistencia, notas, mensualidades, pagos y comunicados. El profesor ve sus grupos, pasa la lista y carga notas.</p>
        ${sw('enabled', P.enabled !== false, 'Portales activos', 'Si lo apagas, los enlaces muestran que el portal no está disponible.')}
        ${sw('reports', P.reports !== false, 'Permitir reportar pagos', 'El alumno o su representante indica monto, banco y referencia; tú lo confirmas en Cobranza.')}
        ${sw('grades', P.grades !== false, 'Mostrar las notas', 'Cada evaluación y el promedio del alumno.')}
        ${sw('attendance', P.attendance !== false, 'Mostrar la asistencia', 'Porcentaje y últimas clases.')}
        ${sw('requests', P.requests !== false, 'Recibir solicitudes y justificativos', 'Justificar inasistencias, pedir constancias, cambios de horario…')}
        ${sw('teachers', P.teachers !== false, 'Portal del profesor', 'Los profesores pasan la lista y cargan notas desde su teléfono.')}
        ${sw('enroll', P.enroll !== false, 'Inscripción en línea', 'Página pública con tus cursos, horarios y cupos para que se preinscriban.')}
        ${save()}</form>
        <div class="card mt-lg"><div class="card-title">${icon('link')} Enlace de inscripción en línea</div><div class="code-box mono small mt" style="word-break:break-all" id="p-url">${esc(ENROLL_URL() || 'Aún no creado')}</div><button class="btn btn-ghost btn-sm mt" id="p-make">${icon('refresh')} ${s().catalogCode ? 'Ver en Inscripciones' : 'Crear enlace'}</button></div>`;
      $('#f-portal').onsubmit = async (e) => { e.preventDefault(); const F = e.target.elements; await store.saveSettings({ portal: { enabled: F.enabled.checked, reports: F.reports.checked, grades: F.grades.checked, attendance: F.attendance.checked, requests: F.requests.checked, teachers: F.teachers.checked, enroll: F.enroll.checked } }); toast('Portales actualizados'); };
      $('#p-make').onclick = async () => { if (!s().catalogCode) { await ensureCatalogCode(); render(); } else location.hash = '#/inscripciones'; };
    }

    if (sec === 'moneda') {
      body.innerHTML = `<div class="card stack"><div class="between"><div><div class="card-title">${flagImg(loc().code, 20)} ${esc(loc().name)}</div><div class="t-sub">Trabajas en ${esc(loc().curName)} (${esc(loc().sym)})</div></div><button class="btn btn-secondary" id="m-country">${icon('globe')} Cambiar país</button></div></div><div class="mt-lg">${fxSectionHTML()}</div>`;
      bindFxSection(body, render);
      $('#m-country').onclick = async () => { if (!(await requirePin('Cambiar el país y la moneda'))) return; if (await openCountryPicker()) location.reload(); };
    }

    if (sec === 'seguridad') {
      body.innerHTML = `<div class="grid-2">
        <form class="card stack" id="f-pin"><div class="card-title">${icon('lock')} PIN de administrador</div><p class="small muted" style="margin:0">Protege anular mensualidades, pagos, gastos y certificados, cambiar el país y entrar a los reportes.</p>
          <div class="field"><label>Nuevo PIN (4 a 12 dígitos)</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <div class="field"><label>Repetir PIN</label><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <button class="btn btn-primary">${icon('check')} Cambiar PIN</button></form>
        ${session.user?.isAnonymous ? `<div class="card stack"><div class="card-title">${icon('shield')} Contraseña</div><p class="muted" style="margin:0">En la demo no hay contraseña. Contrata SanoAcademia para tener tu propia cuenta.</p><a class="btn btn-whatsapp" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>`
          : `<form class="card stack" id="f-pass"><div class="card-title">${icon('shield')} Contraseña de acceso</div>
          <div class="field"><label>Contraseña actual</label><input class="input" name="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña (mínimo 8)</label><input class="input" name="next" type="password" autocomplete="new-password"></div>
          <div class="error-msg" data-err></div>
          <button class="btn btn-primary">${icon('check')} Cambiar contraseña</button></form>`}
      </div>
      <div class="box small mt-lg">${icon('shieldCheck')} Los datos de los alumnos solo son visibles con tu usuario. Cada portal muestra únicamente la información de ese alumno (o de ese profesor y sus grupos) y los comunicados que publiques.</div>`;
      $('#f-pin').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        if (store.isDemo) { toast('En la demo el PIN siempre es 1234.', 'info'); return; }
        if (!/^\d{4,12}$/.test(F.pin.value)) { toast('El PIN debe tener de 4 a 12 dígitos', 'warning'); return; }
        if (F.pin.value !== F.pin2.value) { toast('Los PIN no coinciden', 'warning'); return; }
        if (store.hasPin() && !(await requirePin('Cambiar el PIN', { always: true }))) return;
        await store.setPin(F.pin.value); e.target.reset(); toast('PIN actualizado');
      };
      const fp = $('#f-pass');
      if (fp) fp.onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements; const err = fp.querySelector('[data-err]'); err.textContent = '';
        if (F.next.value.length < 8) { err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
        const btn = fp.querySelector('button'); setBusy(btn, true);
        try { await changePassword(F.cur.value, F.next.value); e.target.reset(); toast('Contraseña actualizada'); }
        catch (ex) { err.textContent = authErrorMessage(ex); }
        setBusy(btn, false);
      };
    }

    if (sec === 'apps') {
      body.innerHTML = `<div class="grid-2">
        <div class="card stack"><div class="card-title">${icon('install')} Instalar la app</div>
          <p class="small muted" style="margin:0">Instala SanoAcademia en la computadora de la recepción y en tu teléfono. Todo conectado en tiempo real, también sin internet.</p>
          ${isStandalone() ? `<div class="pay-status ok"><span>${icon('check')} Estás usando la app instalada</span><span></span></div>` : `<button class="btn btn-primary btn-lg" data-install>${icon('install')} Instalar en este equipo</button>`}
          <div class="list">
            <div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>Android</b><div class="t-sub">Chrome › menú ⋮ › Instalar app</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('laptop')}</span><div class="grow"><b>Computadora</b><div class="t-sub">Chrome o Edge › ícono de instalar en la barra de direcciones</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>iPhone / iPad</b><div class="t-sub">Safari › Compartir › Agregar a inicio</div></div></div>
          </div></div>
        <div class="card stack"><div class="card-title">${icon('download')} Respaldo de datos</div>
          <p class="small muted" style="margin:0">Descarga una copia de cursos, grupos, alumnos, profesores, asistencia, notas, mensualidades, pagos, gastos, certificados y configuración (JSON). Protegido con PIN.</p>
          <button class="btn btn-secondary" id="s-backup">${icon('download')} Descargar respaldo completo</button>
          <div class="divider"></div>
          <div class="card-title">${icon('whatsapp')} Soporte</div>
          <a class="btn btn-whatsapp" href="${salesWa('Hola, necesito soporte con SanoAcademia.')}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>
      </div>`;
      bindInstallButtons(body);
      $('#s-backup').onclick = async (e) => {
        const btn = e.currentTarget;
        if (!(await requirePin('Descargar el respaldo'))) return;
        setBusy(btn, true, 'Preparando…');
        try {
          const names = ['courses', 'groups', 'students', 'teachers', 'attendance', 'grades', 'closings', 'receipts', 'payments', 'payouts', 'expenses', 'notices', 'certificates'];
          const got = await Promise.all(names.map((n) => store.listAll(n)));
          const data = { app: 'SanoAcademia', exportedAt: nowISO(), business: store.businessName, settings: store.settings, inbox: store.inbox };
          names.forEach((n, i) => { data[n] = got[i]; });
          download(`respaldo-${slugify(store.businessName || 'sanoacademia')}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
          toast('Respaldo descargado');
        } catch (ex) { toast('No se pudo generar el respaldo: ' + ex.message, 'danger'); }
        setBusy(btn, false);
      };
    }
  }


  function bankForm(b = null) {
    const x = b || { type: loc().code === 'VE' ? 'pagomovil' : 'transferencia', active: true };
    const m = openModal({
      title: b ? 'Editar cuenta' : 'Nueva cuenta para cobrar', size: 'md',
      body: `<form class="stack" data-f>
        <div class="field"><label>Tipo</label><select class="input select" name="type">${Object.entries(BANK_TYPES).map(([k, l]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-grid">
          <div class="field"><label>Banco</label><input class="input" name="bank" value="${esc(x.bank || '')}" placeholder="Ej.: Banesco"></div>
          <div class="field"><label>N° de cuenta</label><input class="input" name="number" value="${esc(x.number || '')}"></div>
          <div class="field"><label>Teléfono (pago móvil)</label><input class="input" name="phone" value="${esc(x.phone || '')}"></div>
          <div class="field"><label>Correo (Zelle)</label><input class="input" name="email" value="${esc(x.email || '')}"></div>
          <div class="field"><label>Titular</label><input class="input" name="holder" value="${esc(x.holder || '')}" placeholder="Academia Arcoíris C.A."></div>
          <div class="field"><label>${esc(loc().tax)} / ${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(x.idDoc || '')}"></div>
        </div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      const F = m.el.querySelector('[data-f]').elements;
      const item = { id: x.id || 'k' + shortId(5), type: F.type.value, bank: F.bank.value.trim(), number: F.number.value.trim(), phone: F.phone.value.trim(), email: F.email.value.trim(), holder: F.holder.value.trim(), idDoc: F.idDoc.value.trim(), active: true };
      const list = s().banks || [];
      await store.saveSettings({ banks: b ? list.map((y) => (y.id === b.id ? item : y)) : [...list, item] });
      m.close(); toast('Cuenta guardada'); render();
    };
  }
  function roomForm(r = null) {
    const x = r || { name: '', capacity: '' };
    const m = openModal({
      title: r ? 'Editar aula' : 'Nueva aula', size: 'sm',
      body: `<form class="stack" data-f><div class="field"><label>Nombre</label><input class="input" name="name" value="${esc(x.name)}" autofocus placeholder="Ej.: Aula 3, Salón de danza"></div>
        <div class="field"><label>Capacidad (puestos)</label><input class="input" name="capacity" inputmode="numeric" value="${x.capacity || ''}"></div>
        <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> <span>Disponible</span></label></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    const list = s().rooms || [];
    m.el.querySelector('[data-ok]').onclick = async () => {
      const F = m.el.querySelector('[data-f]').elements;
      if (!F.name.value.trim()) { toast('Escribe el nombre', 'warning'); return; }
      const item = { ...x, id: x.id || 'r' + shortId(5), name: F.name.value.trim(), capacity: parseInt(F.capacity.value, 10) || 0, active: F.active.checked };
      await store.saveSettings({ rooms: r ? list.map((y) => (y.id === r.id ? item : y)) : [...list, item] });
      m.close(); toast('Aula guardada'); render();
    };
  }

  el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { sec = b.dataset.s; render(); });
  render();
  return () => {};
}
