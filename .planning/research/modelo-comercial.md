CAMBIO DEL MODELO COMERCIAL DE MERCAMAQUINARIAS

Cómo proceder, en este orden:
1. Guarda este mensaje completo, tal cual, en .planning/research/modelo-comercial.md y commitéalo.
2. Actualiza CLAUDE.md: la regla "no se tocan los planes ni sus precios" pasa a decir que el modelo comercial cambia según .planning/research/modelo-comercial.md, autorizado por Victor el 2026-09-25, y que fuera de eso no se toca nada de precios.
3. Haz la auditoría (sección 2) y escríbela en .planning/research/auditoria-modelo-comercial.md. Usa .planning/codebase/ y los SUMMARY de las fases hechas en vez de releer todo el código.
4. Integra el cambio en el ROADMAP con GSD: agrupa las etapas de la sección 38 en fases GSD con sentido (no hace falta crear 13), actualiza REQUIREMENTS y replanifica la fase 6 (CardNet, en pausa) para que cobre según este modelo.
5. Antes de ejecutar nada, dame un resumen corto: fases nuevas y su orden; qué cambia para el particular y para el dealer; precio final de cada plan con la fórmula; qué se reutiliza y qué es nuevo; y las preguntas que solo yo puedo contestar (por ejemplo: redondeo a pesos enteros y qué es exactamente la regla "uno de cada cinco"). Espera mi visto bueno para ejecutar.

Siguen valiendo todas las reglas de CLAUDE.md: un comprobante emitido (NCF) nunca se reescribe, cero dependencias nuevas, migraciones solo al final de MIGRACIONES, sin teléfono en ninguna pantalla, nada automático al contador, PR por fase y publicar solo con CI en verde.

==================================================
PRINCIPIOS
==================================================

La plataforma YA está construida: planes, cupos, publicaciones, dealers, pagos (pendiente → aprobado con confirmarPago), transferencia, bitácora, dashboards, tareas programadas y correos. NO quiero reconstruir la aplicación ni reemplazar lo que funciona.

- Reutiliza componentes, APIs, modelos, lógica y UI existentes siempre que sea posible.
- No hagas cambios destructivos sin verificar sus dependencias.
- No borres la lógica de "cupos": varias funciones dependen de ella. Puede seguir existiendo por dentro.
- Diferencia entre cambiar el concepto comercial visible al usuario y eliminar infraestructura interna.
- El backend es la fuente de verdad para precios, pagos, permisos y límites.
- Mantén compatibilidad con publicaciones, usuarios, dealers y pagos existentes.
- Antes de modificar código, identifica las partes exactas que cambian.

==================================================
1. OBJETIVO
==================================================

Evolucionar de un modelo centrado en "comprar cupos" a uno más intuitivo:

- PARTICULARES: "Pago por publicar este equipo."
- PROFESIONALES/DEALERS: "Pago por una capacidad de inventario durante un período."

Los cupos pueden seguir por dentro, pero NO son el concepto que ve el usuario.
La UX debe sentirse moderna y sencilla, conceptualmente parecida al flujo de marketplaces como SuperCarros, sin copiar branding, textos, diseño, código ni contenido.

==================================================
2. AUDITORÍA OBLIGATORIA ANTES DE CODIFICAR
==================================================

Determina:
1. Dónde se definen los planes.
2. Dónde está la lógica de cupos.
3. Cómo se crea una publicación.
4. Cómo se vincula una publicación con un plan.
5. Cómo se procesan los pagos.
6. Cómo funcionan los webhooks/avisos de pago.
7. Cómo se calculan precios e impuestos.
8. Cómo se marca un equipo como vendido.
9. Cómo funcionan las expiraciones.
10. Cómo funcionan los dealers.
11. Cómo funciona la página pública del dealer.
12. Cómo funciona el dashboard del usuario.
13. Cómo funciona el dashboard/admin.
14. Qué infraestructura de tareas programadas existe.
15. Qué sistema de correos/notificaciones existe.
16. Qué proveedor de pagos hay (transferencia hecha; CardNet planificado y en pausa).
17. Si el proveedor permite cobros recurrentes/tokenizados de forma segura.

Resume: qué se reutiliza, qué se modifica, qué se agrega y qué queda intacto. NO empieces rehaciendo componentes.

==================================================
3. NUEVO FLUJO PARA PARTICULARES
==================================================

Hoy: PLAN → CUPOS → PUBLICACIÓN
Quiero: PLAN → PUBLICACIÓN → PAGO

Publicar equipo → Seleccionar plan → Ver beneficios y precio final → Completar información del equipo → Revisar anuncio → Pagar → Publicar

El usuario NO debe comprar primero un cupo para después decidir qué hacer con él.

==================================================
4. SELECCIÓN DEL PLAN
==================================================

Al pulsar "Publicar equipo", primero elige el tipo de anuncio/plan. Tarjetas con: nombre, precio final, duración, beneficios, nivel de exposición y cualquier característica que YA tenga ese plan. NO inventar beneficios nuevos; conservar los actuales.

Tras elegir el plan:
1. Crear un BORRADOR de publicación.
2. Asociarlo al plan elegido.
3. Completar el formulario.
4. Mostrar resumen.
5. Ir al pago.
6. Validar el precio desde el backend.
7. Procesar el pago.
8. Activar la publicación.

Así no hay anuncios activos sin pago y se pueden recuperar publicaciones abandonadas.

==================================================
5. NO MOSTRAR "CUPOS" A PARTICULARES
==================================================

En el flujo particular, nada de: "Comprar cupos", "Cupos disponibles", "Cupos restantes", "Usar cupo", "Contratar cupo".
El usuario debe entender: "Estoy comprando una publicación para este equipo."
Por dentro se puede mantener la infraestructura de cupos.

==================================================
6. EQUIPOS VENDIDOS
==================================================

Al marcar vendido: NO borrar el anuncio. Pasa a VENDIDO.
Conservar: información, fotos, descripción, precio, ubicación, plan, pago, fecha de publicación, historial, estadísticas y modificaciones.
Deja de aparecer como disponible para compradores y sigue accesible en el dashboard/historial del vendedor.

==================================================
7. REUTILIZACIÓN TRAS UNA VENTA
==================================================

Se conserva: cuando un equipo se vende, la capacidad que usaba vuelve a estar disponible según las condiciones del plan.
No presentarlo como "Te queda un cupo", sino como: "Este equipo fue vendido. Ahora puedes publicar otro equipo con la capacidad disponible de tu plan."

Protección en backend contra: publicaciones ilimitadas, reutilización simultánea, duplicación de publicaciones, superar límites y manipulación desde el frontend.

==================================================
8. ESTADOS DE PUBLICACIÓN
==================================================

Revisa los estados actuales y hazlos coherentes. Como mínimo: BORRADOR, PENDIENTE DE PAGO, ACTIVO, VENDIDO, EXPIRADO. Conserva CANCELADO/PAUSADO si existen y hacen falta. VENDIDO y EXPIRADO NO son el mismo estado.

==================================================
9. PRECIO CENTRALIZADO
==================================================

Una única fuente de verdad para precios (reutiliza assets/precios.js si encaja; el backend manda). NO hardcodear precios finales en distintos componentes.

Separar: precio base, ajuste comercial (tasa e importe), subtotal gravado, ITBIS (tasa e importe) y precio final.
El backend calcula el precio definitivo; el frontend solo lo muestra; el pago recalcula y valida en el backend.

==================================================
10. ITBIS
==================================================

Los precios que ve el comprador son PRECIOS FINALES: "RD$X,XXX — ITBIS incluido".
NO mostrar al comprador un desglose confuso de precio + ITBIS + cargos.
ITBIS vigente: 18 %.

==================================================
11. PRECIOS BASE
==================================================

- Standard: RD$1,800 antes del ajuste y del ITBIS.
- Destacado: RD$3,200 antes del ajuste y del ITBIS.
- Los demás planes: localiza su precio actual y consérvalo como base. NO inventes ni cambies otros precios.

==================================================
12. AJUSTE COMERCIAL DEL 3 % — FÓRMULA OBLIGATORIA
==================================================

Se añade un 3 % a TODOS los precios, por dentro.

FÓRMULA ÚNICA DEL SISTEMA:
  subtotal gravado = precio base × 1.03
  ITBIS            = subtotal gravado × 0.18
  precio final     = subtotal gravado + ITBIS   (= base × 1.03 × 1.18)

El 3 % se aplica ANTES del ITBIS y forma parte del subtotal gravado. Razón fiscal: si se sumara después del ITBIS, el ITBIS del comprobante con NCF no cuadraría con lo cobrado ante la DGII.

Ejemplos: Standard 1,800 → 1,854.00 + ITBIS 333.72 = RD$2,187.72. Destacado 3,200 → 3,296.00 + ITBIS 593.28 = RD$3,889.28. (Pregúntame si se redondea a pesos enteros.)

El 3 % NO aparece nunca como comisión, cargo, tarifa, fee ni "+3 %": ni en pantalla ni como línea aparte del comprobante. En el comprobante va integrado en el subtotal.
Configurable desde una única fuente. Documenta la fórmula en el código. Frontend y backend no pueden calcular precios distintos.

==================================================
13. PAGO
==================================================

El backend es responsable del precio final. En cada transacción guarda, si es compatible con lo actual: usuario, publicación, plan, precio base, tasa e importe del ajuste, subtotal, tasa e importe de ITBIS, precio final, moneda, proveedor, estado y fechas.

Reutiliza pagos.confirmarPago como único punto pendiente → aprobado.
Validar: plan + publicación + precio calculado por el backend = importe cobrado.
Proteger contra: manipulación de precios, doble pago, activación sin pago, avisos de pago duplicados y publicaciones duplicadas.

==================================================
14. COMPATIBILIDAD
==================================================

NO eliminar tablas ni modelos de cupos. Primero determina cómo se relacionan con anuncios, pagos, dealers, planes, reutilización y expiración.
Las publicaciones y pagos existentes deben seguir funcionando.
Si hace falta la relación Plan → Publicación → Pago, créala sin romper datos existentes.

==================================================
15. PROFESIONALES Y DEALERS
==================================================

NO aplicar el modelo particular a dealers. El dealer sigue en un modelo de INVENTARIO:
Empresa → Plan profesional → Capacidad de publicaciones activas → Inventario → Publicaciones

Desde su dashboard puede: crear, editar, marcar vendido, ver vendidos, ver expirados, ver activos, administrar inventario, consultar capacidad disponible, ampliar capacidad y cambiar de nivel cuando corresponda.

==================================================
16. EXPERIENCIA DEL DEALER
==================================================

Usar "Publicaciones activas permitidas", "Publicaciones activas" y "Capacidad disponible" en lugar de "Cupos restantes".
Ejemplo: Plan Profesional — hasta X publicaciones activas, página empresarial, dashboard, inventario, beneficios actuales y ventajas de exposición.
Al venderse un equipo: ACTIVO → VENDIDO; deja de ocupar capacidad y permite publicar otro según el plan.

==================================================
17. PÁGINA PÚBLICA DEL DEALER
==================================================

Conservar lo que existe: nombre, información pública, ubicación, inventario, equipos activos, contacto (sin teléfono publicado por la plataforma) y verificación.
Conservar la validación de RNC. NO exponer el RNC salvo que el sistema actual lo requiera.

==================================================
18. REGLA "UNO DE CADA CINCO"
==================================================

Parece existir una regla donde uno de cada cinco no se cobra. NO modificarla hasta entenderla. Determina si es: quinta publicación gratis, 20 % gratis, una capacidad gratis por cada cinco u otra lógica. Explícamela en el resumen y consérvala para dealers si sigue siendo parte de su modelo.

==================================================
19. AÑADIR CAPACIDAD A MITAD DEL CICLO
==================================================

Conservar la ampliación proporcional al tiempo restante. Presentarla como "Agregar publicaciones activas", no "Comprar cupos".
1. Capacidad actual. 2. Capacidad adicional. 3. Tiempo restante. 4. Precio proporcional (con la fórmula de la sección 12). 5. Mostrar total. 6. Cobrar. 7. Actualizar capacidad.
Sin doble cobro.

==================================================
20. CAMBIO DE PLAN O NIVEL
==================================================

Conservar el cambio de nivel. Antes de tocarlo, entender cómo funciona. Evitar: doble cobro, beneficios duplicados, extensión incorrecta, pérdida de publicaciones o de historial.

==================================================
21. RENOVACIÓN AUTOMÁTICA
==================================================

Opción "Renovación automática", OPT-IN, NUNCA activada por defecto. En el pago:
[ ] Activar renovación automática
Con un texto equivalente a: "Al activar esta opción, autorizas la renovación de este anuncio al finalizar su período con el método de pago autorizado, según las condiciones y el precio vigente de renovación."
Se puede desactivar después desde el dashboard.

==================================================
22. VIABILIDAD DEL COBRO AUTOMÁTICO
==================================================

Revisa: proveedor, avisos de pago, tokenización, métodos guardados, autorización para cargos posteriores, seguridad y restricciones.
La transferencia no permite cobro automático. CardNet (fase 6, en pausa) sí puede con tarjeta tokenizada: la renovación automática se construye ahí, completa y APAGADA hasta la afiliación.
Nunca se guarda en nuestro servidor el número de tarjeta, la fecha ni el CVV.
Mientras CardNet esté apagado: renovación manual + alertas automáticas.

==================================================
23. PROCESO DE RENOVACIÓN AUTOMÁTICA
==================================================

Al llegar la expiración, si está activada:
1. Intentar renovar. 2. Crear transacción. 3. Registrar resultado.
4. Si el pago sale bien: mantener el anuncio activo, extender la expiración, conservar el contenido y registrar la renovación.
5. Si falla: registrar el fallo, avisar al usuario y permitir renovar a mano.
NO crear una publicación nueva: la renovación extiende la existente.

==================================================
24. RENOVACIÓN FALLIDA
==================================================

NO desactivar en silencio. Registrar el intento y el fallo, avisar al usuario, decirle claramente qué hacer, permitir renovar a mano y respetar la fecha de expiración.
Reintentos solo si el proveedor los permite de forma segura. Nunca un doble cargo.

==================================================
25. RENOVACIÓN MANUAL
==================================================

Siempre existe "Renovar anuncio", también antes de que expire.
Mantiene el mismo anuncio, fotos, información e historial; genera una transacción nueva; actualiza la expiración y aplica el precio vigente. NO duplica el anuncio.

==================================================
26. ALERTAS DE EXPIRACIÓN
==================================================

Como complemento de la renovación automática, o en su lugar si no es viable:
- 7 días antes: "Tu anuncio vence en 7 días."
- 3 días antes: "Tu anuncio vence en 3 días."
- 24 horas antes: "Tu anuncio vence mañana."
Cada alerta incluye: equipo, anuncio, fecha exacta de expiración, plan y un enlace "Renovar anuncio".

==================================================
27. CANALES
==================================================

Usa lo que ya existe: 1. correo; 2. notificación interna si existe.
Diseña para poder añadir después WhatsApp o SMS, sin integrar servicios externos nuevos ahora.

==================================================
28. SIN ALERTAS DUPLICADAS
==================================================

Registro de recordatorios enviados por publicación + tipo (7 días, 3 días, 24 horas).
Antes de enviar: comprobar que corresponde y que no se envió ya; enviar; registrar resultado y hora.
Idempotente: si la tarea programada corre dos veces, no salen dos correos.

==================================================
29. CANCELAR RECORDATORIOS QUE YA NO APLICAN
==================================================

No enviar si el anuncio está vendido, cancelado, expirado o renovado, si ya se procesó la renovación automática o si el usuario desactivó esas notificaciones.
Si renueva antes de la expiración, los recordatorios del ciclo anterior quedan anulados.

==================================================
30. DASHBOARD DEL USUARIO
==================================================

Cada anuncio activo muestra: ESTADO (Activo), VENCE (fecha) y RENOVACIÓN AUTOMÁTICA (Activada/Desactivada).
- Activada: "Se renovará automáticamente al vencer."
- Desactivada: "Tu anuncio vence el [fecha]."
Acciones: "Renovar ahora" y "Configurar renovación automática".
A 7, 3 y 1 día, un aviso visual en el dashboard.

==================================================
31. DASHBOARD DEL DEALER
==================================================

RESUMEN: publicaciones activas, vendidas, expiradas, capacidad disponible, plan y fecha de vencimiento/renovación.
INVENTARIO: activos, vendidos, expirados.
ACCIONES: publicar equipo, editar, marcar vendido, publicar otro, agregar capacidad y cambiar de plan si corresponde.

==================================================
32. ADMIN
==================================================

PUBLICACIONES: activas, vendidas, expiradas, pendientes.
PAGOS: usuario, anuncio, plan, precio base, ajuste, ITBIS, total, estado, fecha. (El ajuste solo lo ve el admin.)
RENOVACIONES: automáticas, manuales, exitosas, fallidas.
DEALERS: empresa, RNC validado, plan, capacidad, publicaciones activas, vendidas, expiradas.
Toda escritura del admin sobre otra organización pasa por la bitácora (conAdminEnNombreDe).

==================================================
33. TAREAS PROGRAMADAS
==================================================

Usa lo que ya existe (tools/tareas.js y sus temporizadores systemd). Nada de infraestructura externa.
Idempotente, y que cubra recordatorios, renovaciones, pagos fallidos y expiraciones sin duplicar acciones.

==================================================
34. SUPERCARROS
==================================================

Solo como referencia del concepto:
- PARTICULAR: elegir plan → publicar → pagar.
- DEALER: plan comercial → inventario → varias publicaciones → administración centralizada.
NO copiar branding, textos, diseño exacto, código ni contenido. Adaptarlo a maquinaria y a MercaMaquinarias.

==================================================
35. TEXTOS
==================================================

Busca los textos con "cupos".
PARTICULARES: sustituir "comprar/contratar/usar cupos", "cupos disponibles/restantes" por "publicar equipo", "seleccionar plan", "publicación", "anuncio", "publicar otro equipo".
DEALERS: "capacidad de publicaciones activas" donde corresponda.
NO cambiar textos fuera de lo relacionado con este cambio. Si cambia legal.html (condiciones de pago o renovación), sube la versión del documento según el mecanismo que ya existe.

==================================================
36. MIGRACIÓN
==================================================

Antes de tocar la base, decide cómo migrar o mantener: cupos existentes, planes, anuncios, pagos, dealers, fechas de expiración y estados.
Si hay pocos datos reales se puede simplificar, pero NO lo supongas: compruébalo.
NO borrar la base ni tablas sin comprobar dependencias. Migraciones solo al final de MIGRACIONES, nunca reescribir una anterior.

==================================================
37. SEGURIDAD
==================================================

Todo se valida en el backend. Proteger contra: manipulación de precios, creación sin pago, pagos duplicados, publicaciones duplicadas, superar la capacidad, reutilización simultánea, acceso a publicaciones ajenas, cambio de plan desde el frontend, renovación duplicada, aviso de pago duplicado y creación ilimitada llamando directamente a la API.

==================================================
38. ORDEN SUGERIDO (agrúpalo en fases GSD)
==================================================

1 Auditoría · 2 Precios (base + 3 % + ITBIS) · 3 Relación plan → publicación → pago · 4 UX particular · 5 Estados · 6 Reutilización tras venta · 7 Renovaciones · 8 Alertas · 9 Dealers · 10 Dashboards · 11 Textos · 12 Migración · 13 Pruebas

==================================================
39. PRUEBAS OBLIGATORIAS
==================================================

PARTICULAR (Standard y Destacado): precio, ITBIS incluido, 3 % aplicado, crear borrador, abandonar el pago, recuperar el borrador, pagar, activar, editar, marcar vendido, historial, publicar otro según condiciones, renovar a mano, activar/desactivar renovación automática.

DEALER: validar empresa, elegir plan, crear inventario, publicar varios equipos, marcar vendido, comprobar capacidad, publicar otro, agregar capacidad, verificar prorrateo, cambiar nivel, página pública y dashboard.

RENOVACIÓN: automática exitosa y fallida, pago fallido, manual, recordatorios de 7 días, 3 días y 24 horas, sin duplicados, renovar antes de expirar, anuncio vendido antes del recordatorio y anuncio expirado.

SEGURIDAD: manipular el precio desde el frontend, activar sin pago, duplicar un pago, superar la capacidad, reutilizar una publicación a la vez, modificar una publicación ajena, duplicar un aviso de pago, renovar dos veces.

FISCAL: el comprobante de cada caso cuadra (subtotal con el 3 % + ITBIS = total cobrado) y un pago rechazado no consume NCF.

==================================================
40. ANTES DE DAR POR TERMINADO
==================================================

Este proyecto no tiene build, lint ni TypeScript. Su equivalente:
- npm run auditar (taxonomía, público, flujos, permisos, contraste) y npm run check;
- todas las pruebas de arnés: seguridad, dealer, facturas, pagos, bitácora, transferencia, chat, letras, y las nuevas que añadas;
- sin errores de consola ni de API; revisar pago, avisos de pago, tareas programadas y móvil;
- nada existente roto.

==================================================
41. PRINCIPIO FINAL
==================================================

No quiero una aplicación nueva: quiero una evolución de la MercaMaquinarias actual.

PARTICULAR: Publicar equipo → Elegir plan → Crear anuncio → Pagar → Publicar → Activo → Vendido → Publicar otro según condiciones → Renovar cuando corresponda.

DEALER: Empresa → Plan profesional → Capacidad de publicaciones activas → Inventario → Publicaciones → Vendido/Expirado → Capacidad disponible para nuevo inventario.

RENOVACIÓN: Anuncio activo → Renovación automática ACTIVADA → cobro automático cuando CardNet esté encendido → sigue activo. O: DESACTIVADA → alertas a 7 días, 3 días y 24 horas → renovar o dejar expirar.

Primero entiende el sistema actual. Después modifica solo lo necesario. Por último, prueba todo.
