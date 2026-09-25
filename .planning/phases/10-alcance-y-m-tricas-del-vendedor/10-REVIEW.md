---
phase: 10-alcance-y-m-tricas-del-vendedor
reviewed: 2026-09-25
depth: standard
alcance: "git diff a9184fa..HEAD -- . ':!.planning' (16 archivos, +1.629/−19)"
status: fixed
findings: { critical: 0, warning: 3, info: 3 }
---

# Fase 10 — Revisión de código

Revisado todo lo que cambió la fase fuera de `.planning/`. Tres advertencias, las tres
corregidas con commit propio; tres notas informativas que no se tocan.

## Lo que se pidió comprobar expresamente

| Punto | Resultado |
|-------|-----------|
| `GET /api/anuncios?ids=` no filtra anuncios no activos | ✓ `filtrosCatalogo` añade `a.id IN (:id0, …)` a una cláusula que siempre lleva `a.estado = 'activo' AND a.publicado <= :ahora`. Los ids se validan con `^[\w-]{1,64}$`, sin repetidos, tope 60 y como parámetros con nombre; si no queda ninguno válido, la respuesta es vacía y no el catálogo entero. Probado con uno pausado, uno inventado, una inyección y 61 ids |
| `/api/mis-anuncios/:id/copia` solo para el dueño y sin serie | ✓ `copiaDeAnuncio` exige `organizacion_id` de la sesión; un id ajeno recibe el mismo 404 y el mismo texto que uno inexistente; `serie: ''` siempre. El precio mínimo solo viaja a su dueño |
| `/api/mis-contactos` acotado a la organización | ✓ La organización sale de `ctx.organizacion`, nunca de la petición; `?anuncio=` de otra organización devuelve cero; `canal` contra lista cerrada; `limite` 1..200. La tabla no guarda huella ni IP |
| Borrado de fotos y `rutasEnUso` sin borrar de más ni de menos | ✓ con una corrección (WR-03). `borrarAnuncio` calcula `rutasEnUso()` después del COMMIT y devuelve solo lo que ya no usa nadie: no borra de más. Lo que se conserva lo recoge la tarea de huérfanos cuando deja de usarse: no queda basura para siempre. Mutación comprobada: sin el filtro, «MAL las fotos que usa la copia siguen en disco» |
| Reglas de `CLAUDE.md` | ✓ Sin dependencias nuevas; la migración va al final de `MIGRACIONES`; ningún teléfono publicado (el texto de compartir lleva equipo, precio y URL); nada se envía al contador; los módulos compartidos navegador/node no se tocan; todo en español; rutas específicas antes que las genéricas (`mis-anuncios/:id/copia` antes de `anuncios/:id`) |

## Advertencias (corregidas)

### WR-01 · Duplicar no precargaba motor ni transmisión — 1b538c8
`copiarAnuncio` mandaba el tren motriz, pero `montarPublicador` solo reponía la cadena
categoría → subcategoría → marca → modelo. Al duplicar un camión, justo donde más pesa ese
dato, el dealer tenía que volver a elegirlo: el criterio 4 («solo edita lo que cambia»)
fallaba para vehículos de carretera. Estaba anotado como fuera de alcance en
`deferred-items.md`; no lo es. Ahora se reponen marca y modelo de motor y transmisión con
sus `change`, y vale para cualquier borrador recuperado.

### WR-02 · El tope de guardados no coincidía con el de la API — 4dace4a
`GUARDADOS` admitía 100 y la API devuelve como máximo 60 por `?ids=`. Del 61 en adelante,
`montarGuardados` los daba por «ya no publicados» y ofrecía borrarlos: pérdida de datos
del comprador. El tope pasa a 60, con el porqué en el código.

### WR-03 · `rutasEnUso()` no contaba `flota.foto` — 81d1078
Es la foto de respaldo de un equipo de la flota sin galería (`fotosDeFlota`) y se sigue
escribiendo en `crearFlota`. La tarea de huérfanos podía borrarla. Añadida, con su
comprobación en `metricas:probar` (mutación comprobada).

## Informativas (sin cambio)

- **IN-01 · `GET /api/anuncios/:id` responde para cualquier estado,** también pausados o
  vendidos. Anterior a esta fase; los guardados no dependen de ella porque van por el
  catálogo. Se deja anotado.
- **IN-02 · `favorito` y `compartir` se pueden inflar** cambiando de `User-Agent` desde la
  misma IP, hasta el tope de 300 eventos cada 15 minutos. Es la misma exposición que ya
  tenían `vista` y `whatsapp`; la deduplicación no cambió.
- **IN-03 · Al pasar de 60 guardados se cae el más antiguo sin aviso.** Aceptable para
  una lista personal; si llega a molestar, avisar en la ficha.

## Pruebas tras las correcciones

`metricas:probar` 60/0 y el resto del arnés en verde (ver `10-VERIFICATION.md`). Las
auditorías de navegador no se pudieron correr en esta sesión (Chromium como root sin
sandbox, denegado por la política de permisos); WR-01 y WR-02 las valida el job
`navegador` del CI.
