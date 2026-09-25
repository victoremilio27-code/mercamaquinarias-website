# MercaMaquinarias

## What This Is

El marketplace de maquinaria y equipo pesado de República Dominicana: un sitio donde
dealers, talleres y particulares publican, buscan y contactan sobre excavadoras,
cargadoras, camiones y equipo de construcción. Además del catálogo, la empresa presta
servicios propios — alquiler de equipos con operador e importación bajo pedido — y
prepara transporte y financiamiento para después del lanzamiento.

Lo opera Inversiones XZT, S.R.L. (RNC 1-31-27975-9, RM 116099SD). El sitio ya está en
producción pero todavía no se ha anunciado: solo lo conocen las personas a las que
Victor se lo ha mostrado.

## Core Value

**Ser el punto de referencia del país para quien tenga, necesite o trabaje con
maquinaria pesada** — lo que Supercarros es a los vehículos. Hoy no existe ningún
marketplace de maquinaria en RD: ese vacío es la oportunidad y ocuparlo es lo único que
no puede fallar.

Corolario que ordena las prioridades: el sitio no basta con que se vea bien para
investigar. Tiene que ser igual de eficaz **operando** — publicar, tener alcance como
vendedor, que la empresa recaude, y que el comprador navegue sin fricción.

## Requirements

### Validated

<!-- Construido, desplegado y comprobado en producción. -->

- ✓ Catálogo público con filtros por categoría, marca, condición, año, horas, precio y provincia
- ✓ Ficha de equipo con fotos, video, tren motriz y contactos del vendedor
- ✓ Cuentas, sesiones, códigos por correo y recuperación de contraseña
- ✓ Publicación de anuncios con cupos por suscripción, pausado y caducidad
- ✓ Panel del anunciante con métricas propias
- ✓ Página propia del dealer: logo, portada, lema, galería y bloques reordenables, con seis reglas visibles y estado borrador/publicada
- ✓ Directorio de dealers
- ✓ Facturación conforme a DGII: NCF B01/B02/B04, ITBIS 18 %, PDF generado sin dependencias
- ✓ Asistente de soporte en el sitio (apagado hasta contratar la clave de Anthropic)
- ✓ Informes semanal y mensual a gerencia
- ✓ Solicitudes de alquiler e importación
- ✓ Correo transaccional por Brevo, con transporte de archivo para desarrollo
- ✓ Metadatos por anuncio para compartir en WhatsApp, sitemap y robots.txt

### Active

<!-- Alcance actual, en el orden de fases acordado. -->

**Fase 1 — Lanzamiento**
- [ ] Cobro con CardNet, construido y probado pero **apagado** hasta que Victor contrate el servicio
- [ ] Tema claro y oscuro coherentes en todo el sitio, con comprobación automática
- [ ] Barrera de CI: ninguna fusión a `main` se despliega sin que pasen las pruebas
- [ ] Contactos verificados por correo y SMS
- [ ] Pantalla de administración para las solicitudes de servicio
- [ ] `CLAUDE.md` propio del repositorio

**Fase 2 — Transporte y financiamiento**
- [ ] Encender los dos servicios hoy apagados en `assets/servicios.js`

**Fase 3 — Lote del contador**
- [ ] Paquete mensual de comprobantes que Victor descarga y envía él mismo

**Fase 4 — Deuda técnica**
- [ ] Testigos de sesión cifrados, `scrypt` asíncrono, enumeración de usuarios por tiempo
- [ ] Partir `tools/db.js` (3.353 líneas) y `tools/api.js` (2.677) para que varias manos no choquen
- [ ] Respaldos fuera del VPS

### Out of Scope

- **Modelo de negocio de los planes y sus precios** — se trabaja por otro lado. Se usa `planes.perfil_publico` tal como está; no se proponen planes ni precios nuevos.
- **Envío automático de comprobantes al contador** — regla explícita de Victor: los acumula y los manda él a fin de mes.
- **Teléfono como canal de soporte** — por ahora solo correo electrónico y el asistente del sitio. No se publica número.
- **Otros países de la región** — es el norte a largo plazo, no de este año. Hoy el NCF está atado a la DGII dominicana.
- **Escalar tráfico e inventario** — hará falta, pero primero hay que conseguir ese tráfico.

## Context

- **El sitio ya es público pero no se ha anunciado.** El único anuncio es de Victor, subido para probar y poder enseñar el sitio. No hay usuarios reales **porque todavía no hay forma de cobrar**.
- **CardNet es la pasarela elegida**, con pago mensual recurrente. Victor la contratará de última, justo antes de abrir con marketing. Hoy **no existe ninguna integración de pago en el código**: la tabla `metodos_pago` tiene columnas `procesador` y `token` preparadas desde el principio, pero nadie escribe en ella.
- **No hay competencia.** Quien vende maquinaria hoy usa Facebook Marketplace o grupos de WhatsApp. No hay referencia nacional.
- **Ya hay otra persona subiendo cambios al repositorio**, y fusionar a `main` despliega a producción sin ninguna barrera de pruebas.
- Una auditoría completa se ejecutó y desplegó el 2026-09-24; su detalle está en `.planning/codebase/CONCERNS.md`.
- El mapa completo del código está en `.planning/codebase/` (7 documentos, 1.071 líneas).

## Constraints

- **Timeline**: lanzamiento el **2026-09-30**, prorrogable como máximo hasta ~**2026-10-16**. Las fases se ordenan por lo que bloquea el lanzamiento.
- **Dependencies**: CardNet sin contratar; fechas de vencimiento de los NCF pendientes del contador; créditos SMS de Brevo y clave de Anthropic en espera. Todo lo que dependa de ellos se entrega construido y apagado tras un interruptor.
- **Tech stack**: cero dependencias en tiempo de ejecución, `node:sqlite`, sin paso de compilación, sin TypeScript. Es deliberado y load-bearing.
- **Security / fiscal**: un comprobante emitido nunca se borra ni se reescribe; las migraciones solo se añaden al final.
- **Team**: dos personas tocando el repositorio. Nunca reescribir historial, nunca `--force`, siempre rama y PR.
- **Infra**: droplet de 512 MB al 60 % de disco. Techo real para fotos y video.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fases en orden fijo: lanzamiento → transporte/financiamiento → lote del contador → deuda | Victor quiere dar luz verde fase por fase, con el plan escrito de antemano | — Pendiente |
| Una petición nueva a mitad de fase no interrumpe: se encola en su fase | Si cada ocurrencia reabre una fase cerrada, ninguna fase termina nunca | — Pendiente |
| Lo que depende de un pago se construye entero y se entrega apagado | Ya funcionó dos veces (SMS de Brevo, clave de Anthropic): el día que se paga es encender, no construir | ✓ Bueno |
| Transporte y financiamiento apagados por `assets/servicios.js`, no borrados | Victor los quiere después del lanzamiento; borrarlos obligaría a reescribirlos | ✓ Bueno |
| Cero dependencias en tiempo de ejecución | Menos superficie de ataque y de mantenimiento en un VPS de 512 MB | ✓ Bueno |

## Evolution

Este documento evoluciona en las transiciones de fase y en los limites de hito.

**Al cerrar cada fase** (via `/gsd-transition`):
1. Requisitos invalidados -> moverlos a Out of Scope con su razon
2. Requisitos validados -> moverlos a Validated citando la fase
3. Requisitos nuevos -> anadirlos a Active, en la fase que les toque
4. Decisiones que registrar -> anadirlas a Key Decisions
5. Sigue siendo exacto el "What This Is"? -> actualizarlo si se desvio

**Al cerrar cada hito** (via `/gsd-complete-milestone`):
1. Repaso completo de todas las secciones
2. Revisar el Core Value: sigue siendo la prioridad correcta?
3. Auditar Out of Scope: siguen valiendo las razones?
4. Actualizar Context con el estado real

---
*Last updated: 2026-09-25 after la sesión de preguntas inicial de GSD*
