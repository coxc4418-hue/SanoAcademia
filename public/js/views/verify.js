// SanoAcademia — Verificación pública de certificados: /certificado/CODIGO
import { getCert } from '../store.js';
import { esc, fmtDate, num } from '../utils.js';
import { icon } from '../icons.js';

export async function mount(root) {
  document.title = 'Verificar certificado · SanoAcademia';
  const code = (/\/certificado\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="portal-page"><div class="empty"><div class="spinner"></div></div></div>';
  let c = null;
  try { c = code ? await getCert(code) : null; } catch (e) { console.error(e); }
  const ok = c && c.status === 'valido';
  root.innerHTML = `<div class="portal-page verify-page">
    <div class="card verify-card ${ok ? 'ok' : 'bad'}">
      <div class="verify-top"><img src="/assets/logo.svg" alt="" width="40"><b>Verificación de certificado</b></div>
      <div class="verify-seal">${icon(ok ? 'shieldCheck' : 'alert')}</div>
      <h1>${!c ? 'Certificado no encontrado' : ok ? 'Certificado auténtico' : 'Certificado anulado'}</h1>
      ${c ? `<p class="muted">${ok ? 'Este certificado fue emitido por la academia y es válido.' : 'La academia anuló este certificado. No es válido.'}</p>
        <div class="kv kv-1 verify-kv">
          <div><span>Otorgado a</span><b>${esc(c.student)}</b></div>
          ${c.idDoc ? `<div><span>Documento</span><b>${esc(c.idDoc)}</b></div>` : ''}
          <div><span>Curso</span><b>${esc(c.course)}${c.level ? ` · ${esc(c.level)}` : ''}</b></div>
          ${c.hours ? `<div><span>Duración</span><b>${num(c.hours, 0)} horas académicas</b></div>` : ''}
          ${c.grade != null ? `<div><span>Calificación</span><b>${num(c.grade, c.grade % 1 ? 2 : 0)} / ${c.scaleMax || 20}</b></div>` : ''}
          ${c.mention ? `<div><span>Mención</span><b>${esc(c.mention)}</b></div>` : ''}
          <div><span>Fecha</span><b>${fmtDate(c.date)}</b></div>
          <div><span>Emitido por</span><b>${esc(c.academy)}</b></div>
          ${c.teacher ? `<div><span>Profesor(a)</span><b>${esc(c.teacher)}</b></div>` : ''}
          <div><span>N° de certificado</span><b class="mono">${esc(c.number)}</b></div>
          <div><span>Código</span><b class="mono">${esc(code)}</b></div>
        </div>` : `<p class="muted">El código <b class="mono">${esc(code || '—')}</b> no corresponde a ningún certificado. Revisa que esté bien escrito.</p>`}
      <form class="row mt" style="gap:6px;justify-content:center" id="vf"><input class="input mono" style="max-width:200px;text-transform:uppercase" name="c" placeholder="Otro código" maxlength="12"><button class="btn btn-secondary">${icon('search')} Verificar</button></form>
    </div>
    <p class="portal-by">Verificación segura · <b>SanoAcademia</b></p></div>`;
  root.querySelector('#vf').onsubmit = (e) => { e.preventDefault(); const v = e.target.elements.c.value.trim().toUpperCase(); if (v.length >= 6) location.href = '/certificado/' + encodeURIComponent(v); };
}
