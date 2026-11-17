// SanoAcademia — Certificados: emisión por grupo, impresión con QR y verificación pública
import { store } from '../store.js';
import { esc, emptyState, toast, openModal, setBusy, confirmDialog, fmtDate, todayKey, num, normalize } from '../utils.js';
import { icon } from '../icons.js';
import { studentAverage, attendanceOf, scaleOf } from '../academy.js';
import { issueCertificate, voidCertificate } from '../ops.js';
import { studentAvatar, openStudent, groupOptions } from '../student.js';
import { printCertificate, CERT_URL } from '../shared.js';

export function mount(el, { params }) {
  let q = '';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Certificados</h1><p class="view-sub">Diplomas con código QR: cualquiera puede verificar en línea que el certificado es auténtico.</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="c-batch">${icon('medal')} Emitir para un grupo</button></div></div>
    <div class="card card-flush"><div class="toolbar"><label class="search grow">${icon('search')}<input id="c-q" placeholder="Buscar alumno, curso o número…"></label></div><div id="c-list"></div></div>`;
  const $ = (s) => el.querySelector(s);

  function draw() {
    const t = normalize(q);
    const list = store.certificates.filter((c) => !t || normalize(`${c.studentName} ${c.courseName} ${c.number} ${c.verify}`).includes(t));
    $('#c-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>N°</th><th>Alumno</th><th class="hide-sm">Curso</th><th class="hide-sm">Fecha</th><th class="c">Nota</th><th></th></tr></thead><tbody>
      ${list.map((c) => `<tr class="${c.status === 'anulado' ? 'is-void' : ''}"><td class="mono small">${esc(c.number)}</td><td><button class="linkish" data-s="${c.studentId}">${esc(c.studentName)}</button><div class="t-sub show-sm">${esc(c.courseName)}</div>${c.status === 'anulado' ? '<span class="badge badge-neutral">Anulado</span>' : ''}</td><td class="hide-sm">${esc(c.courseName)}${c.mention ? `<div class="t-sub">${esc(c.mention)}</div>` : ''}</td><td class="hide-sm">${fmtDate(c.date)}</td><td class="c">${c.grade != null ? num(c.grade, c.grade % 1 ? 2 : 0) : '—'}</td>
        <td class="r" style="white-space:nowrap">${c.status !== 'anulado' ? `<button class="btn btn-ghost btn-icon btn-sm" data-pr="${c.id}" title="Imprimir">${icon('print')}</button><a class="btn btn-ghost btn-icon btn-sm" href="${CERT_URL(c.verify)}" target="_blank" rel="noopener" title="Verificación">${icon('qr')}</a><button class="btn btn-ghost btn-icon btn-sm" data-vd="${c.id}" title="Anular">${icon('x')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="pd-3">${emptyState('medal', store.certificates.length ? 'Sin resultados' : 'Aún no hay certificados', 'Al terminar un curso, emite los certificados de los alumnos aprobados en un solo paso.')}</div>`;
    el.querySelectorAll('#c-list [data-s]').forEach((b) => b.onclick = () => openStudent(b.dataset.s, { tab: 'certificados' }));
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printCertificate(store.certificates.find((c) => c.id === b.dataset.pr)));
    el.querySelectorAll('[data-vd]').forEach((b) => b.onclick = async () => {
      const { requirePin } = await import('../auth.js');
      if (!(await requirePin('Anular un certificado'))) return;
      if (!(await confirmDialog({ title: 'Anular certificado', message: 'La página de verificación mostrará que el certificado fue anulado.', confirmText: 'Anular', danger: true }))) return;
      await voidCertificate(store.certificates.find((c) => c.id === b.dataset.vd)); toast('Certificado anulado');
    });
  }

  function batch(groupId = '') {
    const m = openModal({ title: 'Emitir certificados', size: 'lg', sub: 'Elige el grupo: se sugieren los alumnos aprobados con buena asistencia.',
      body: `<div class="stack"><div class="form-grid"><div class="field"><label>Grupo</label><select class="input" data-g><option value="">— Elige el grupo —</option>${groupOptions(groupId, { includeEnded: true })}</select></div><div class="field"><label>Fecha del certificado</label><input class="input" type="date" data-d value="${todayKey()}"></div></div><div data-l></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('medal')} Emitir</button>` });
    const sel = m.el.querySelector('[data-g]');
    const drawList = () => {
      const g = store.group(sel.value);
      const box = m.el.querySelector('[data-l]');
      if (!g) { box.innerHTML = ''; m.el.querySelector('[data-ok]').disabled = true; return; }
      const scale = scaleOf(store.settings);
      const sc = store.gradesOf(g.id); const sheets = store.sheetsOf(g.id);
      const roster = store.students.filter((s) => (s.groupIds || []).includes(g.id) && s.status !== 'retirado');
      const has = new Set(store.certificates.filter((c) => c.groupId === g.id && c.status !== 'anulado').map((c) => c.studentId));
      box.innerHTML = roster.length ? `<div class="list">${roster.map((s) => { const avg = studentAverage(g, sc, s.id); const a = attendanceOf(s.id, sheets); const ok = !has.has(s.id) && (avg == null || avg >= scale.pass) && (a.pct == null || a.pct >= 70);
        return `<label class="list-item linkish"><input type="checkbox" data-s="${s.id}" ${ok ? 'checked' : ''} ${has.has(s.id) ? 'disabled' : ''}>${studentAvatar(s)}<div class="grow"><b>${esc(s.name)}</b><div class="t-sub">${avg != null ? `promedio <b class="${avg >= scale.pass ? 'text-success' : 'text-danger'}">${num(avg, 2)}</b>` : 'sin notas'}${a.pct != null ? ` · asistencia ${a.pct}%` : ''}${has.has(s.id) ? ' · <span class="text-success">ya tiene certificado</span>' : ''}</div></div><input class="input" data-mn="${s.id}" placeholder="Mención (opcional)" style="max-width:170px" ${has.has(s.id) ? 'disabled' : ''}></label>`; }).join('')}</div>` : emptyState('users', 'Grupo sin alumnos');
      const upd = () => { const n = box.querySelectorAll('[data-s]:checked').length; const b = m.el.querySelector('[data-ok]'); b.disabled = !n; b.innerHTML = `${icon('medal')} Emitir ${n || ''} certificado(s)`; };
      box.querySelectorAll('[data-s]').forEach((c) => c.onchange = upd); upd();
    };
    sel.onchange = drawList; drawList();
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const g = store.group(sel.value); const date = m.el.querySelector('[data-d]').value || todayKey();
      const ids = [...m.el.querySelectorAll('[data-s]:checked')].map((c) => c.dataset.s);
      setBusy(e.currentTarget, true, 'Emitiendo…');
      const sc = store.gradesOf(g.id);
      const out = [];
      for (const id of ids) { const s = store.student(id); const avg = studentAverage(g, sc, id); out.push(await issueCertificate(s, g, { grade: avg, date, mention: m.el.querySelector(`[data-mn="${id}"]`)?.value || '' })); }
      m.close(); toast(`${out.length} certificado(s) emitido(s)`);
      if (await confirmDialog({ title: 'Certificados listos', message: '¿Imprimirlos ahora? (hoja A4 horizontal)', confirmText: 'Imprimir', cancelText: 'Después' })) printCertificate(out);
    };
  }

  $('#c-q').oninput = (e) => { q = e.target.value; draw(); };
  $('#c-batch').onclick = () => batch();
  draw();
  if (params?.groupId) batch(params.groupId);
  const off = store.on('*', (e) => { if (['certificates', 'students'].includes(e)) draw(); });
  return () => off();
}
