# SanoAcademia 🎓

Software de gestión para academias, institutos de idiomas, escuelas de música, computación, arte, danza, preuniversitarios y cursos en general, de la línea **Sano** (SanoGym, SanoDental, SanoDoctor, SanoTecnico, SanoGestion, SanoCortes, SanoFarmacia, SanoLicores, SanoCondominio).

**Producción:** https://sano-academia.web.app · **Credenciales:** `CREDENCIALES_SANO_ACADEMIA.txt` (no se sube a git)

![SanoAcademia](public/tutorial/portada.jpg)

## Qué hace

| Módulo | Detalle |
|---|---|
| Inicio | Clases de hoy con la que está en curso resaltada y botón para pasar lista; “Tu mes” en 3 pasos (mensualidades → cobrar → pagar profesores); pagos reportados, preinscripciones y solicitudes por atender; morosos y cumpleaños de la semana. |
| Horario semanal | Todos los grupos por día y hora, con filtro por aula, profesor o curso, vista por día en el teléfono e impresión. **Detecta choques** de aula y de profesor al crear un grupo. |
| Cursos y grupos | Categorías (idiomas, música, computación, arte, danza, deportes, preuniversitario…), mensualidad e inscripción por curso, grupos con horario, aula, cupo, profesor, fechas y estado. |
| Asistencia | Lista con un toque (presente, tarde, ausente, justificado), aviso por WhatsApp al representante de quien faltó, historial por grupo y alertas de ausencias. |
| Notas | Plan de evaluación con porcentajes, promedio ponderado automático, escala configurable (0-20, 0-10, 0-100, 1-5), boletines y acta del grupo. |
| Alumnos | Ficha con representante, salud, grupos, estado de cuenta, notas, asistencia y portal; becas y descuentos; carnets; importar/exportar CSV. |
| Mensualidades | Generación en un clic según los grupos de cada alumno, **descuento por hermanos**, becas y **recargo por mora**; vista previa, envío por WhatsApp y anulación. |
| Cobranza | Pagos en dólares o bolívares a **tasa BCV** del día, abonos, saldo a favor, pagos reportados desde el portal para confirmar, morosos y recordatorios. |
| Profesores | Pago por hora, por clase, sueldo fijo o porcentaje, **calculado con las listas de asistencia**; recibos y nómina imprimible. |
| Portal del alumno | `/portal/CÓDIGO` sin contraseña: horario y próxima clase, mensualidades, reportar pago, notas, asistencia, avisos, solicitudes y justificativos, certificados. |
| Portal del profesor | `/profe/CÓDIGO`: clases del día, **pasar lista y cargar notas desde el teléfono**, horas dictadas y pagos. |
| Inscripción en línea | `/inscripcion/CÓDIGO` con QR: catálogo de cursos con horarios y cupos libres; la preinscripción se convierte en alumno inscrito en un clic. |
| Certificados | Emisión por grupo a los aprobados, con **código QR verificable** en `/certificado/CÓDIGO`; anulación. |
| Gastos y reportes | Gastos por categoría, ingresos vs. egresos, ingreso por curso, asistencia por grupo, morosidad por antigüedad, altas y bajas. |
| Demo | 30 minutos sin registro con una academia de ejemplo (9 cursos, 14 grupos, 6 profesores, 60+ alumnos, PIN 1234) y recorrido guiado; todo se borra al terminar. |

## Estructura

- `public/` — la app (JavaScript sin compilación + Firebase 10.14.1). `js/views/` una pantalla por archivo; `js/academy.js` horarios, mensualidades, estado de cuenta, notas y asistencia; `js/ops.js` operaciones (inscribir, cobrar, pagar profesores, certificados, publicar portales).
- `firestore.rules` — cada academia solo ve lo suyo (`tenants/{uid}`); `portals`, `catalogs` y `certs` se leen solo por código exacto; `inbox` valida cada pago, solicitud, lista, nota o preinscripción que llega desde un portal (el profesor solo puede enviar de sus propios grupos).
- `scripts/` — aprovisionamiento, pruebas y video tutorial.

## Comandos (desde `scripts/`)

```sh
# Emuladores (en la carpeta del proyecto)
firebase emulators:start --only auth,firestore,hosting --project sano-academia   # app en http://127.0.0.1:5181/?emu=1

sh test-emu.sh                 # crea las cuentas en el emulador y corre la prueba E2E (54 verificaciones)
node mobile-check.mjs          # varios tamaños de pantalla (320 px a portátil) + portal, sin desbordes
node prod-smoke.mjs            # prueba rápida en producción (la demo se limpia sola)
node pwa-check.mjs             # instalable en PC y Android

node provision.mjs 20          # crea/actualiza las cuentas en producción
node icons.mjs                 # regenera íconos y logos desde public/assets/logo.svg
node tutorial/make-video.mjs   # graba el video tutorial narrado (voz es-VE)
firebase deploy --only firestore,hosting --project sano-academia
```
