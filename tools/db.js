/**
 * db.js — acceso a datos sobre node:sqlite. Sin dependencias.
 *
 * Aquí vive TODO el SQL del proyecto. La API (tools/api.js) llama a
 * estas funciones y nunca escribe una consulta: si mañana se cambia
 * SQLite por PostgreSQL, se reescribe este archivo y nada más.
 *
 * El archivo de base de datos se crea solo en db/mercamaquinarias.db
 * la primera vez que arranca el servidor.
 */

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('fs');
const taxonomia = require('../assets/taxonomia.js');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const CARPETA = path.join(RAIZ, 'db');
const ARCHIVO = process.env.MERCA_DB || path.join(CARPETA, 'mercamaquinarias.db');

let db;

function abrir() {
  if (db) return db;
  fs.mkdirSync(CARPETA, { recursive: true });
  db = new DatabaseSync(ARCHIVO);
  /* El sitio y las tareas de mantenimiento escriben la misma base.
     Sin esto, una escritura que coincida con el respaldo de las 5:00
     devuelve SQLITE_BUSY al instante y el visitante ve un 500. Con
     cinco segundos de espera, la inmensa mayoría se resuelve sola. */
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(fs.readFileSync(path.join(CARPETA, 'schema.sql'), 'utf8'));
  migrar();
  return db;
}

/* Migraciones para bases que ya existen. schema.sql crea lo que falta
   con IF NOT EXISTS, pero no añade columnas a tablas ya creadas: eso
   se hace aquí. Cada entrada se aplica una vez y queda anotada.

   Añadir siempre al final y no reescribir las anteriores: una base en
   producción ya las aplicó. */

/* Fin de la promoción de lanzamiento del nivel Estándar. Cuando la
   fecha pase, los planes vuelven solos a su tarifa sin tocar código:
   el importe se calcula contra ella en cada cobro. */
const PROMO_LANZAMIENTO = process.env.MERCA_PROMO_HASTA || '2026-11-30';

const MIGRACIONES = [
  ['2026-08-sucursales-contacto', [
    'ALTER TABLE sucursales ADD COLUMN horario TEXT',
    'ALTER TABLE sucursales ADD COLUMN whatsapp TEXT',
  ]],
  // La promoción de lanzamiento pasa a la base. Antes vivía en
  // assets/data.js, de modo que el navegador anunciaba el plan
  // Estándar sin costo y el servidor cobraba los RD$2,000 igual.
  ['2026-08-promociones', [
    'ALTER TABLE planes ADD COLUMN precio_promocional INTEGER',
    'ALTER TABLE planes ADD COLUMN promo_hasta TEXT',
    `UPDATE planes SET precio_promocional = 0, promo_hasta = '${PROMO_LANZAMIENTO}'
       WHERE nivel = 'estandar'`,
  ]],
  // El alta de dealer pasa por revisión de un administrador. Las
  // empresas que ya estaban publicadas antes de esta regla se dan por
  // aprobadas: llevaban su perfil visible y quitárselo de golpe sería
  // sacarlas del directorio sin aviso.
  ['2026-08-revision-dealers', [
    "ALTER TABLE usuarios ADD COLUMN es_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE organizaciones ADD COLUMN estado_revision TEXT NOT NULL DEFAULT 'no_aplica'",
    "UPDATE organizaciones SET estado_revision = 'aprobada' WHERE tipo = 'dealer'",
    'CREATE INDEX IF NOT EXISTS ix_org_revision ON organizaciones (estado_revision)',
  ]],
  // Marcas de los avisos ya enviados. Guardar la fecha en vez de un
  // 0/1 permite saber cuándo se avisó, que es lo que se mira cuando
  // alguien dice que no le llegó nada.
  ['2026-08-avisos-vencimiento', [
    'ALTER TABLE anuncios ADD COLUMN aviso_por_vencer TEXT',
    'ALTER TABLE anuncios ADD COLUMN aviso_vencido TEXT',
  ]],

  /* Índices de ordenación del catálogo.

     Medido sobre 20.000 anuncios activos: el orden por fecha pasaba de
     13,2 ms a 0,01 ms y el orden por precio de 10,8 ms a 0,01 ms. Sin
     ellos, cada carga del catálogo ordenaba en memoria el conjunto
     entero de resultados antes de quedarse con 24.

     El orden por defecto ('destacados') sigue necesitando una
     ordenación temporal —su primera clave es una expresión que depende
     de la hora, y eso no se puede indexar— pero baja de 11,4 a 8,9 ms
     porque la segunda clave ya viene ordenada. Se acepta: evitarlo
     exigiría ordenar por destacado_hasta a secas, que colocaría los
     destacados YA VENCIDOS por encima de los anuncios normales.

     No se indexan los órdenes por uso: su primera clave también es una
     expresión, `(uso_unidad <> 'h')`, que separa horómetros de
     kilómetros. */
  ['2026-08-indices-catalogo', [
    'CREATE INDEX IF NOT EXISTS ix_anuncios_recientes ON anuncios (estado, publicado DESC)',
    'CREATE INDEX IF NOT EXISTS ix_anuncios_precio ON anuncios (estado, precio, publicado DESC)',
    'CREATE INDEX IF NOT EXISTS ix_anuncios_anio ON anuncios (estado, anio, publicado DESC)',
  ]],

  /* Índices sobre columnas de clave foránea.

     SQLite no los crea solo. Sin ellos, borrar una fila padre recorre
     la tabla hija entera para resolver el ON DELETE, y con el catálogo
     crecido eso convierte «dar de baja una cuenta» o «eliminar una
     sucursal» en un recorrido completo de anuncios.

     Se indexan las que cuelgan de algo que de verdad se borra. Quedan
     fuera a propósito `suscripciones.plan_id` y `pagos.metodo_pago_id`:
     planes y métodos de pago son datos de referencia que no se
     eliminan, y un índice que nunca se usa solo encarece cada
     escritura. */
  /* Taxonomía jerárquica: categoría → subcategoría → marca → modelo.
     `subcategoria` pasa de guardar el nombre visible a guardar el id,
     que es lo que permite renombrar «Camión volteo» sin tocar los
     anuncios ya publicados. La categoría `volteos` se reparte: los
     camiones de carretera pasan a `camiones` y las subcategorías se
     remapean una a una.

     Tren motriz solo para vehículos de carretera. */
  ['2026-08-taxonomia-jerarquica', [
    'ALTER TABLE anuncios ADD COLUMN motor_marca TEXT',
    'ALTER TABLE anuncios ADD COLUMN motor_modelo TEXT',
    'ALTER TABLE anuncios ADD COLUMN transmision_marca TEXT',
    'ALTER TABLE anuncios ADD COLUMN transmision_modelo TEXT',

    "UPDATE anuncios SET categoria = 'camiones' WHERE categoria = 'volteos'",

    // Nombres antiguos → ids nuevos.
    "UPDATE anuncios SET subcategoria = 'exc-mini' WHERE subcategoria LIKE 'Miniexcavadora%'",
    "UPDATE anuncios SET subcategoria = 'exc-mediana' WHERE subcategoria LIKE 'Excavadora mediana%'",
    "UPDATE anuncios SET subcategoria = 'exc-pesada' WHERE subcategoria LIKE 'Excavadora pesada%'",
    "UPDATE anuncios SET subcategoria = 'exc-ruedas' WHERE subcategoria LIKE 'Excavadora de ruedas%'",
    "UPDATE anuncios SET subcategoria = 'exc-demolicion' WHERE subcategoria LIKE 'Excavadora de demolici%'",
    "UPDATE anuncios SET subcategoria = 'exc-anfibia' WHERE subcategoria LIKE 'Excavadora anfibia%'",
    "UPDATE anuncios SET subcategoria = 'retro-4x2' WHERE subcategoria LIKE 'Retroexcavadora 4x2%'",
    "UPDATE anuncios SET subcategoria = 'retro-4x4' WHERE subcategoria LIKE 'Retroexcavadora 4x4%'",
    "UPDATE anuncios SET subcategoria = 'retro-extensible' WHERE subcategoria LIKE 'Retroexcavadora con brazo%'",
    "UPDATE anuncios SET subcategoria = 'retro-4x4' WHERE subcategoria LIKE 'Retroexcavadora con martillo%'",
    "UPDATE anuncios SET subcategoria = 'car-ruedas' WHERE subcategoria LIKE 'Cargador frontal%'",
    "UPDATE anuncios SET subcategoria = 'car-mini' WHERE subcategoria LIKE 'Minicargador%'",
    "UPDATE anuncios SET subcategoria = 'car-oruga' WHERE subcategoria LIKE 'Cargador de oruga%'",
    "UPDATE anuncios SET subcategoria = 'car-telescopico' WHERE subcategoria LIKE 'Manipulador telesc%'",
    "UPDATE anuncios SET subcategoria = 'cam-volteo' WHERE subcategoria LIKE 'Camión volteo%'",
    "UPDATE anuncios SET subcategoria = 'cam-articulado' WHERE subcategoria LIKE 'Volteo articulado%'",
    "UPDATE anuncios SET subcategoria = 'cam-rigido' WHERE subcategoria LIKE 'Volteo rígido%'",
    "UPDATE anuncios SET subcategoria = 'cam-cabezote' WHERE subcategoria LIKE 'Cabezote%'",
    "UPDATE anuncios SET subcategoria = 'grua-camion' WHERE subcategoria LIKE 'Grúa telesc%'",
    "UPDATE anuncios SET subcategoria = 'grua-todoterreno' WHERE subcategoria LIKE 'Grúa todo terreno%'",
    "UPDATE anuncios SET subcategoria = 'grua-oruga' WHERE subcategoria LIKE 'Grúa sobre oruga%'",
    "UPDATE anuncios SET subcategoria = 'grua-articulada' WHERE subcategoria LIKE 'Grúa articulada%'",
    "UPDATE anuncios SET subcategoria = 'grua-torre' WHERE subcategoria LIKE 'Torre grúa%'",
    "UPDATE anuncios SET subcategoria = 'elev-canasto', categoria = 'elevacion' WHERE subcategoria LIKE 'Canasto elevador%'",
    "UPDATE anuncios SET subcategoria = 'comp-liso' WHERE subcategoria LIKE 'Rodillo vibratorio%'",
    "UPDATE anuncios SET subcategoria = 'comp-pata' WHERE subcategoria LIKE 'Rodillo pata%'",
    "UPDATE anuncios SET subcategoria = 'comp-neumatico' WHERE subcategoria LIKE 'Rodillo neum%'",
    "UPDATE anuncios SET subcategoria = 'comp-asfalto' WHERE subcategoria LIKE 'Compactadora de asfalto%'",
    "UPDATE anuncios SET subcategoria = 'comp-manual' WHERE subcategoria LIKE 'Compactadora manual%'",
    "UPDATE anuncios SET subcategoria = 'mont-combustion' WHERE subcategoria LIKE 'Montacargas de combusti%'",
    "UPDATE anuncios SET subcategoria = 'mont-electrico' WHERE subcategoria LIKE 'Montacargas el%'",
    "UPDATE anuncios SET subcategoria = 'mont-todoterreno' WHERE subcategoria LIKE 'Montacargas todo terreno%'",
    "UPDATE anuncios SET subcategoria = 'gen-diesel' WHERE subcategoria LIKE 'Planta el%di%'",
    "UPDATE anuncios SET subcategoria = 'gen-portatil' WHERE subcategoria LIKE 'Generador port%'",
    "UPDATE anuncios SET subcategoria = 'gen-compresor' WHERE subcategoria LIKE 'Compresor%'",
  ]],

  /* Cuentas internas que publican sin pagar: las de los socios.
     Va en la organización y no en el usuario porque quien contrata y
     factura es la empresa, no la persona que pulsa el botón.
     Se concede desde tools/admin.js, nunca desde una pantalla. */
  ['2026-08-exencion-pago', [
    'ALTER TABLE organizaciones ADD COLUMN exenta_pago INTEGER NOT NULL DEFAULT 0',
  ]],

  // Las fotos pasan a disco y la base guarda la ruta. La miniatura es
  // nueva; las filas antiguas se quedan con NULL y el código cae en
  // `url` cuando falta, así que nada se rompe mientras se migran.
  ['2026-08-fotos-miniatura', [
    'ALTER TABLE anuncio_fotos ADD COLUMN miniatura TEXT',
  ]],

  ['2026-08-indices-foraneas', [
    'CREATE INDEX IF NOT EXISTS ix_anuncios_usuario ON anuncios (usuario_id)',
    'CREATE INDEX IF NOT EXISTS ix_anuncios_sucursal ON anuncios (sucursal_id)',
    'CREATE INDEX IF NOT EXISTS ix_anuncios_suscripcion ON anuncios (suscripcion_id)',
    'CREATE INDEX IF NOT EXISTS ix_codigos_usuario ON codigos (usuario_id)',
    'CREATE INDEX IF NOT EXISTS ix_pagos_suscripcion ON pagos (suscripcion_id)',
    'CREATE INDEX IF NOT EXISTS ix_solicitudes_usuario ON solicitudes_dealer (usuario_id)',
    'CREATE INDEX IF NOT EXISTS ix_solicitudes_revisor ON solicitudes_dealer (revisada_por)',
  ]],

  /* ── Se vende capacidad, no anuncios sueltos ──────────────
     Antes el plan se pegaba al anuncio en el momento de publicarlo y
     ahí se quedaba para siempre. Quien compraba "Múltiple Destacados"
     y ya tenía un equipo en Estándar no podía moverlo: el cupo que
     había pagado estaba al lado, libre, y era inalcanzable.

     Ahora se compran CUPOS de un nivel. El cupo es de la organización
     y el anunciante decide a qué equipo se lo pone.

     El catálogo se reduce de seis planes a tres niveles. Los
     "múltiples" eran el mismo nivel con otra cantidad, y la cantidad
     pasa a ser un número que se elige al contratar.

     NADA DE LO YA PAGADO SE PIERDE. Las suscripciones vivas se pasan
     al nivel equivalente conservando su cupo y su fecha de fin:
     quien compró cinco Destacados sigue con cinco Destacados. Los
     planes viejos no se borran —las suscripciones apuntan a ellos y
     guardan las condiciones que se pactaron—, solo se retiran del
     catálogo con activo = 0. */
  ['2026-08-membresias-por-cupos', [
    'ALTER TABLE suscripciones ADD COLUMN dias_ciclo INTEGER',

    // El nivel ya no trae cantidad: la cantidad es de la suscripción.
    'UPDATE planes SET anuncios_incluidos = NULL WHERE id IN (\'estandar\', \'destacado\')',

    `INSERT OR IGNORE INTO planes
       (id, nombre, nivel, modalidad, precio, anuncios_incluidos, fotos_maximas,
        destacado, perfil_publico, solo_dealer, orden)
     VALUES ('premium', 'Premium', 'premium', 'vigencia', 5500, NULL, 30, 1, 1, 0, 3)`,

    "UPDATE planes SET orden = 2 WHERE id = 'destacado'",

    // Fuera del catálogo, no de la base.
    `UPDATE planes SET activo = 0
       WHERE id IN ('multi-estandar', 'multi-destacado', 'dealer', 'dealer-premium')`,

    /* Las suscripciones vivas se llevan al nivel equivalente. El cupo
       que ya tenían se respeta tal cual; el precio pactado tampoco se
       toca, porque es lo que se cobró. */
    `UPDATE suscripciones SET plan_id = 'estandar'
       WHERE plan_id = 'multi-estandar' AND estado = 'activa'`,
    `UPDATE suscripciones SET plan_id = 'destacado'
       WHERE plan_id = 'multi-destacado' AND estado = 'activa'`,
    `UPDATE suscripciones SET plan_id = 'premium'
       WHERE plan_id IN ('dealer', 'dealer-premium') AND estado = 'activa'`,

    /* Las que se vendieron sin límite se quedan SIN LÍMITE. Es lo que
       se pagó. Ponerles como tope los anuncios que ya sostienen las
       dejaría llenas el mismo día de la migración, sin sitio para
       publicar nada más: sería quitarles algo que compraron. Cuando
       ese ciclo termine, renovarán ya con cupos.

       `anuncios_incluidos IS NULL` significa sin límite en todo el
       código nuevo, así que no hay nada que convertir. */

    /* Duración del ciclo, deducida de las fechas para las que ya
       existen. Las de membresía no tenían fin; se les da 30 días para
       que el prorrateo tenga contra qué calcular. */
    `UPDATE suscripciones SET dias_ciclo = CASE
        WHEN fin IS NULL THEN 30
        WHEN CAST(julianday(fin) - julianday(inicio) AS INTEGER) > 45 THEN 60
        ELSE 30 END
       WHERE dias_ciclo IS NULL`,

    'CREATE INDEX IF NOT EXISTS ix_susc_org_activa ON suscripciones (organizacion_id, estado, plan_id)',
  ]],

  /* Un cuarto espacio publicitario: el bloque de la portada donde
     estaba la calculadora de financiamiento. La herramienta sigue en
     financiamiento.html, con su enlace en el menú; lo que se retira es
     el sitio que ocupaba en la portada, que rinde más vendido.

     `espacio` tiene un CHECK y SQLite no deja añadirle un valor con
     ALTER TABLE, así que la tabla se rehace. Es la vía normal aquí:
     no la referencia nadie y las campañas se copian tal cual. */
  ['2026-08-espacio-bloque', [
    `CREATE TABLE publicidad_nueva (
       id          TEXT PRIMARY KEY,
       espacio     TEXT NOT NULL CHECK (espacio IN ('superior', 'lateral-izq', 'lateral-der', 'bloque')),
       nombre      TEXT NOT NULL,
       anunciante  TEXT,
       imagen      TEXT NOT NULL,
       enlace      TEXT,
       alt         TEXT NOT NULL,
       desde       TEXT,
       hasta       TEXT,
       activo      INTEGER NOT NULL DEFAULT 1,
       orden       INTEGER NOT NULL DEFAULT 0,
       impresiones INTEGER NOT NULL DEFAULT 0,
       clics       INTEGER NOT NULL DEFAULT 0,
       creado      TEXT NOT NULL,
       actualizado TEXT
     )`,
    `INSERT INTO publicidad_nueva
       (id, espacio, nombre, anunciante, imagen, enlace, alt, desde, hasta,
        activo, orden, impresiones, clics, creado, actualizado)
     SELECT id, espacio, nombre, anunciante, imagen, enlace, alt, desde, hasta,
        activo, orden, impresiones, clics, creado, actualizado FROM publicidad`,
    'DROP TABLE publicidad',
    'ALTER TABLE publicidad_nueva RENAME TO publicidad',
    // DROP TABLE se llevó el índice por delante: se rehace igual que en
    // schema.sql, para que una base migrada y una recién creada tengan
    // exactamente los mismos índices.
    'CREATE INDEX IF NOT EXISTS ix_publicidad_espacio ON publicidad (espacio, activo, orden)',
  ]],

  /* Ajustes del sitio: pares clave/valor que el equipo cambia desde
     /admin.html. Nace para la fotografía del héroe de la portada. */
  ['2026-08-ajustes', [
    `CREATE TABLE IF NOT EXISTS ajustes (
       clave       TEXT PRIMARY KEY,
       valor       TEXT,
       actualizado TEXT NOT NULL
     )`,
  ]],

  /* Alquiler por TIPO de equipo, y solicitudes que llegan de verdad.

     Dos cosas que iban juntas:

     · Los formularios de alquiler, transporte e importación no
       mandaban nada. Pintaban un resumen y le pedían al cliente que lo
       copiara a WhatsApp. Quien no lo copiaba se perdía, y encima sin
       dejar rastro de cuántos se perdían.

     · La flota se anunciaba como máquinas concretas —«Clase CAT 320»—
       cuando lo que se alquila es una excavadora de veinte toneladas y
       se entrega la que esté libre. Ahora cada ficha es un tipo con su
       capacidad y varias fotos de marcas distintas. */
  ['2026-08-alquiler-por-tipo', [
    'ALTER TABLE flota ADD COLUMN capacidad_texto TEXT',

    `CREATE TABLE IF NOT EXISTS flota_fotos (
       id       TEXT PRIMARY KEY,
       flota_id TEXT NOT NULL REFERENCES flota(id) ON DELETE CASCADE,
       url      TEXT NOT NULL,
       alt      TEXT,
       orden    INTEGER NOT NULL DEFAULT 0
     )`,
    'CREATE INDEX IF NOT EXISTS ix_flota_fotos ON flota_fotos (flota_id, orden)',

    `CREATE TABLE IF NOT EXISTS solicitudes_servicio (
       id         TEXT PRIMARY KEY,
       servicio   TEXT NOT NULL CHECK (servicio IN ('alquiler', 'transporte', 'importacion', 'contacto')),
       referencia TEXT NOT NULL UNIQUE,
       nombre     TEXT NOT NULL,
       telefono   TEXT NOT NULL,
       correo     TEXT,
       empresa    TEXT,
       detalle    TEXT NOT NULL,
       estado     TEXT NOT NULL DEFAULT 'nueva'
                  CHECK (estado IN ('nueva', 'atendida', 'cerrada')),
       nota       TEXT,
       creada     TEXT NOT NULL,
       atendida   TEXT
     )`,
    'CREATE INDEX IF NOT EXISTS ix_solicitudes_servicio ON solicitudes_servicio (servicio, estado, creada)',

    /* La foto que ya tuviera cada tipo pasa a ser la primera de su
       galería, para no perderla al cambiar de modelo. */
    `INSERT INTO flota_fotos (id, flota_id, url, alt, orden)
     SELECT lower(hex(randomblob(16))), id, foto, nombre, 0
       FROM flota WHERE foto IS NOT NULL AND foto <> ''`,
  ]],

  /* Alquiler por FUNCIÓN, con operador y por hora.

     El paso anterior quitó la marca —«Clase CAT 320» pasó a
     «Excavadora · 18 a 22 toneladas»— pero dejó el tamaño, y el tamaño
     sigue siendo una promesa. Quien alquila necesita excavar; si hay
     una de 20 t, una de 30 y una de 55, la que va la decidimos
     nosotros al ver la accesibilidad de la obra y el trabajo. Ofrecer
     el tonelaje era darle a elegir una máquina concreta por la puerta
     de atrás.

     Se reescriben los seis tipos sembrados, incluidos los detalles:
     decían «con operador o sin él» y ya no existe la modalidad sin
     operador. Si alguno se había editado desde /admin.html, este paso
     lo devuelve al texto vigente; es lo correcto, porque el texto
     viejo contradice la política que hoy se anuncia en la página. */
  ['2026-08-alquiler-por-funcion', [
    `UPDATE flota SET nombre = CASE nombre
        WHEN 'Excavadora 20 t'         THEN 'Excavadora'
        WHEN 'Retroexcavadora 4x4'     THEN 'Retroexcavadora'
        WHEN 'Cargador frontal 3 m³'   THEN 'Cargador frontal'
        WHEN 'Camión volteo 16 m³'     THEN 'Camión volteo'
        WHEN 'Planta eléctrica 100 kW' THEN 'Planta eléctrica'
        ELSE nombre END
      WHERE servicio = 'alquiler'`,

    `UPDATE flota SET detalle = CASE nombre
        WHEN 'Excavadora'         THEN 'Excavación, zanjas y carga de material.'
        WHEN 'Retroexcavadora'    THEN 'Zanjas, relleno y carga en espacios reducidos. Admite martillo.'
        WHEN 'Cargador frontal'   THEN 'Acopio, carga de camiones y movimiento de agregados.'
        WHEN 'Camión volteo'      THEN 'Traslado de tierra, arena y escombro.'
        WHEN 'Rodillo compactador' THEN 'Compactación de terraplenes y bases. Vibratorio liso.'
        WHEN 'Planta eléctrica'   THEN 'Energía en obra sin red. Insonorizada, con tablero de transferencia.'
        ELSE detalle END
      WHERE servicio = 'alquiler'`,

    /* La capacidad deja de anunciarse y la tarifa pasa a ser horaria.
       El transporte no se toca: allí la capacidad de la cama sí es el
       dato que decide qué se puede montar. */
    `UPDATE flota SET capacidad_texto = NULL, unidad = 'hora'
      WHERE servicio = 'alquiler'`,
  ]],

  /* La promoción de lanzamiento cierra el 30 de noviembre de 2026.

     Va como migración y no cambiando PROMO_LANZAMIENTO porque
     '2026-08-promociones' ya se aplicó en producción: esa entrada no
     vuelve a correr, y la constante solo sirve para bases nuevas. Sin
     esto, el sitio seguiría anunciando el 31 de diciembre.

     La fecha va escrita y no leída del entorno a propósito: una
     migración tiene que dar el mismo resultado en la base de Victor,
     en la del servidor y en la de quien clone el repo mañana. */
  ['2026-09-promo-hasta-noviembre', [
    `UPDATE planes SET promo_hasta = '2026-11-30'
       WHERE nivel = 'estandar' AND precio_promocional IS NOT NULL`,
  ]],

  /* El cambio de nombre llega hasta la base.

     La cuenta de la casa se creó el 4 de agosto con el nombre viejo:
     usuario `principal@tuequipord.com`, organización «TuEquipoRD» con
     el atajo `tuequipord`. El correo es además con lo que Victor entra
     como administrador, y ese buzón deja de existir al mudar el
     dominio, así que hay que cambiarlo aquí o se queda fuera.

     La contraseña no se toca: vive en clave_hash y clave_sal, que esta
     migración ni menciona. Se entra igual, solo cambia la dirección.

     Va por igualdad exacta y no por LIKE: si algún día alguien registra
     una empresa que se llame parecido, esto no debe rozarla. */
  ['2026-09-cambio-de-marca', [
    `UPDATE usuarios
        SET correo = 'principal@mercamaquinarias.com',
            nombre = 'Administración MercaMaquinarias'
      WHERE correo = 'principal@tuequipord.com'`,
    `UPDATE organizaciones
        SET nombre = 'MercaMaquinarias',
            slug   = 'mercamaquinarias',
            correo = 'principal@mercamaquinarias.com'
      WHERE slug = 'tuequipord'`,
    `UPDATE solicitudes_dealer
        SET encargado = 'Administración MercaMaquinarias'
      WHERE encargado = 'Administración TuEquipoRD'`,
  ]],

  /* Video en los anuncios.

     Va DESPUÉS de '2026-09-cambio-de-marca' aunque se escribiera antes:
     esa ya se aplicó en producción, y las migraciones se añaden al
     final. Reordenarlas no rompería nada —cada una se anota por su
     nombre y ninguna depende de la otra—, pero el día que dos sí
     dependan, el orden del archivo es lo único que lo dice.

     Estándar 1, Destacado 2, Premium 3. El reparto no es arbitrario: a
     unos 6 MB por video, con los 3,5 GB libres que tiene el disco del
     VPS caben del orden de 500. Si se queda corto, el sitio empieza a
     rechazar subidas —ver MINIMO_LIBRE en tools/videos.js— en vez de
     llenar el disco y dejar a SQLite sin poder escribir, que es la
     forma fea de quedarse sin espacio: se pierden publicaciones.

     Los planes que ya no se venden se quedan a 0, el valor por defecto
     de la columna. */
  ['2026-09-videos-por-plan', [
    'ALTER TABLE planes ADD COLUMN videos_maximos INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS anuncio_videos (
       id         TEXT PRIMARY KEY,
       anuncio_id TEXT NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
       url        TEXT NOT NULL,
       poster     TEXT,
       duracion   REAL,
       orden      INTEGER NOT NULL DEFAULT 0,
       creada     TEXT NOT NULL
     )`,
    'CREATE INDEX IF NOT EXISTS ix_videos_anuncio ON anuncio_videos (anuncio_id, orden)',
    "UPDATE planes SET videos_maximos = 1 WHERE id = 'estandar'",
    "UPDATE planes SET videos_maximos = 2 WHERE id = 'destacado'",
    "UPDATE planes SET videos_maximos = 3 WHERE id = 'premium'",
  ]],

  /* Quién aceptó qué condiciones y cuándo.

     UNA FILA POR DOCUMENTO Y VERSIÓN, y no un campo «acepto» en la
     cuenta. Un booleano no sirve para nada el día que haya que
     demostrar qué texto aceptó alguien: las condiciones cambian, y lo
     que importa es exactamente qué versión estaba vigente cuando esa
     persona pulsó.

     Se guardan la IP y el navegador porque una aceptación sin rastro
     de dónde vino es difícil de sostener frente a un «yo nunca acepté
     eso». No se usan para nada más.

     La clave es (usuario, documento, versión): aceptar dos veces la
     misma versión no crea dos filas, y aceptar una versión nueva no
     borra la anterior. El historial completo se conserva, que es todo
     el sentido de la tabla. */
  ['2026-09-aceptaciones-legales', [
    `CREATE TABLE IF NOT EXISTS aceptaciones_legales (
       id          TEXT PRIMARY KEY,
       usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
       documento   TEXT NOT NULL,
       version     TEXT NOT NULL,
       aceptado_en TEXT NOT NULL,
       ip          TEXT,
       user_agent  TEXT,
       UNIQUE (usuario_id, documento, version)
     )`,
    'CREATE INDEX IF NOT EXISTS ix_aceptaciones_usuario ON aceptaciones_legales (usuario_id)',
    'CREATE INDEX IF NOT EXISTS ix_aceptaciones_doc ON aceptaciones_legales (documento, version)',
  ]],

  /* Comprobantes.
   *
   * UN COMPROBANTE EMITIDO NO SE BORRA NI SE REESCRIBE. Si hay que
   * anular, se emite una nota de crédito que lo referencia. Es la regla
   * que hace que la contabilidad se sostenga, y por eso la tabla no
   * tiene columna de «anulado» que alguien pueda poner a 1: tiene
   * `anulado_por`, que apunta a otro comprobante de verdad.
   *
   * EL NÚMERO INTERNO Y EL NCF SON COSAS DISTINTAS.
   *
   *   · `numero` (MM-2026-000123) es nuestro, correlativo y sin huecos.
   *     Lo lleva TODO comprobante, incluido el recibo no fiscal.
   *   · `ncf` (B0100000016) lo autoriza la DGII y solo lo llevan las
   *     facturas fiscales. Es único en toda la tabla: dos comprobantes
   *     con el mismo NCF es un problema con la DGII, no un duplicado
   *     cualquiera, así que lo impide el esquema y no el código.
   *
   * Los importes van en enteros, como en `pagos`: céntimos de peso en
   * coma flotante es como aparecen los descuadres de un centavo. */
  ['2026-09-comprobantes', [
    `CREATE TABLE IF NOT EXISTS facturas (
       id            TEXT PRIMARY KEY,
       pago_id       TEXT REFERENCES pagos(id) ON DELETE SET NULL,
       organizacion_id TEXT REFERENCES organizaciones(id) ON DELETE SET NULL,
       numero        TEXT NOT NULL UNIQUE,
       tipo          TEXT NOT NULL CHECK (tipo IN
                       ('recibo', 'factura_consumo', 'factura_credito_fiscal', 'nota_credito')),
       ncf           TEXT UNIQUE,
       razon_social  TEXT,
       rnc           TEXT,
       direccion     TEXT,
       concepto      TEXT,
       subtotal      INTEGER NOT NULL,
       itbis         INTEGER NOT NULL,
       total         INTEGER NOT NULL,
       moneda        TEXT NOT NULL DEFAULT 'DOP',
       fecha         TEXT NOT NULL,
       ruta_pdf      TEXT,
       enviada_cliente TEXT,
       enviada_interna TEXT,
       intentos_envio  INTEGER NOT NULL DEFAULT 0,
       anula_a       TEXT REFERENCES facturas(id) ON DELETE SET NULL,
       anulado_por   TEXT REFERENCES facturas(id) ON DELETE SET NULL,
       creada        TEXT NOT NULL
     )`,
    'CREATE INDEX IF NOT EXISTS ix_facturas_fecha ON facturas (fecha DESC)',
    'CREATE INDEX IF NOT EXISTS ix_facturas_org ON facturas (organizacion_id, fecha DESC)',
    'CREATE INDEX IF NOT EXISTS ix_facturas_pago ON facturas (pago_id)',
    /* Para la tarea que reintenta lo que no salió. */
    'CREATE INDEX IF NOT EXISTS ix_facturas_pendientes ON facturas (enviada_cliente, enviada_interna)',

    /* Secuencias autorizadas por la DGII.
     *
     * `siguiente` es el próximo número a usar, no el último usado: así
     * una secuencia recién cargada se describe con desde=siguiente y no
     * hay que inventarse un «cero» que no existe.
     *
     * `activa` permite tener cargadas las secuencias que el contador usa
     * por su cuenta —B11, B13, B14, B15— sin que el sitio las ofrezca al
     * cobrar. Cargarlas sirve para que el aviso de agotamiento las
     * vigile igual. */
    `CREATE TABLE IF NOT EXISTS secuencias_ncf (
       id         TEXT PRIMARY KEY,
       tipo       TEXT NOT NULL,
       nombre     TEXT NOT NULL,
       prefijo    TEXT NOT NULL,
       desde      INTEGER NOT NULL,
       hasta      INTEGER NOT NULL,
       siguiente  INTEGER NOT NULL,
       vence      TEXT,
       activa     INTEGER NOT NULL DEFAULT 0,
       usa_sitio  INTEGER NOT NULL DEFAULT 0,
       creada     TEXT NOT NULL,
       UNIQUE (tipo, desde)
     )`,

    /* Las secuencias que la DGII aprobó el 28/08/2026.
     *
     * `usa_sitio` marca las tres que toca el flujo de compra: B01 para
     * quien pide comprobante con RNC, B02 para consumidor final —que
     * TODAVÍA NO EXISTE, hay que solicitarla— y B04 para las notas de
     * crédito de una devolución. Las demás se cargan para que el aviso
     * de agotamiento las vigile, pero el sitio no las emite.
     *
     * La fecha de vencimiento está pendiente de confirmar, así que se
     * deja en NULL en vez de inventarse una: una fecha falsa haría que
     * el sistema diera por caducada una secuencia buena, o al revés. */
    `INSERT OR IGNORE INTO secuencias_ncf
       (id, tipo, nombre, prefijo, desde, hasta, siguiente, vence, activa, usa_sitio, creada)
     VALUES
       ('ncf-b01', 'B01', 'Crédito fiscal',          'B01', 16,  30,  16,  NULL, 1, 1, '2026-09-18'),
       ('ncf-b04', 'B04', 'Notas de crédito',        'B04', 1,   10,  1,   NULL, 1, 1, '2026-09-18'),
       ('ncf-b03', 'B03', 'Notas de débito',         'B03', 1,   5,   1,   NULL, 1, 0, '2026-09-18'),
       ('ncf-b11', 'B11', 'Comprobante de compras',  'B11', 18,  22,  18,  NULL, 1, 0, '2026-09-18'),
       ('ncf-b13', 'B13', 'Gastos menores',          'B13', 107, 111, 107, NULL, 1, 0, '2026-09-18'),
       ('ncf-b14', 'B14', 'Regímenes especiales',    'B14', 1,   5,   1,   NULL, 1, 0, '2026-09-18'),
       ('ncf-b15', 'B15', 'Gubernamental',           'B15', 101, 150, 101, NULL, 1, 0, '2026-09-18')`,
  ]],

  /* Lo que la plantilla del comprobante imprime y la tabla todavía no
     guardaba.

     Hasta ahora el PDF se dibujaba con lo que había en memoria en el
     momento de emitir —la referencia del cobro, el período contratado—
     y eso no se volvía a ver nunca. Un comprobante tiene que poder
     reimprimirse igual dentro de cinco años sin depender de qué pago lo
     originó, así que lo que sale impreso se guarda con él.

     Todas las columnas son opcionales o tienen valor por defecto: las
     facturas ya emitidas siguen valiendo tal como están. */
  ['2026-09-comprobantes-plantilla', [
    'ALTER TABLE facturas ADD COLUMN ncf_vencimiento TEXT',
    /* El NCF del comprobante que modifica una nota de crédito. Va
       aparte de `anula_a`, que es el enlace interno: en el papel la
       DGII quiere el NCF, no un identificador nuestro. */
    'ALTER TABLE facturas ADD COLUMN ncf_modificado TEXT',
    'ALTER TABLE facturas ADD COLUMN telefono TEXT',
    'ALTER TABLE facturas ADD COLUMN correo TEXT',
    'ALTER TABLE facturas ADD COLUMN descuento INTEGER NOT NULL DEFAULT 0',
    /* La tasa se guarda CON el comprobante, no se lee de la
       configuración al imprimirlo: si el ITBIS cambia, las facturas
       viejas tienen que seguir mostrando el 18 % con el que se
       calcularon. */
    'ALTER TABLE facturas ADD COLUMN itbis_tasa REAL NOT NULL DEFAULT 0.18',
    'ALTER TABLE facturas ADD COLUMN condicion_pago TEXT',
    'ALTER TABLE facturas ADD COLUMN metodo_pago TEXT',
    'ALTER TABLE facturas ADD COLUMN referencia_pago TEXT',
    'ALTER TABLE facturas ADD COLUMN periodo_servicio TEXT',
    'ALTER TABLE facturas ADD COLUMN notas TEXT',
    /* En qué lote mensual salió hacia el contador. NULL = todavía en
       ninguno, que es como se sabe qué entra en el lote del mes. */
    'ALTER TABLE facturas ADD COLUMN incluida_en_lote TEXT',
    'CREATE INDEX IF NOT EXISTS ix_facturas_lote ON facturas (incluida_en_lote)',

    /* El envío mensual al contador.
     *
     * `periodo` es UNIQUE: es lo que impide que ejecutar la tarea dos
     * veces el mismo mes le mande dos correos. Reenviar es una acción
     * explícita, no el efecto secundario de un reintento. */
    `CREATE TABLE IF NOT EXISTS lotes_contador (
       id           TEXT PRIMARY KEY,
       periodo      TEXT NOT NULL UNIQUE,
       generado_en  TEXT NOT NULL,
       cantidad     INTEGER NOT NULL DEFAULT 0,
       total        INTEGER NOT NULL DEFAULT 0,
       ruta_zip     TEXT,
       enviado_en   TEXT,
       destinatario TEXT
     )`,
  ]],
];

function migrar() {
  db.exec('CREATE TABLE IF NOT EXISTS migraciones (id TEXT PRIMARY KEY, aplicada TEXT NOT NULL)');
  const yaEsta = db.prepare('SELECT 1 FROM migraciones WHERE id = ?');
  const anotar = db.prepare('INSERT INTO migraciones (id, aplicada) VALUES (?, ?)');

  for (const [nombre, sentencias] of MIGRACIONES) {
    if (yaEsta.get(nombre)) continue;
    for (const sql of sentencias) {
      try {
        db.exec(sql);
      } catch (e) {
        // Una columna que ya existe no es un error: pasa cuando la
        // base se creó con un schema.sql que ya la incluía.
        if (!/duplicate column/i.test(e.message)) throw e;
      }
    }
    anotar.run(nombre, new Date().toISOString());
  }
}

/* ── Utilidades ─────────────────────────────────────────── */

const id = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const hoy = () => new Date().toISOString().slice(0, 10);

const sumarDias = (dias, desde = new Date()) => {
  const d = new Date(desde);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
};

const sumarMeses = (meses, desde = new Date()) => {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString();
};

/* Contraseñas con scrypt: lento a propósito, con sal por usuario.
   Nunca se guarda ni se registra la contraseña en claro. */
function cifrarClave(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clave, sal, 64).toString('hex');
  return { hash, sal };
}

function claveCorrecta(clave, hash, sal) {
  const intento = crypto.scryptSync(clave, sal, 64);
  const guardado = Buffer.from(hash, 'hex');
  // Comparación en tiempo constante: una comparación normal filtra
  // cuántos caracteres coinciden por lo que tarda en fallar.
  return guardado.length === intento.length && crypto.timingSafeEqual(guardado, intento);
}

/* Identificador legible y estable para la URL del perfil. */
function aSlug(texto) {
  return String(texto)
    .normalize('NFD').replace(new RegExp('[\u0300-\u036f]', 'g'), '')   // quita las tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'dealer';
}

function slugLibre(base) {
  const d = abrir();
  const existe = d.prepare('SELECT 1 FROM organizaciones WHERE slug = ?');
  let intento = base;
  let n = 2;
  while (existe.get(intento)) intento = `${base}-${n++}`;
  return intento;
}

/* La huella del visitante sirve para no contar diez veces la misma
   visita. Es un hash con sal diaria: no permite reidentificar a nadie
   ni reconstruir la IP, y caduca solo cada 24 horas. */
const SAL_VISITANTE = crypto.randomBytes(32).toString('hex');
const huella = (ip, agente) =>
  crypto.createHash('sha256').update(`${SAL_VISITANTE}|${hoy()}|${ip}|${agente}`).digest('hex').slice(0, 32);

/* ── Usuarios, organizaciones y sesiones ────────────────── */

const usuarioPorCorreo = (correo) =>
  abrir().prepare('SELECT * FROM usuarios WHERE correo = ?').get(String(correo).trim().toLowerCase());

const usuarioPorId = (idUsuario) =>
  abrir().prepare('SELECT * FROM usuarios WHERE id = ?').get(idUsuario);

/* Alta completa: usuario, organización, sucursal principal y rol de
   propietario. Va en una transacción porque una cuenta a medio crear
   (usuario sin organización) no podría publicar nada y habría que
   repararla a mano. */
function crearCuenta({ correo, clave, nombre, telefono, tipo, empresa, rnc, direccion, provincia, municipio, solicitud }) {
  const d = abrir();
  const { hash, sal } = cifrarClave(clave);
  const idUsuario = id();
  const idOrg = id();
  const idSucursal = id();
  const t = ahora();
  const esDealer = tipo === 'dealer';

  const nombreOrg = esDealer ? empresa : nombre;
  // El slug se reserva desde el alta aunque el perfil todavía no se
  // publique: si se calculara al aprobar, dos empresas con el mismo
  // nombre podrían quedarse esperando por la misma URL.
  const slug = esDealer ? slugLibre(aSlug(nombreOrg)) : null;

  const tx = d.prepare('BEGIN');
  tx.run();
  try {
    d.prepare(`INSERT INTO usuarios (id, correo, nombre, telefono, clave_hash, clave_sal, creado)
               VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(idUsuario, String(correo).trim().toLowerCase(), nombre, telefono || null, hash, sal, t);

    d.prepare(`INSERT INTO organizaciones
               (id, tipo, nombre, rnc, slug, correo, telefono, estado_revision, creada)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(idOrg, esDealer ? 'dealer' : 'particular', nombreOrg,
        esDealer ? (rnc || null) : null, slug, String(correo).trim().toLowerCase(), telefono || null,
        esDealer ? 'pendiente' : 'no_aplica', t);

    // La sucursal principal nace con la cuenta. En un dealer llega ya
    // con dirección y teléfono, que son obligatorios; en un particular
    // se completa sola con la provincia del primer anuncio.
    d.prepare(`INSERT INTO sucursales
               (id, organizacion_id, nombre, provincia, municipio, direccion, telefono, principal, creada)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .run(idSucursal, idOrg, esDealer ? 'Oficina principal' : 'Principal',
        esDealer ? (provincia || null) : null,
        esDealer ? (municipio || null) : null,
        esDealer ? (direccion || null) : null,
        telefono || null, t);

    d.prepare(`INSERT INTO miembros (id, organizacion_id, usuario_id, rol, creado)
               VALUES (?, ?, ?, 'propietario', ?)`)
      .run(id(), idOrg, idUsuario, t);

    // La solicitud va dentro de la misma transacción: un dealer sin
    // solicitud quedaría pendiente para siempre, sin nada que el
    // administrador pudiera aprobar.
    if (esDealer && solicitud) {
      d.prepare(`INSERT INTO solicitudes_dealer
        (id, organizacion_id, usuario_id, nombre_comercial, anios_operando, encargado, cargo,
         equipos_inventario, equipos_publicar, tipos_equipo, origen, comentario, estado, creada)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
        .run(id(), idOrg, idUsuario,
          solicitud.nombreComercial || null, solicitud.aniosOperando ?? null,
          solicitud.encargado, solicitud.cargo || null,
          solicitud.equiposInventario ?? null, solicitud.equiposPublicar ?? null,
          solicitud.tiposEquipo || null, solicitud.origen || null, solicitud.comentario || null, t);
    }

    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  return { idUsuario, idOrg };
}

/* Organización sobre la que trabaja el usuario. Hoy se toma la
   primera; cuando haya que operar varias, este es el punto donde
   entra el selector, sin tocar nada más. */
function organizacionDe(idUsuario) {
  return abrir().prepare(`
    SELECT o.*, m.rol
    FROM miembros m
    JOIN organizaciones o ON o.id = m.organizacion_id
    WHERE m.usuario_id = ?
    ORDER BY m.creado
    LIMIT 1`).get(idUsuario);
}

const sucursalPrincipal = (idOrg) =>
  abrir().prepare('SELECT * FROM sucursales WHERE organizacion_id = ? ORDER BY principal DESC, creada LIMIT 1').get(idOrg);

function abrirSesion(idUsuario) {
  const testigo = crypto.randomBytes(32).toString('hex');
  const d = abrir();
  d.prepare('INSERT INTO sesiones (testigo, usuario_id, creada, expira) VALUES (?, ?, ?, ?)')
    .run(testigo, idUsuario, ahora(), sumarDias(30));
  d.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(ahora(), idUsuario);
  return testigo;
}

function sesion(testigo) {
  if (!testigo) return null;
  const fila = abrir().prepare(`
    SELECT s.usuario_id, s.expira, u.correo, u.nombre
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.testigo = ?`).get(testigo);
  if (!fila) return null;
  if (fila.expira < ahora()) { cerrarSesion(testigo); return null; }
  return fila;
}

const cerrarSesion = (testigo) =>
  abrir().prepare('DELETE FROM sesiones WHERE testigo = ?').run(testigo);

/* ── Códigos de verificación ────────────────────────────── */

/* Secreto con el que se firman los códigos. En producción viene del
   entorno y es el mismo en todos los procesos; si se genera al azar
   en cada arranque, un reinicio invalida los códigos en vuelo. */
const SECRETO = process.env.MERCA_SECRETO || crypto.randomBytes(32).toString('hex');

if (!process.env.MERCA_SECRETO) {
  console.warn('aviso: MERCA_SECRETO sin definir; los códigos en vuelo caducan al reiniciar.');
}

const firmarCodigo = (codigo, correo) =>
  crypto.createHmac('sha256', SECRETO).update(`${correo}|${codigo}`).digest('hex');

/* Seis dígitos, con generación uniforme. Math.random no sirve: es
   predecible y aquí protege el acceso a una cuenta. */
const generarCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const MINUTOS_CODIGO = { verificacion: 15, acceso: 10, restablecer: 20 };
const MAX_INTENTOS_CODIGO = 5;

/* Emite un código y anula los anteriores del mismo tipo: si se piden
   tres seguidos, solo vale el último. */
function crearCodigo({ correo, tipo, idUsuario }) {
  const d = abrir();
  const normalizado = String(correo).trim().toLowerCase();

  d.prepare('UPDATE codigos SET consumido = 1 WHERE correo = ? AND tipo = ? AND consumido = 0')
    .run(normalizado, tipo);

  const codigo = generarCodigo();
  const minutos = MINUTOS_CODIGO[tipo] || 10;

  d.prepare(`INSERT INTO codigos (id, usuario_id, correo, tipo, codigo_hash, expira, creado)
             VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id(), idUsuario || null, normalizado, tipo, firmarCodigo(codigo, normalizado),
      new Date(Date.now() + minutos * 60000).toISOString(), ahora());

  return { codigo, minutos };
}

/* Comprueba y consume. Devuelve { ok, motivo, usuario_id }.

   El código se marca consumido en cuanto acierta, dentro de la misma
   sentencia condicional: dos peticiones simultáneas con el código
   correcto no pueden pasar las dos. */
function verificarCodigo({ correo, tipo, codigo }) {
  const d = abrir();
  const normalizado = String(correo).trim().toLowerCase();

  const fila = d.prepare(`
    SELECT * FROM codigos
    WHERE correo = ? AND tipo = ? AND consumido = 0
    ORDER BY creado DESC LIMIT 1`).get(normalizado, tipo);

  if (!fila) return { ok: false, motivo: 'inexistente' };
  if (fila.expira < ahora()) return { ok: false, motivo: 'vencido' };
  if (fila.intentos >= MAX_INTENTOS_CODIGO) {
    d.prepare('UPDATE codigos SET consumido = 1 WHERE id = ?').run(fila.id);
    return { ok: false, motivo: 'agotado' };
  }

  const esperado = Buffer.from(fila.codigo_hash, 'hex');
  const recibido = Buffer.from(firmarCodigo(String(codigo || '').trim(), normalizado), 'hex');
  const coincide = esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);

  if (!coincide) {
    d.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE id = ?').run(fila.id);
    return { ok: false, motivo: 'incorrecto', restantes: MAX_INTENTOS_CODIGO - fila.intentos - 1 };
  }

  const r = d.prepare('UPDATE codigos SET consumido = 1 WHERE id = ? AND consumido = 0').run(fila.id);
  if (!r.changes) return { ok: false, motivo: 'usado' };

  return { ok: true, usuario_id: fila.usuario_id };
}

const marcarCorreoVerificado = (idUsuario) =>
  abrir().prepare('UPDATE usuarios SET correo_verificado = 1 WHERE id = ?').run(idUsuario);

/* ── Equipos de confianza ───────────────────────────────── */

const DIAS_DISPOSITIVO = 60;

function recordarDispositivo(idUsuario, descripcion) {
  const testigo = crypto.randomBytes(32).toString('hex');
  abrir().prepare(`INSERT INTO dispositivos (testigo, usuario_id, descripcion, creado, expira, ultimo_uso)
                   VALUES (?, ?, ?, ?, ?, ?)`)
    .run(testigo, idUsuario, String(descripcion || '').slice(0, 200), ahora(),
      sumarDias(DIAS_DISPOSITIVO), ahora());
  return testigo;
}

/* ¿Este equipo ya verificó un código para esta cuenta? */
function dispositivoDeConfianza(testigo, idUsuario) {
  if (!testigo) return false;
  const d = abrir();
  const fila = d.prepare('SELECT * FROM dispositivos WHERE testigo = ? AND usuario_id = ?')
    .get(testigo, idUsuario);
  if (!fila || fila.expira < ahora()) return false;
  d.prepare('UPDATE dispositivos SET ultimo_uso = ? WHERE testigo = ?').run(ahora(), testigo);
  return true;
}

/* Al cambiar la contraseña se cierra todo: sesiones y equipos
   recordados. Es el punto del sistema en el que se echa fuera a quien
   hubiera entrado sin permiso. */
function cerrarTodoDe(idUsuario) {
  const d = abrir();
  d.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(idUsuario);
  d.prepare('DELETE FROM dispositivos WHERE usuario_id = ?').run(idUsuario);
}

/* ── Límite de intentos ─────────────────────────────────── */

/* Ventana deslizante por clave (correo, IP o la combinación). Sirve
   igual para "cuántos códigos ha pedido este correo" que para
   "cuántas contraseñas ha probado esta IP".

   Devuelve false cuando se pasó del tope. */
function permitir(clave, tope, minutos) {
  const d = abrir();
  const t = ahora();

  d.prepare('DELETE FROM intentos WHERE expira < ?').run(t);

  const fila = d.prepare('SELECT * FROM intentos WHERE clave = ?').get(clave);
  if (!fila) {
    d.prepare('INSERT INTO intentos (clave, cuenta, expira) VALUES (?, 1, ?)')
      .run(clave, new Date(Date.now() + minutos * 60000).toISOString());
    return true;
  }
  if (fila.cuenta >= tope) return false;

  d.prepare('UPDATE intentos SET cuenta = cuenta + 1 WHERE clave = ?').run(clave);
  return true;
}

const limpiarIntentos = (clave) => abrir().prepare('DELETE FROM intentos WHERE clave = ?').run(clave);

/* Purga lo caducado. Se llama de vez en cuando desde el servidor para
   que estas tablas no crezcan sin fin. */
function purgar() {
  const d = abrir();
  const t = ahora();
  d.prepare('DELETE FROM sesiones WHERE expira < ?').run(t);
  d.prepare('DELETE FROM dispositivos WHERE expira < ?').run(t);
  d.prepare('DELETE FROM intentos WHERE expira < ?').run(t);
  d.prepare('DELETE FROM codigos WHERE expira < ?').run(new Date(Date.now() - 86400000).toISOString());
}

/* ── Perfil de dealer ───────────────────────────────────── */

/* Convierte una organización en dealer al registrar el RNC: es el
   camino del particular que crece y pasa a empresa. Deja la cuenta
   'pendiente' y abre su solicitud, igual que si se hubiera registrado
   como dealer desde el principio; no hay atajo que se salte la
   revisión. El slug se calcula una vez y no se vuelve a tocar, porque
   es una URL que puede estar compartida por ahí. */
function registrarDealer(idOrg, idUsuario, { rnc, empresa, web, descripcion, solicitud }) {
  const d = abrir();
  const org = d.prepare('SELECT * FROM organizaciones WHERE id = ?').get(idOrg);
  if (!org) throw Object.assign(new Error('Organización inexistente'), { codigo: 404 });

  // Una solicitud ya resuelta no se reabre por volver a mandar el
  // formulario; una pendiente se actualiza en vez de duplicarse.
  if (org.estado_revision === 'pendiente') {
    throw Object.assign(new Error('Su solicitud ya está en revisión'), { codigo: 409 });
  }
  if (org.estado_revision === 'aprobada') {
    throw Object.assign(new Error('Su cuenta de empresa ya está aprobada'), { codigo: 409 });
  }

  const duenoDelRnc = d.prepare('SELECT id FROM organizaciones WHERE rnc = ? AND id <> ?').get(rnc, idOrg);
  if (duenoDelRnc) throw Object.assign(new Error('Ese RNC ya está registrado por otra cuenta'), { codigo: 409 });

  const nombre = empresa || org.nombre;
  const slug = org.slug || slugLibre(aSlug(nombre));
  const t = ahora();

  d.prepare('BEGIN').run();
  try {
    d.prepare(`UPDATE organizaciones
               SET tipo = 'dealer', rnc = ?, nombre = ?, slug = ?, web = COALESCE(?, web),
                   descripcion = COALESCE(?, descripcion),
                   estado_revision = 'pendiente', perfil_publico = 0, actualizada = ?
               WHERE id = ?`)
      .run(rnc, nombre, slug, web || null, descripcion || null, t, idOrg);

    d.prepare(`INSERT INTO solicitudes_dealer
      (id, organizacion_id, usuario_id, nombre_comercial, anios_operando, encargado, cargo,
       equipos_inventario, equipos_publicar, tipos_equipo, origen, comentario, estado, creada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
      .run(id(), idOrg, idUsuario,
        solicitud?.nombreComercial || null, solicitud?.aniosOperando ?? null,
        solicitud?.encargado || nombre, solicitud?.cargo || null,
        solicitud?.equiposInventario ?? null, solicitud?.equiposPublicar ?? null,
        solicitud?.tiposEquipo || null, solicitud?.origen || null, solicitud?.comentario || null, t);

    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  return d.prepare('SELECT * FROM organizaciones WHERE id = ?').get(idOrg);
}

/* ── Solicitudes de servicio ────────────────────────────────
   Alquiler, transporte e importación. Antes estos formularios no
   guardaban nada: pintaban un resumen y le pedían al cliente que lo
   copiara a WhatsApp. Quien no lo copiaba se perdía, y no quedaba
   rastro de cuántos se perdían. */

/* Referencia corta y legible por teléfono. Lleva el año para que dos
   de eneros distintos no se confundan al buscarlas. */
function referenciaServicio(servicio) {
  const letra = { alquiler: 'A', transporte: 'T', importacion: 'I' }[servicio] || 'S';
  return `${letra}${new Date().getFullYear()}-${id().slice(0, 5).toUpperCase()}`;
}

function crearSolicitudServicio(datos) {
  const d = abrir();
  const idSol = id();
  const referencia = referenciaServicio(datos.servicio);

  d.prepare(`INSERT INTO solicitudes_servicio
    (id, servicio, referencia, nombre, telefono, correo, empresa, detalle, estado, creada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nueva', ?)`)
    .run(idSol, datos.servicio, referencia, datos.nombre, datos.telefono,
      datos.correo || null, datos.empresa || null,
      JSON.stringify(datos.detalle || {}), ahora());

  return solicitudServicio(idSol);
}

function solicitudServicio(idSol) {
  const s = abrir().prepare('SELECT * FROM solicitudes_servicio WHERE id = ?').get(idSol);
  if (!s) return null;
  let detalle = {};
  try { detalle = JSON.parse(s.detalle); } catch (_) { /* guardado a mano */ }
  return { ...s, detalle };
}

const solicitudesServicio = ({ servicio, estado } = {}) => {
  const donde = [];
  const args = {};
  if (servicio) { donde.push('servicio = :servicio'); args.servicio = servicio; }
  if (estado) { donde.push('estado = :estado'); args.estado = estado; }

  return abrir().prepare(`SELECT * FROM solicitudes_servicio
      ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''}
      ORDER BY creada DESC LIMIT 200`).all(args)
    .map((s) => {
      let detalle = {};
      try { detalle = JSON.parse(s.detalle); } catch (_) { /* guardado a mano */ }
      return { ...s, detalle };
    });
};

const marcarSolicitudServicio = (idSol, estado, nota) =>
  abrir().prepare(`UPDATE solicitudes_servicio
       SET estado = ?, nota = COALESCE(?, nota), atendida = ?
     WHERE id = ?`)
    .run(estado, nota || null, estado === 'nueva' ? null : ahora(), idSol);

/* ── Flota propia (alquiler y transporte) ───────────────── */

/* Fotografías de un tipo de equipo. Varias y de marcas distintas: no
   se alquila una máquina concreta, se alquila un tipo, y se entrega la
   que esté libre ese día. */
const fotosDeFlota = (idFlota) =>
  abrir().prepare('SELECT id, url, alt, orden FROM flota_fotos WHERE flota_id = ? ORDER BY orden, id')
    .all(idFlota);

/* Reemplaza la galería entera. Es más simple que ir cotejando cuál
   cambió, y son cuatro o cinco filas por tipo. */
function guardarFotosDeFlota(idFlota, fotos) {
  const d = abrir();
  d.prepare('DELETE FROM flota_fotos WHERE flota_id = ?').run(idFlota);
  fotos.slice(0, 8).forEach((f, i) => {
    const url = typeof f === 'string' ? f : f.url;
    if (!url) return;
    d.prepare('INSERT INTO flota_fotos (id, flota_id, url, alt, orden) VALUES (?, ?, ?, ?, ?)')
      .run(id(), idFlota, String(url), (f && f.alt) || null, i);
  });
}

/* Añade la galería a cada ficha. Si un tipo todavía no tiene ninguna,
   se cae en la foto suelta de siempre para no dejarlo sin imagen. */
const conFotos = (f) => {
  const fotos = fotosDeFlota(f.id);
  return {
    ...f,
    fotos: fotos.length
      ? fotos
      : (f.foto ? [{ url: f.foto, alt: f.nombre, orden: 0 }] : []),
  };
};

/* Lo que ve el visitante: solo lo activo, en su orden. */
const flotaPublica = (servicio) =>
  abrir().prepare(`SELECT id, nombre, detalle, icono, unidad, capacidad, capacidad_texto, foto
                   FROM flota WHERE servicio = ? AND activo = 1
                   ORDER BY orden, nombre`).all(servicio).map(conFotos);

/* Lo que ve el administrador: también lo desactivado, porque desde
   ahí se vuelve a activar. */
const flotaCompleta = (servicio) =>
  abrir().prepare(`SELECT * FROM flota WHERE servicio = ? ORDER BY orden, nombre`).all(servicio)
    .map(conFotos);

const flotaPorId = (idFlota) => {
  const f = abrir().prepare('SELECT * FROM flota WHERE id = ?').get(idFlota);
  return f ? conFotos(f) : null;
};

function crearFlota(datos) {
  const idFlota = id();
  const t = ahora();
  // Al final de la lista: quien añade una máquina no debería tener que
  // decidir en qué posición va antes de verla.
  const ultimo = abrir().prepare('SELECT MAX(orden) AS n FROM flota WHERE servicio = ?')
    .get(datos.servicio).n;

  abrir().prepare(`INSERT INTO flota
    (id, servicio, nombre, detalle, icono, unidad, capacidad, capacidad_texto, foto, activo, orden, creado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(idFlota, datos.servicio, datos.nombre, datos.detalle || null,
      datos.icono || null, datos.unidad || null, datos.capacidad ?? null,
      datos.capacidad_texto || datos.capacidadTexto || null, datos.foto || null, (ultimo || 0) + 1, t);

  if (Array.isArray(datos.fotos)) guardarFotosDeFlota(idFlota, datos.fotos);
  return flotaPorId(idFlota);
}

/* Solo se tocan los campos que llegan: así el formulario puede mandar
   un cambio parcial sin borrar lo que no incluye. */
function actualizarFlota(idFlota, datos) {
  const actual = flotaPorId(idFlota);
  if (!actual) throw Object.assign(new Error('Ese elemento no existe'), { codigo: 404 });

  if (Array.isArray(datos.fotos)) guardarFotosDeFlota(idFlota, datos.fotos);

  const campos = ['nombre', 'detalle', 'icono', 'unidad', 'capacidad', 'capacidad_texto', 'foto', 'activo', 'orden'];
  const cambios = campos.filter((c) => datos[c] !== undefined);
  if (!cambios.length) return flotaPorId(idFlota);

  abrir().prepare(`UPDATE flota SET ${cambios.map((c) => `${c} = ?`).join(', ')}, actualizado = ?
                   WHERE id = ?`)
    .run(...cambios.map((c) => datos[c]), ahora(), idFlota);

  return flotaPorId(idFlota);
}

const borrarFlota = (idFlota) =>
  abrir().prepare('DELETE FROM flota WHERE id = ?').run(idFlota);

/* ── Publicidad ─────────────────────────────────────────── */

/* Lo que se muestra hoy: encendida y dentro de sus fechas. Las fechas
   mandan sobre `activo`, así una campaña termina sola el día pactado.

   Se comparan como texto: las fechas se guardan en ISO (AAAA-MM-DD),
   que ordena igual alfabéticamente que cronológicamente. */
/* ── Ajustes del sitio ──────────────────────────────────────
   Pocos y concretos. Cada clave que se admite está en esta lista: así
   una petición manipulada no puede sembrar filas arbitrarias en la
   tabla, y quien lea el código sabe de un vistazo qué es configurable
   y qué no. */
const AJUSTES = ['heroe_imagen', 'heroe_alt'];

const ajustes = () => {
  const filas = abrir().prepare('SELECT clave, valor FROM ajustes').all();
  const salida = {};
  filas.forEach((f) => { if (AJUSTES.includes(f.clave)) salida[f.clave] = f.valor; });
  return salida;
};

function guardarAjuste(clave, valor) {
  if (!AJUSTES.includes(clave)) {
    throw Object.assign(new Error('Ajuste desconocido'), { codigo: 400 });
  }
  // Un valor vacío borra la fila en vez de guardar cadena vacía: "sin
  // definir" y "definido como nada" son lo mismo aquí, y tenerlos como
  // dos estados distintos obliga a comprobar los dos en cada lectura.
  if (valor === null || valor === undefined || valor === '') {
    abrir().prepare('DELETE FROM ajustes WHERE clave = ?').run(clave);
    return null;
  }
  abrir().prepare(`INSERT INTO ajustes (clave, valor, actualizado) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado`)
    .run(clave, String(valor), ahora());
  return String(valor);
}

/* ── Fotografías del catálogo para la portada ───────────────
   Las tarjetas de categoría enseñaban un hexágono gris: `portada`
   estaba en null para las dieciséis. Ahora enseñan una máquina de
   verdad de esa misma categoría, y como vienen varias, la pantalla
   rota entre ellas en cada visita.

   Se toma la foto de portada de cada anuncio y se prefieren los
   destacados y los más recientes: son los que el anunciante acaba de
   cuidar, así que son los que mejor se ven.

   `n` es deliberadamente bajo. Cada foto puede ser una ruta corta o
   —en las sembradas para desarrollo— un data URI de más de un
   kilobyte, y esto viaja en cada carga de la página. */
function fotosPorCategoria(n = 4) {
  const filas = abrir().prepare(`
    WITH con_foto AS (
      SELECT a.id, a.categoria, a.marca, a.modelo, a.anio,
             (SELECT COALESCE(f.miniatura, f.url) FROM anuncio_fotos f
               WHERE f.anuncio_id = a.id ORDER BY f.orden LIMIT 1) AS foto,
             a.destacado_hasta, a.publicado
      FROM anuncios a
      WHERE a.estado = 'activo'
    )
    SELECT id, categoria, marca, modelo, anio, foto FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY categoria
        ORDER BY (destacado_hasta IS NOT NULL) DESC, publicado DESC) AS puesto
      FROM con_foto WHERE foto IS NOT NULL
    ) WHERE puesto <= ?`).all(Math.max(1, Math.min(n, 8)));

  const salida = {};
  filas.forEach((f) => {
    (salida[f.categoria] ||= []).push({
      id: f.id,
      foto: f.foto,
      titulo: `${f.anio} ${taxonomia.nombreMarca(f.marca) || f.marca} ${f.modelo}`,
    });
  });
  return salida;
}

/* La fotografía del héroe de la portada.

   `imagen` es la que fijó el equipo desde /admin.html y manda sobre
   todo lo demás. Si no hay ninguna fijada se ofrecen candidatas del
   catálogo —equipos publicados de verdad— y la pantalla elige una;
   si tampoco hay catálogo, la portada se queda con su plano técnico,
   que es el respaldo y nunca se ve roto. */
function heroePortada(candidatas = 6) {
  const a = ajustes();
  const filas = abrir().prepare(`
    SELECT a.marca, a.modelo, a.anio,
           (SELECT f.url FROM anuncio_fotos f
             WHERE f.anuncio_id = a.id ORDER BY f.orden LIMIT 1) AS foto
    FROM anuncios a
    WHERE a.estado = 'activo'
    ORDER BY (a.destacado_hasta IS NOT NULL) DESC, a.publicado DESC
    LIMIT ?`).all(Math.max(1, Math.min(candidatas, 12)));

  return {
    imagen: a.heroe_imagen || null,
    alt: a.heroe_alt || null,
    opciones: filas.filter((f) => f.foto).map((f) => ({
      imagen: f.foto,
      alt: `${f.anio} ${taxonomia.nombreMarca(f.marca) || f.marca} ${f.modelo} publicado en MercaMaquinarias`,
      /* Fijable solo si es un archivo del propio sitio. Las fotos
         antiguas guardadas como data URI sirven de fondo rotatorio,
         pero no se pueden fijar: la ruta que se guarda en `ajustes`
         tiene que apuntar a /fotos. El panel usa esta marca para no
         ofrecer opciones que la API va a rechazar. */
      fijable: String(f.foto).startsWith('/fotos/'),
    })),
  };
}

const publicidadVigente = () =>
  abrir().prepare(`
    SELECT id, espacio, imagen, enlace, alt
    FROM publicidad
    WHERE activo = 1
      AND (desde IS NULL OR desde <= :hoy)
      AND (hasta IS NULL OR hasta >= :hoy)
    ORDER BY espacio, orden, creado`).all({ hoy: hoy() });

const publicidadCompleta = () =>
  abrir().prepare('SELECT * FROM publicidad ORDER BY espacio, orden, creado').all();

const publicidadPorId = (idPub) =>
  abrir().prepare('SELECT * FROM publicidad WHERE id = ?').get(idPub);

function crearPublicidad(datos) {
  const idPub = id();
  const t = ahora();
  const ultimo = abrir().prepare('SELECT MAX(orden) AS n FROM publicidad WHERE espacio = ?')
    .get(datos.espacio).n;

  abrir().prepare(`INSERT INTO publicidad
    (id, espacio, nombre, anunciante, imagen, enlace, alt, desde, hasta, activo, orden, creado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(idPub, datos.espacio, datos.nombre, datos.anunciante || null,
      datos.imagen, datos.enlace || null, datos.alt,
      datos.desde || null, datos.hasta || null, (ultimo || 0) + 1, t);

  return publicidadPorId(idPub);
}

function actualizarPublicidad(idPub, datos) {
  const actual = publicidadPorId(idPub);
  if (!actual) throw Object.assign(new Error('Ese anuncio no existe'), { codigo: 404 });

  const campos = ['espacio', 'nombre', 'anunciante', 'imagen', 'enlace', 'alt',
    'desde', 'hasta', 'activo', 'orden'];
  const cambios = campos.filter((c) => datos[c] !== undefined);
  if (!cambios.length) return actual;

  abrir().prepare(`UPDATE publicidad SET ${cambios.map((c) => `${c} = ?`).join(', ')}, actualizado = ?
                   WHERE id = ?`)
    .run(...cambios.map((c) => datos[c]), ahora(), idPub);

  return publicidadPorId(idPub);
}

const borrarPublicidad = (idPub) =>
  abrir().prepare('DELETE FROM publicidad WHERE id = ?').run(idPub);

/* Contadores. Se suman con UPDATE directo y no leyendo antes: aguanta
   escrituras concurrentes sin condición de carrera. */
const sumarImpresiones = (ids) => {
  if (!ids.length) return;
  const d = abrir();
  const upd = d.prepare('UPDATE publicidad SET impresiones = impresiones + 1 WHERE id = ?');
  d.prepare('BEGIN').run();
  try { ids.forEach((i) => upd.run(i)); d.prepare('COMMIT').run(); } catch (e) { d.prepare('ROLLBACK').run(); }
};

const sumarClic = (idPub) =>
  abrir().prepare('UPDATE publicidad SET clics = clics + 1 WHERE id = ?').run(idPub);

/* ── Revisión de solicitudes ────────────────────────────── */

/* Expediente completo de una solicitud: lo declarado, con quién
   hablar y desde dónde opera. Es la única consulta que devuelve el
   RNC entero, y solo la usan las rutas de administración y el correo
   de aviso. */
function solicitudCompleta(idSolicitud, { porOrganizacion = false } = {}) {
  const campo = porOrganizacion ? 's.organizacion_id' : 's.id';
  return abrir().prepare(`
    SELECT s.*, o.nombre AS razon_social, o.rnc, o.slug, o.correo AS correo_empresa,
           o.telefono, o.estado_revision, o.web,
           u.nombre AS solicitante, u.correo AS correo_solicitante,
           (SELECT direccion FROM sucursales WHERE organizacion_id = o.id ORDER BY principal DESC LIMIT 1) AS direccion,
           (SELECT provincia FROM sucursales WHERE organizacion_id = o.id ORDER BY principal DESC LIMIT 1) AS provincia,
           (SELECT municipio FROM sucursales WHERE organizacion_id = o.id ORDER BY principal DESC LIMIT 1) AS municipio,
           r.nombre AS revisor
    FROM solicitudes_dealer s
    JOIN organizaciones o ON o.id = s.organizacion_id
    JOIN usuarios u ON u.id = s.usuario_id
    LEFT JOIN usuarios r ON r.id = s.revisada_por
    WHERE ${campo} = ?
    ORDER BY s.creada DESC
    LIMIT 1`).get(idSolicitud);
}

/* Cola de revisión. Sin RNC: la lista se pinta en pantalla y el número
   completo solo hace falta al abrir un expediente concreto. */
const solicitudes = (estado = 'pendiente') =>
  abrir().prepare(`
    SELECT s.id, s.organizacion_id, s.encargado, s.cargo, s.nombre_comercial,
           s.equipos_inventario, s.equipos_publicar, s.estado, s.creada, s.revisada, s.motivo,
           o.nombre AS razon_social, o.slug,
           u.correo AS correo_solicitante
    FROM solicitudes_dealer s
    JOIN organizaciones o ON o.id = s.organizacion_id
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.estado = ?
    ORDER BY s.creada DESC`).all(estado);

const contarPendientes = () =>
  abrir().prepare("SELECT COUNT(*) AS n FROM solicitudes_dealer WHERE estado = 'pendiente'").get().n;

/* Aprueba o rechaza. Mueve la solicitud y la organización a la vez:
   dejar una aprobada y la otra pendiente es justo el estado que haría
   invisible a un dealer ya admitido. */
function resolverSolicitud(idSolicitud, { aprobar, idRevisor, motivo }) {
  const d = abrir();
  const s = d.prepare('SELECT * FROM solicitudes_dealer WHERE id = ?').get(idSolicitud);
  if (!s) throw Object.assign(new Error('Esa solicitud no existe'), { codigo: 404 });
  if (s.estado !== 'pendiente') {
    throw Object.assign(new Error(`La solicitud ya está ${s.estado}`), { codigo: 409 });
  }

  const estado = aprobar ? 'aprobada' : 'rechazada';
  const t = ahora();

  d.prepare('BEGIN').run();
  try {
    d.prepare(`UPDATE solicitudes_dealer
               SET estado = ?, revisada = ?, revisada_por = ?, motivo = ?
               WHERE id = ?`)
      .run(estado, t, idRevisor, aprobar ? null : (motivo || null), idSolicitud);

    d.prepare('UPDATE organizaciones SET estado_revision = ?, actualizada = ? WHERE id = ?')
      .run(estado, t, s.organizacion_id);

    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  return solicitudCompleta(idSolicitud);
}

/* El rol de administrador se concede desde la línea de comandos
   (tools/admin.js), nunca desde una pantalla del sitio. */
function marcarAdmin(correo, esAdmin = true) {
  const info = abrir().prepare('UPDATE usuarios SET es_admin = ? WHERE correo = ?')
    .run(esAdmin ? 1 : 0, String(correo).trim().toLowerCase());
  return info.changes > 0;
}

/* Directorio público. Un dealer sale publicado cuando se cumplen las
   dos condiciones, que son independientes entre sí: el administrador
   aprobó la solicitud y el plan contratado habilita el perfil.

   Ninguna de estas dos consultas selecciona `rnc`. Es deliberado y no
   debe "simplificarse" a un SELECT *: el RNC solo se entrega en las
   rutas de administración, y la forma más fiable de que no se escape
   es que no viaje en el resultado. */
function dealersPublicos() {
  return abrir().prepare(`
    SELECT o.id, o.nombre, o.slug, o.verificada, o.descripcion, o.web,
           (SELECT provincia FROM sucursales WHERE organizacion_id = o.id ORDER BY principal DESC LIMIT 1) AS provincia,
           COUNT(a.id) AS equipos
    FROM organizaciones o
    LEFT JOIN anuncios a ON a.organizacion_id = o.id AND a.estado = 'activo'
    WHERE o.tipo = 'dealer' AND o.perfil_publico = 1 AND o.estado_revision = 'aprobada'
    GROUP BY o.id
    ORDER BY equipos DESC, o.nombre`).all();
}

const dealerPorSlug = (slug) =>
  abrir().prepare(`SELECT id, nombre, slug, verificada, descripcion, web, telefono, correo, creada
                   FROM organizaciones
                   WHERE slug = ? AND tipo = 'dealer' AND estado_revision = 'aprobada'`).get(slug);

const sucursalesDe = (idOrg) =>
  abrir().prepare('SELECT * FROM sucursales WHERE organizacion_id = ? AND activa = 1 ORDER BY principal DESC, nombre').all(idOrg);

const sucursal = (idSucursal, idOrg) =>
  abrir().prepare('SELECT * FROM sucursales WHERE id = ? AND organizacion_id = ?').get(idSucursal, idOrg);

function crearSucursal(idOrg, datos) {
  const idSucursal = id();
  abrir().prepare(`INSERT INTO sucursales
    (id, organizacion_id, nombre, provincia, municipio, direccion, telefono, whatsapp, horario, principal, creada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run(idSucursal, idOrg, datos.nombre, datos.provincia || null, datos.municipio || null,
      datos.direccion || null, datos.telefono || null, datos.whatsapp || null,
      datos.horario || null, ahora());
  return idSucursal;
}

const actualizarSucursal = (idSucursal, idOrg, datos) =>
  abrir().prepare(`UPDATE sucursales
    SET nombre = ?, provincia = ?, municipio = ?, direccion = ?, telefono = ?, whatsapp = ?, horario = ?
    WHERE id = ? AND organizacion_id = ?`)
    .run(datos.nombre, datos.provincia || null, datos.municipio || null, datos.direccion || null,
      datos.telefono || null, datos.whatsapp || null, datos.horario || null, idSucursal, idOrg);

/* Las sucursales no se borran: se desactivan. Sus anuncios apuntan a
   ellas y el historial de métricas sigue colgando de esos anuncios;
   un DELETE dejaría el pasado sin contexto. La principal no se puede
   desactivar, porque la organización se quedaría sin dirección. */
function desactivarSucursal(idSucursal, idOrg) {
  const s = sucursal(idSucursal, idOrg);
  if (!s) return { ok: false, motivo: 'inexistente' };
  if (s.principal) return { ok: false, motivo: 'principal' };
  abrir().prepare('UPDATE sucursales SET activa = 0 WHERE id = ? AND organizacion_id = ?')
    .run(idSucursal, idOrg);
  return { ok: true };
}

/* Cambia cuál es la principal. Va en transacción porque entre quitar
   la marca a una y ponérsela a otra no puede haber un instante sin
   ninguna. */
function marcarPrincipal(idSucursal, idOrg) {
  const d = abrir();
  if (!sucursal(idSucursal, idOrg)) return false;
  d.prepare('BEGIN').run();
  try {
    d.prepare('UPDATE sucursales SET principal = 0 WHERE organizacion_id = ?').run(idOrg);
    d.prepare('UPDATE sucursales SET principal = 1 WHERE id = ? AND organizacion_id = ?').run(idSucursal, idOrg);
    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }
  return true;
}

/* ── Planes y suscripciones ─────────────────────────────── */

/* Precio que rige HOY para un plan. Es el único sitio del sistema que
   decide cuánto vale un plan: lo usan el cobro del servidor y las
   tarjetas que pinta el navegador, de modo que no pueden discrepar.

   Una promoción sin fecha de término se ignora a propósito: sin fecha
   no es una rebaja temporal, es el precio, y debe escribirse como tal
   en la columna `precio`. */
function conPrecioVigente(plan) {
  if (!plan) return plan;
  const enPromo = plan.precio_promocional != null
    && plan.promo_hasta
    && hoy() <= plan.promo_hasta;

  return {
    ...plan,
    precio_vigente: enPromo ? plan.precio_promocional : plan.precio,
    en_promo: !!enPromo,
    promo_hasta: enPromo ? plan.promo_hasta : null,
    // Lo que costará al terminar la promoción, para poder decirlo en
    // la tarjeta en vez de que el precio suba un día sin avisar.
    precio_normal: plan.precio,
  };
}

const planes = () =>
  abrir().prepare('SELECT * FROM planes WHERE activo = 1 ORDER BY orden').all()
    .map(conPrecioVigente);

const planPorId = (idPlan) =>
  conPrecioVigente(abrir().prepare('SELECT * FROM planes WHERE id = ?').get(idPlan));

/* Un cupo lo ocupa un anuncio publicado o pausado. Vendido y retirado
   lo liberan, y ahí está el sentido de "marcar vendido": el sitio que
   pagó vuelve a quedar disponible sin volver a pagarlo.

   Pausar NO libera. Si lo hiciera, pausar y publicar en bucle daría
   anuncios ilimitados por el precio de uno. */
const ESTADOS_QUE_OCUPAN = "('activo', 'pausado')";

/* Todas las membresías vivas de una organización, con lo que tienen
   ocupado. Devuelve varias a propósito: quien compró cinco Destacados
   y antes tenía un Estándar suelto tiene dos, y esconderle una era
   justo el fallo que dejaba un cupo pagado fuera de su alcance. */
function suscripcionesDe(idOrg) {
  return abrir().prepare(`
    SELECT s.*, p.nombre AS plan_nombre, p.nivel, p.precio AS precio_unitario,
           p.perfil_publico, p.fotos_maximas, p.videos_maximos, p.destacado,
           (SELECT COUNT(*) FROM anuncios a
             WHERE a.suscripcion_id = s.id
               AND a.estado IN ${ESTADOS_QUE_OCUPAN}) AS ocupados
    FROM suscripciones s JOIN planes p ON p.id = s.plan_id
    WHERE s.organizacion_id = ? AND s.estado = 'activa'
    ORDER BY p.orden DESC, s.creada DESC`).all(idOrg)
    .map((s) => ({
      ...s,
      libres: s.anuncios_incluidos == null
        ? null                          // sin límite, del modelo viejo
        : Math.max(0, s.anuncios_incluidos - s.ocupados),
    }));
}

const suscripcion = (idSusc, idOrg) =>
  suscripcionesDe(idOrg).find((s) => s.id === idSusc) || null;

/* La membresía con sitio libre que mejor sirve para publicar: el nivel
   más alto disponible, que es el que más hace por el anuncio. Si no
   hay ninguna con hueco devuelve null y quien llama decide si vender
   un cupo o negarse. */
const suscripcionConHueco = (idOrg, idPlan = null) =>
  suscripcionesDe(idOrg).find((s) =>
    (s.libres === null || s.libres > 0) && (!idPlan || s.plan_id === idPlan)) || null;

/* Compatibilidad: quedaba usada por la sesión y por el panel viejo.
   Devuelve la de nivel más alto, que es la que representa mejor a la
   cuenta cuando hay que enseñar una sola. */
function suscripcionActiva(idOrg) {
  return suscripcionesDe(idOrg)[0] || null;
}

/* Anota un pago. Uno de importe cero se anota igual y como aprobado:
   no hay nada que cobrar, y dejarlo 'pendiente' llenaría el historial
   del anunciante de facturas que nadie va a pagar. */
function anotarPago(d, { idOrg, idSusc, cobro, t }) {
  d.prepare(`INSERT INTO pagos
    (id, organizacion_id, suscripcion_id, subtotal, itbis, total, estado, referencia, procesador, creado)
    VALUES (?, ?, ?, ?, ?, ?, 'aprobado', ?, ?, ?)`)
    .run(id(), idOrg, idSusc, cobro.subtotal, cobro.itbis, cobro.total,
      cobro.referencia, cobro.total > 0 ? (cobro.procesador || 'demo') : 'sin-costo', t);
}

/* La página pública de la empresa la trae el nivel Premium, pero solo
   se enciende si el RNC ya pasó por revisión. Pagar no salta la
   comprobación: el directorio dejaría de significar nada si bastara
   con contratar para aparecer en él. */
function encenderPerfilSiProcede(d, idOrg, plan, t) {
  if (!plan.perfil_publico) return false;
  const org = d.prepare('SELECT tipo, estado_revision FROM organizaciones WHERE id = ?').get(idOrg);
  if (!org || org.tipo !== 'dealer' || org.estado_revision !== 'aprobada') return false;
  d.prepare('UPDATE organizaciones SET perfil_publico = 1, actualizada = ? WHERE id = ?').run(t, idOrg);
  return true;
}

/* ── Comprar capacidad ──────────────────────────────────────
   Se compran `cupo` sitios de un nivel durante `dias`. El importe ya
   viene calculado y comprobado por quien llama: aquí solo se guarda.
   El precio pactado queda congelado en la suscripción, así que subir
   la tarifa mañana no afecta a lo ya vendido. */
function comprarCupos({ idOrg, idPlan, cupo, dias, cobro }) {
  const d = abrir();
  const plan = planPorId(idPlan);
  if (!plan) throw Object.assign(new Error('Plan inexistente'), { codigo: 400 });

  const idSusc = id();
  const t = ahora();
  const duracion = Number(dias) === 60 ? 60 : 30;

  d.prepare('BEGIN').run();
  try {
    d.prepare(`INSERT INTO suscripciones
      (id, organizacion_id, plan_id, modalidad, ciclo, estado, precio_pactado,
       anuncios_incluidos, dias_ciclo, inicio, fin, proximo_cargo, creada)
      VALUES (?, ?, ?, 'vigencia', NULL, 'activa', ?, ?, ?, ?, ?, NULL, ?)`)
      .run(idSusc, idOrg, idPlan, cobro.subtotal, Math.max(1, Math.trunc(cupo)),
        duracion, t, sumarDias(duracion), t);

    anotarPago(d, { idOrg, idSusc, cobro, t });
    encenderPerfilSiProcede(d, idOrg, plan, t);
    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  return suscripcion(idSusc, idOrg);
}

/* ── Membresía de las cuentas internas ──────────────────────
   Las cuentas del equipo no compran capacidad. Se les da una única
   membresía Premium sin límite y sin fecha de fin, creada la primera
   vez que publican.

   Es una membresía de verdad y no un caso especial repartido por el
   código: así el panel, el asistente y el cambio de plan funcionan
   igual para ellas que para cualquiera, sin condicionales sueltos. */
function membresiaInterna(idOrg) {
  const d = abrir();
  const ya = d.prepare(`SELECT id FROM suscripciones
     WHERE organizacion_id = ? AND estado = 'activa' AND precio_pactado = 0
       AND anuncios_incluidos IS NULL AND fin IS NULL
     ORDER BY creada LIMIT 1`).get(idOrg);
  if (ya) return suscripcion(ya.id, idOrg);

  const plan = planPorId('premium') || planPorId('destacado');
  const idSusc = id();
  const t = ahora();

  d.prepare(`INSERT INTO suscripciones
    (id, organizacion_id, plan_id, modalidad, ciclo, estado, precio_pactado,
     anuncios_incluidos, dias_ciclo, inicio, fin, proximo_cargo, creada)
    VALUES (?, ?, ?, 'vigencia', NULL, 'activa', 0, NULL, NULL, ?, NULL, NULL, ?)`)
    .run(idSusc, idOrg, plan.id, t, t);

  encenderPerfilSiProcede(d, idOrg, plan, t);
  return suscripcion(idSusc, idOrg);
}

/* ── Ampliar a mitad de ciclo ───────────────────────────────
   Sube el cupo de una membresía viva sin mover su fecha de fin. El
   importe lo calcula precios.js con los días que queden; aquí se
   guarda y se anota el cobro contra la misma suscripción, para que la
   factura del anunciante cuente la historia completa. */
function ampliarCupos({ idSusc, idOrg, cupoNuevo, cobro }) {
  const d = abrir();
  const s = suscripcion(idSusc, idOrg);
  if (!s) throw Object.assign(new Error('Esa membresía no existe'), { codigo: 404 });

  const t = ahora();
  d.prepare('BEGIN').run();
  try {
    d.prepare('UPDATE suscripciones SET anuncios_incluidos = ? WHERE id = ? AND organizacion_id = ?')
      .run(Math.trunc(cupoNuevo), idSusc, idOrg);
    anotarPago(d, { idOrg, idSusc, cobro, t });
    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  return suscripcion(idSusc, idOrg);
}

/* ── Mover un equipo de un cupo a otro ──────────────────────
   Lo que el anunciante entiende como "cambiar este camión a
   Destacado". El anuncio pasa a ocupar un cupo de la otra membresía y
   hereda sus condiciones: hasta cuándo se publica y si sale destacado.

   Esas dos fechas se recalculan aquí y solo aquí. Mantenerlas a mano
   en cada sitio que toca un anuncio es de donde salen los anuncios
   que caducan cuando no debían. */
function moverAnuncioDeSuscripcion({ idAnuncio, idOrg, idSusc }) {
  const d = abrir();
  const s = suscripcion(idSusc, idOrg);
  if (!s) throw Object.assign(new Error('Esa membresía no existe'), { codigo: 404 });

  const t = ahora();
  d.prepare(`UPDATE anuncios
       SET suscripcion_id = ?, vence = ?, destacado_hasta = ?, actualizado = ?
     WHERE id = ? AND organizacion_id = ?`)
    .run(idSusc, s.fin, s.destacado ? (s.fin || sumarDias(15)) : null, t, idAnuncio, idOrg);

  return anuncio(idAnuncio);
}

/* Rehace las fechas de todos los anuncios que sostiene una membresía.
   Se llama al renovar: la suscripción estira su fin y los anuncios
   tienen que estirarse con ella. */
const refrescarAnunciosDe = (idSusc) => {
  const d = abrir();
  const s = d.prepare(`SELECT s.fin, p.destacado FROM suscripciones s
    JOIN planes p ON p.id = s.plan_id WHERE s.id = ?`).get(idSusc);
  if (!s) return 0;
  return d.prepare('UPDATE anuncios SET vence = ?, destacado_hasta = ?, actualizado = ? WHERE suscripcion_id = ?')
    .run(s.fin, s.destacado ? s.fin : null, ahora(), idSusc).changes;
};

/* ── Anuncios ───────────────────────────────────────────── */

function crearAnuncio(datos) {
  const d = abrir();
  const idAnuncio = id();
  const t = ahora();

  d.prepare('BEGIN').run();
  try {
    d.prepare(`INSERT INTO anuncios (
      id, organizacion_id, sucursal_id, usuario_id, suscripcion_id, estado,
      categoria, subcategoria, marca, modelo, anio, condicion, uso_valor, uso_unidad,
      serie, potencia, peso, implementos, descripcion, provincia, municipio,
      precio, moneda, modalidad_precio, precio_minimo, itbis_incluido, permuta,
      financiamiento, video,
      motor_marca, motor_modelo, transmision_marca, transmision_modelo,
      destacado_hasta, publicado, vence, creado)
      VALUES (?, ?, ?, ?, ?, 'activo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(idAnuncio, datos.idOrg, datos.idSucursal || null, datos.idUsuario || null,
        datos.idSuscripcion || null,
        datos.categoria, datos.subcategoria || null, datos.marca, datos.modelo,
        datos.anio, datos.condicion || null, datos.usoValor || null, datos.usoUnidad || 'h',
        datos.serie || null, datos.potencia || null, datos.peso || null,
        datos.implementos || null, datos.descripcion || null,
        datos.provincia || null, datos.municipio || null,
        datos.precio ?? null, datos.moneda || 'DOP', datos.modalidadPrecio || 'fijo',
        datos.precioMinimo || null, datos.itbisIncluido ? 1 : 0, datos.permuta ? 1 : 0,
        datos.financiamiento ? 1 : 0, datos.video || null,
        datos.motorMarca || null, datos.motorModelo || null,
        datos.transmisionMarca || null, datos.transmisionModelo || null,
        datos.destacadoHasta || null, t, datos.vence || null, t);

    /* Cada foto llega como {url, miniatura}, ya subidas a disco por
       /api/fotos. Se admite también una cadena suelta para no romper
       el seed ni ningún script antiguo que pase solo la URL. */
    const foto = d.prepare('INSERT INTO anuncio_fotos (id, anuncio_id, url, miniatura, orden, creada) VALUES (?, ?, ?, ?, ?, ?)');
    (datos.fotos || []).forEach((f, i) => {
      const url = typeof f === 'string' ? f : f.url;
      const mini = typeof f === 'string' ? null : (f.miniatura || null);
      foto.run(id(), idAnuncio, url, mini, i, t);
    });

    /* Los videos llegan ya subidos a disco por /api/videos, igual que
       las fotos: aquí solo se guarda la ruta. El recorte al tope del
       plan se hace en la API, que es quien sabe qué plan se contrató. */
    const vid = d.prepare('INSERT INTO anuncio_videos (id, anuncio_id, url, poster, duracion, orden, creada) VALUES (?, ?, ?, ?, ?, ?, ?)');
    (datos.videos || []).forEach((v, i) => {
      const url = typeof v === 'string' ? v : v.url;
      if (!url) return;
      const poster = typeof v === 'string' ? null : (v.poster || null);
      const duracion = typeof v === 'string' ? null : (Number(v.duracion) || null);
      vid.run(id(), idAnuncio, url, poster, duracion, i, t);
    });

    const tel = d.prepare('INSERT INTO anuncio_contactos (id, anuncio_id, numero, tipo, nota, orden) VALUES (?, ?, ?, ?, ?, ?)');
    (datos.telefonos || []).forEach((c, i) => tel.run(id(), idAnuncio, c.numero, c.tipo || 'ambos', c.nota || null, i));

    // La sucursal se crea al abrir la cuenta, cuando todavía no se
    // sabe dónde opera. El primer anuncio que se publique desde ella
    // completa su ubicación, para que el perfil público no salga con
    // la sucursal sin provincia.
    if (datos.idSucursal && datos.provincia) {
      d.prepare(`UPDATE sucursales SET provincia = ?, municipio = COALESCE(municipio, ?)
                 WHERE id = ? AND provincia IS NULL`)
        .run(datos.provincia, datos.municipio || null, datos.idSucursal);
    }

    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  return idAnuncio;
}

/* Los anuncios guardan ids —`caterpillar`, `exc-mediana`— porque un id
   no cambia cuando se corrige un nombre. Las pantallas necesitan el
   nombre visible, así que se añade aquí, en el único punto por el que
   pasan todas las consultas de anuncios. Hacerlo en cada pantalla
   obligaría a que todas cargaran la taxonomía.

   Se conserva el id en `marca` para que los enlaces de filtro sigan
   funcionando; el nombre viaja aparte. */
function conNombres(a) {
  if (!a) return a;
  a.marca_nombre = taxonomia.nombreMarca(a.marca);
  a.subcategoria_nombre = taxonomia.nombreSubcategoria(a.subcategoria);
  if (a.motor_marca) a.motor_marca_nombre = (taxonomia.MOTORES[a.motor_marca] || {}).nombre || a.motor_marca;
  if (a.transmision_marca) {
    a.transmision_marca_nombre = (taxonomia.TRANSMISIONES[a.transmision_marca] || {}).nombre || a.transmision_marca;
  }
  return a;
}

/* Un anuncio con todo lo que cuelga de él. Se usa igual para la ficha
   pública y para el panel. */
function anuncio(idAnuncio) {
  const d = abrir();
  const a = d.prepare(`
    SELECT a.*, o.nombre AS dealer, o.slug AS dealer_slug, o.tipo AS org_tipo, o.verificada
    FROM anuncios a JOIN organizaciones o ON o.id = a.organizacion_id
    WHERE a.id = ?`).get(idAnuncio);
  if (!a) return null;
  // La ficha muestra la imagen completa; la miniatura solo se usa como
  // reserva mientras carga la grande.
  a.fotos = d.prepare('SELECT url, miniatura FROM anuncio_fotos WHERE anuncio_id = ? ORDER BY orden')
    .all(idAnuncio).map((f) => f.url);
  a.videos = d.prepare('SELECT url, poster, duracion FROM anuncio_videos WHERE anuncio_id = ? ORDER BY orden')
    .all(idAnuncio);
  a.telefonos = d.prepare('SELECT numero, tipo, nota FROM anuncio_contactos WHERE anuncio_id = ? ORDER BY orden').all(idAnuncio);
  return conNombres(a);
}

/* ── Catálogo público ───────────────────────────────────── */

/* Órdenes admitidos. La cláusula va escrita aquí y se elige por clave:
   nunca se interpola texto que venga de la petición, que es como se
   cuela una inyección por el ORDER BY. `destacado` se compara contra
   la hora actual porque un destacado caducado deja de serlo. */
const ORDENES_SQL = {
  destacados:    "(a.destacado_hasta IS NOT NULL AND a.destacado_hasta > :ahora) DESC, a.publicado DESC",
  recientes:     'a.publicado DESC',
  'precio-asc':  'a.precio ASC, a.publicado DESC',
  'precio-desc': 'a.precio DESC, a.publicado DESC',
  'anio-desc':   'a.anio DESC, a.publicado DESC',
  'anio-asc':    'a.anio ASC, a.publicado DESC',
  // Los camiones miden kilómetros y las máquinas horas: mezclarlos en
  // un mismo orden compara unidades distintas, así que los que no
  // llevan horómetro caen al final en los dos sentidos.
  'uso-asc':     "(a.uso_unidad <> 'h') ASC, a.uso_valor ASC, a.publicado DESC",
  'uso-desc':    "(a.uso_unidad <> 'h') ASC, a.uso_valor DESC, a.publicado DESC",
};

const ORDEN_POR_DEFECTO = 'destacados';
const POR_PAGINA = 24;
const POR_PAGINA_MAX = 60;

/* Traduce los filtros a WHERE + parámetros. Se usa dos veces por
   búsqueda —una para contar y otra para traer la página—, así que
   vive aparte en lugar de duplicarse. */
function filtrosCatalogo(f = {}) {
  // `:ahora` se ata siempre, aunque el orden pedido no lo use: SQLite
  // rechaza un parámetro con nombre que la sentencia no menciona, y
  // esta cláusula la comparten la consulta de conteo y la de página.
  // De paso deja fuera cualquier anuncio con fecha futura.
  const donde = ["a.estado = 'activo'", 'a.publicado <= :ahora'];
  const p = {};

  const igual = (columna, clave, valor) => {
    if (!valor) return;
    donde.push(`a.${columna} = :${clave}`);
    p[clave] = String(valor);
  };

  igual('organizacion_id', 'org', f.organizacion);
  igual('categoria', 'categoria', f.categoria);
  igual('subcategoria', 'subcategoria', f.subcategoria);
  igual('marca', 'marca', f.marca);
  igual('provincia', 'provincia', f.provincia);
  igual('condicion', 'condicion', f.condicion);

  const rango = (columna, clave, valor, signo) => {
    const n = Number(valor);
    if (!Number.isFinite(n) || !valor) return;
    donde.push(`a.${columna} ${signo} :${clave}`);
    p[clave] = n;
  };

  rango('precio', 'precioMin', f.precioMin, '>=');
  rango('precio', 'precioMax', f.precioMax, '<=');
  rango('anio', 'anioMin', f.anioMin, '>=');
  rango('anio', 'anioMax', f.anioMax, '<=');

  // El tope de horas solo aplica a lo que se mide en horas: si no,
  // filtrar por "menos de 3.000" escondería todos los camiones.
  if (Number(f.horasMax)) {
    donde.push("(a.uso_unidad <> 'h' OR a.uso_valor <= :horasMax)");
    p.horasMax = Number(f.horasMax);
  }

  if (f.soloDestacados) donde.push('a.destacado_hasta IS NOT NULL AND a.destacado_hasta > :ahora');

  // Búsqueda por texto sobre los campos que el comprador escribe de
  // memoria: marca, modelo, tipo y dónde está. Cada palabra debe
  // aparecer en alguno, así "komatsu santiago" acota de verdad en vez
  // de devolver todo lo que tenga una u otra.
  const palabras = String(f.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  palabras.forEach((palabra, i) => {
    donde.push(`(LOWER(a.marca || ' ' || a.modelo || ' ' || a.categoria || ' ' ||
                 COALESCE(a.subcategoria, '') || ' ' || COALESCE(a.provincia, '') || ' ' ||
                 CAST(a.anio AS TEXT)) LIKE :q${i})`);
    p[`q${i}`] = `%${palabra}%`;
  });

  return { donde: donde.join(' AND '), parametros: p };
}

/* Catálogo con filtros, orden y paginación resueltos en SQL. La foto
   de portada sale de una subconsulta en vez de traer todas las fotos
   de todos los anuncios.

   Se pagina en el servidor a propósito: con miles de anuncios, mandar
   el catálogo entero al navegador para que filtre allí deja de
   funcionar mucho antes de que el negocio deje de crecer. */
function buscarAnuncios(f = {}) {
  const d = abrir();
  const { donde, parametros } = filtrosCatalogo(f);
  parametros.ahora = ahora();

  const total = d.prepare(`SELECT COUNT(*) AS n FROM anuncios a WHERE ${donde}`)
    .get(parametros).n;

  const porPagina = Math.min(Number(f.porPagina) || POR_PAGINA, POR_PAGINA_MAX);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(1, Number(f.pagina) || 1), paginas);
  const orden = ORDENES_SQL[f.orden] || ORDENES_SQL[ORDEN_POR_DEFECTO];

  const anuncios = d.prepare(`
    SELECT a.id, a.categoria, a.subcategoria, a.marca, a.modelo, a.anio, a.condicion,
           a.uso_valor, a.uso_unidad, a.precio, a.moneda, a.modalidad_precio,
           a.provincia, a.municipio, a.publicado, a.vence, a.destacado_hasta,
           o.nombre AS dealer, o.slug AS dealer_slug, o.tipo AS org_tipo, o.verificada,
           (SELECT COALESCE(f.miniatura, f.url) FROM anuncio_fotos f WHERE f.anuncio_id = a.id ORDER BY f.orden LIMIT 1) AS foto,
           (SELECT COUNT(*) FROM anuncio_fotos f WHERE f.anuncio_id = a.id) AS fotos_total
    FROM anuncios a JOIN organizaciones o ON o.id = a.organizacion_id
    WHERE ${donde}
    ORDER BY ${orden}
    LIMIT :limite OFFSET :salto`)
    .all({ ...parametros, limite: porPagina, salto: (pagina - 1) * porPagina });

  return { anuncios: anuncios.map(conNombres), total, pagina, paginas, porPagina };
}

/* Atajo para quien solo quiere una lista corta (portada, perfil de
   dealer, equipos similares). */
const anunciosPublicos = (f = {}) => buscarAnuncios(f).anuncios;

/* Cifras de la portada y del directorio. Todas salen de la base: si
   no hay nada publicado, dicen cero y la interfaz lo dice también.
   Una sola consulta por bloque, ninguna sobre la tabla de eventos. */
function estadisticas() {
  const d = abrir();
  const t = ahora();

  const totales = d.prepare(`
    SELECT COUNT(*) AS anuncios,
           COUNT(DISTINCT a.organizacion_id) AS anunciantes,
           SUM(CASE WHEN a.destacado_hasta IS NOT NULL AND a.destacado_hasta > ? THEN 1 ELSE 0 END) AS destacados
    FROM anuncios a WHERE a.estado = 'activo'`).get(t);

  const categorias = d.prepare(`
    SELECT categoria, COUNT(*) AS total FROM anuncios
    WHERE estado = 'activo' GROUP BY categoria ORDER BY total DESC`).all();

  // El filtro del catálogo necesita el id para la URL y el nombre para
  // el selector, así que viajan los dos.
  const marcas = d.prepare(`
    SELECT marca, COUNT(*) AS total FROM anuncios
    WHERE estado = 'activo' GROUP BY marca ORDER BY total DESC, marca`)
    .all()
    .map((m) => ({ ...m, marca_nombre: taxonomia.nombreMarca(m.marca) }));

  const provincias = d.prepare(`
    SELECT provincia, COUNT(*) AS total FROM anuncios
    WHERE estado = 'activo' AND provincia IS NOT NULL
    GROUP BY provincia ORDER BY total DESC, provincia`).all();

  // Las mismas dos condiciones que el directorio: si la cifra contara
  // los pendientes, la página anunciaría dealers que nadie encuentra.
  const dealers = d.prepare(`
    SELECT COUNT(*) AS n FROM organizaciones
    WHERE tipo = 'dealer' AND perfil_publico = 1 AND estado_revision = 'aprobada'`).get().n;

  return {
    anuncios: totales.anuncios || 0,
    anunciantes: totales.anunciantes || 0,
    destacados: totales.destacados || 0,
    dealers,
    categorias,
    marcas,
    provincias,
    actualizado: t,
  };
}

/* Los anuncios de una organización con sus métricas acumuladas. Esta
   es la consulta del panel: una sola pasada, con los totales ya
   sumados desde la tabla agregada. */
function anunciosDeOrganizacion(idOrg) {
  return abrir().prepare(`
    SELECT a.id, a.marca, a.modelo, a.anio, a.categoria, a.subcategoria,
           a.estado, a.precio, a.moneda,
           a.modalidad_precio, a.provincia, a.publicado, a.vence, a.suscripcion_id,
           -- El panel avisa cuando un camión no los tiene declarados y
           -- deja rellenarlos ahí mismo.
           a.motor_marca, a.motor_modelo, a.transmision_marca, a.transmision_modelo,
           (SELECT COALESCE(f.miniatura, f.url) FROM anuncio_fotos f WHERE f.anuncio_id = a.id ORDER BY f.orden LIMIT 1) AS foto,
           -- Cuántas fotos tiene, para poder avisar antes de mover el
           -- anuncio a un nivel que admite menos.
           (SELECT COUNT(*) FROM anuncio_fotos f WHERE f.anuncio_id = a.id) AS total_fotos,
           COALESCE(SUM(m.vistas), 0)         AS vistas,
           COALESCE(SUM(m.clics_telefono), 0) AS telefono,
           COALESCE(SUM(m.clics_whatsapp), 0) AS whatsapp,
           COALESCE(SUM(m.favoritos), 0)      AS favoritos
    FROM anuncios a
    LEFT JOIN metricas_diarias m ON m.anuncio_id = a.id
    WHERE a.organizacion_id = ?
    GROUP BY a.id
    ORDER BY CASE a.estado WHEN 'activo' THEN 0 ELSE 1 END, a.publicado DESC`)
    .all(idOrg).map(conNombres);
}

/* Borra un anuncio y todo lo que cuelga de él.

   Borrado de verdad, no un estado más: el anunciante que pulsa
   «Eliminar» espera que desaparezca. Para dejar de vender sin perder
   el historial ya están «vendido» y «retirado», que además conservan
   las métricas.

   Devuelve las rutas de las fotos para que quien llama borre los
   archivos: las filas se van con el ON DELETE CASCADE, pero el disco
   no se limpia solo. */
function borrarAnuncio(idAnuncio, idOrg) {
  const d = abrir();
  const suyo = d.prepare('SELECT id FROM anuncios WHERE id = ? AND organizacion_id = ?')
    .get(idAnuncio, idOrg);
  if (!suyo) return null;

  const fotos = d.prepare('SELECT url, miniatura FROM anuncio_fotos WHERE anuncio_id = ?')
    .all(idAnuncio);
  const videos = d.prepare('SELECT url, poster FROM anuncio_videos WHERE anuncio_id = ?')
    .all(idAnuncio);

  d.prepare('BEGIN').run();
  try {
    for (const t of ['anuncio_fotos', 'anuncio_videos', 'anuncio_contactos', 'eventos', 'metricas_diarias']) {
      try { d.prepare(`DELETE FROM ${t} WHERE anuncio_id = ?`).run(idAnuncio); } catch (_) { /* tabla sin esa columna */ }
    }
    d.prepare('DELETE FROM anuncios WHERE id = ? AND organizacion_id = ?').run(idAnuncio, idOrg);
    d.prepare('COMMIT').run();
  } catch (e) {
    d.prepare('ROLLBACK').run();
    throw e;
  }

  /* Dos listas, porque las fotos y los videos viven en carpetas
     distintas y los borra un módulo distinto. El póster de un video es
     una foto normal, así que va con las fotos.

     Rutas únicas: la miniatura puede ser la misma que la completa. */
  const rutasFotos = new Set();
  fotos.forEach((f) => { if (f.url) rutasFotos.add(f.url); if (f.miniatura) rutasFotos.add(f.miniatura); });
  videos.forEach((v) => { if (v.poster) rutasFotos.add(v.poster); });

  const rutasVideos = videos.map((v) => v.url).filter(Boolean);

  return { fotos: [...rutasFotos], videos: rutasVideos };
}

/* Motor y transmisión de un anuncio ya publicado. La API valida las
   marcas y los modelos contra la taxonomía antes de llamar aquí. */
const guardarTrenMotriz = (idAnuncio, idOrg, t) =>
  abrir().prepare(`UPDATE anuncios
       SET motor_marca = ?, motor_modelo = ?,
           transmision_marca = ?, transmision_modelo = ?, actualizado = ?
     WHERE id = ? AND organizacion_id = ?`)
    .run(t.motorMarca, t.motorModelo, t.transmisionMarca, t.transmisionModelo,
      ahora(), idAnuncio, idOrg);

const cambiarEstadoAnuncio = (idAnuncio, idOrg, estado) =>
  abrir().prepare('UPDATE anuncios SET estado = ?, actualizado = ? WHERE id = ? AND organizacion_id = ?')
    .run(estado, ahora(), idAnuncio, idOrg);

/* Marca como vencidos los anuncios cuya vigencia pasó. Se llama al
   arrancar y en cada consulta del panel: sale barato porque el índice
   parcial sobre `vence` solo contiene los que pueden caducar. */
const caducarAnuncios = () =>
  abrir().prepare(`UPDATE anuncios SET estado = 'vencido', actualizado = ?
                   WHERE estado = 'activo' AND vence IS NOT NULL AND vence < ?`)
    .run(ahora(), ahora());

/* ── Cola de avisos ─────────────────────────────────────── */

/* Anuncios que vencen dentro de `dias` y a los que todavía no se les
   avisó. Devuelve ya el correo y el nombre de quien hay que avisar,
   para que el proceso de tareas no tenga que encadenar consultas.

   Se apoya en ix_anuncios_vence, que es un índice parcial: solo
   contiene los anuncios que pueden caducar. */
const anunciosPorVencer = (dias = 5) =>
  abrir().prepare(`
    SELECT a.id, a.marca, a.modelo, a.anio, a.vence,
           u.correo, u.nombre
    FROM anuncios a
    JOIN organizaciones o ON o.id = a.organizacion_id
    JOIN usuarios u ON u.id = COALESCE(
      a.usuario_id,
      (SELECT usuario_id FROM miembros WHERE organizacion_id = o.id AND rol = 'propietario' LIMIT 1))
    WHERE a.estado = 'activo'
      AND a.vence IS NOT NULL
      AND a.vence > ?
      AND a.vence <= ?
      AND a.aviso_por_vencer IS NULL`)
    .all(ahora(), sumarDias(dias));

/* Anuncios recién vencidos a los que no se avisó del corte. */
const anunciosVencidosSinAvisar = () =>
  abrir().prepare(`
    SELECT a.id, a.marca, a.modelo, a.anio, a.vence,
           u.correo, u.nombre
    FROM anuncios a
    JOIN organizaciones o ON o.id = a.organizacion_id
    JOIN usuarios u ON u.id = COALESCE(
      a.usuario_id,
      (SELECT usuario_id FROM miembros WHERE organizacion_id = o.id AND rol = 'propietario' LIMIT 1))
    WHERE a.estado = 'vencido'
      AND a.aviso_vencido IS NULL`)
    .all();

const marcarAviso = (idAnuncio, cual) =>
  abrir().prepare(`UPDATE anuncios SET ${cual === 'vencido' ? 'aviso_vencido' : 'aviso_por_vencer'} = ?
                   WHERE id = ?`).run(ahora(), idAnuncio);

/* Dueño de un anuncio, para avisarle de un contacto o de una
   publicación. Un anuncio sin usuario asociado cae en el propietario
   de la organización. */
const duenoDeAnuncio = (idAnuncio) =>
  abrir().prepare(`
    SELECT u.correo, u.nombre, a.marca, a.modelo, a.anio, a.vence
    FROM anuncios a
    JOIN organizaciones o ON o.id = a.organizacion_id
    JOIN usuarios u ON u.id = COALESCE(
      a.usuario_id,
      (SELECT usuario_id FROM miembros WHERE organizacion_id = o.id AND rol = 'propietario' LIMIT 1))
    WHERE a.id = ?`).get(idAnuncio);

/* ── Métricas ───────────────────────────────────────────── */

const COLUMNA_EVENTO = {
  vista: 'vistas',
  telefono: 'clics_telefono',
  whatsapp: 'clics_whatsapp',
  correo: 'clics_correo',
  favorito: 'favoritos',
  compartir: 'compartidos',
};

/* Anota el evento crudo y suma en el agregado del día.

   EL AGREGADO CUENTA PERSONAS, NO PULSACIONES: una vez por visitante,
   tipo y día. Antes solo se deduplicaban las vistas, así que un mismo
   visitante que pulsara tres veces WhatsApp dejaba tres contactos
   contra una sola visita, y el panel llegaba a rotular "600 % de las
   visitas". Contra el mismo criterio en los dos lados, la proporción
   vuelve a significar algo: de cada cien personas que vieron la ficha,
   cuántas pidieron el contacto.

   El evento crudo sí se guarda siempre: sirve para auditar y para
   recalcular el agregado si hiciera falta.

/* Devuelve 'invalido', 'contado' o 'repetido'. Son tres cosas
   distintas y quien llama necesita separarlas: solo la primera es
   un error del cliente, y solo la segunda justifica avisar al
   dueño. Con un booleano, arreglar el repetido convertía una visita
   normal en un 400. */
function anotarEvento(idAnuncio, tipo, visitante) {
  const columna = COLUMNA_EVENTO[tipo];
  if (!columna) return 'invalido';
  const d = abrir();
  if (!d.prepare('SELECT 1 FROM anuncios WHERE id = ?').get(idAnuncio)) return 'invalido';

  const dia = hoy();

  const repetido = visitante && d.prepare(
    'SELECT 1 FROM eventos WHERE anuncio_id = ? AND tipo = ? AND dia = ? AND visitante = ?')
    .get(idAnuncio, tipo, dia, visitante);

  d.prepare('INSERT INTO eventos (anuncio_id, tipo, dia, visitante, creado) VALUES (?, ?, ?, ?, ?)')
    .run(idAnuncio, tipo, dia, visitante || null, ahora());

  /* El evento crudo queda guardado arriba pase lo que pase: es lo
     que permite detectar el fraude de clics. Lo que no se repite es
     ni el agregado ni el aviso al dueño. */
  if (repetido) return 'repetido';

  d.prepare(`INSERT INTO metricas_diarias (anuncio_id, dia, ${columna})
             VALUES (?, ?, 1)
             ON CONFLICT (anuncio_id, dia) DO UPDATE SET ${columna} = ${columna} + 1`)
    .run(idAnuncio, dia);

  return 'contado';
}

/* Totales de la organización y serie de los últimos días, para el
   panel. Dos consultas agregadas, ninguna sobre eventos crudos. */
function resumenOrganizacion(idOrg, dias = 30) {
  const d = abrir();
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeDia = desde.toISOString().slice(0, 10);

  const totales = d.prepare(`
    SELECT COALESCE(SUM(m.vistas), 0) AS vistas,
           COALESCE(SUM(m.clics_telefono), 0) AS telefono,
           COALESCE(SUM(m.clics_whatsapp), 0) AS whatsapp,
           COALESCE(SUM(m.favoritos), 0) AS favoritos
    FROM metricas_diarias m
    JOIN anuncios a ON a.id = m.anuncio_id
    WHERE a.organizacion_id = ? AND m.dia >= ?`).get(idOrg, desdeDia);

  const serie = d.prepare(`
    SELECT m.dia, SUM(m.vistas) AS vistas, SUM(m.clics_telefono + m.clics_whatsapp) AS contactos
    FROM metricas_diarias m
    JOIN anuncios a ON a.id = m.anuncio_id
    WHERE a.organizacion_id = ? AND m.dia >= ?
    GROUP BY m.dia ORDER BY m.dia`).all(idOrg, desdeDia);

  const porEstado = d.prepare(`
    SELECT estado, COUNT(*) AS n FROM anuncios WHERE organizacion_id = ? GROUP BY estado`).all(idOrg);

  return { totales, serie, porEstado };
}

/* Cambio de contraseña. Rehace el hash con sal nueva; la anterior no
   se conserva en ningún sitio. */
const cambiarClave = (idUsuario, clave) => {
  const { hash, sal } = cifrarClave(clave);
  abrir().prepare('UPDATE usuarios SET clave_hash = ?, clave_sal = ? WHERE id = ?')
    .run(hash, sal, idUsuario);
};

/* ── Aceptaciones legales ───────────────────────────────── */

/* Anota que alguien aceptó un documento en su versión vigente.
 *
 * `INSERT OR IGNORE`: aceptar dos veces la misma versión —recargar la
 * página, pulsar dos veces— no debe crear dos filas ni reventar por la
 * clave única. La primera vez es la que cuenta, y es la que queda. */
function registrarAceptacion({ usuarioId, documento, version, ip, userAgent }) {
  abrir().prepare(`
    INSERT OR IGNORE INTO aceptaciones_legales
      (id, usuario_id, documento, version, aceptado_en, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id(), usuarioId, documento, version, ahora(),
      ip || null, (userAgent || '').slice(0, 300) || null);
}

/* Lo último que aceptó alguien de cada documento, como
   { documento: version }. Es lo que compara assets/legales.js para
   saber qué le falta. */
function aceptacionesDe(usuarioId) {
  const filas = abrir().prepare(`
    SELECT documento, version, MAX(aceptado_en) AS aceptado_en
      FROM aceptaciones_legales
     WHERE usuario_id = ?
     GROUP BY documento`).all(usuarioId);

  const mapa = {};
  for (const f of filas) mapa[f.documento] = f.version;
  return mapa;
}

/* El historial completo, para la vista de administración. Por usuario
   y por fecha: quien la consulta busca «quién aceptó esto» o «qué
   aceptó esta persona», y las dos preguntas se leen de esta lista. */
function historialAceptaciones({ documento, limite = 200 } = {}) {
  const d = abrir();
  const donde = documento ? 'WHERE a.documento = ?' : '';
  const args = documento ? [documento, limite] : [limite];
  return d.prepare(`
    SELECT a.documento, a.version, a.aceptado_en, a.ip,
           u.correo, u.nombre, o.nombre AS empresa
      FROM aceptaciones_legales a
      JOIN usuarios u ON u.id = a.usuario_id
      LEFT JOIN miembros m ON m.usuario_id = u.id
      LEFT JOIN organizaciones o ON o.id = m.organizacion_id
      ${donde}
     ORDER BY a.aceptado_en DESC
     LIMIT ?`).all(...args);
}

/* ── Comprobantes ───────────────────────────────────────── */

/* Toma el siguiente NCF de una secuencia y lo marca como consumido.
 *
 * VA EN UNA TRANSACCIÓN, y no es paranoia: dos pagos que entren en el
 * mismo instante leerían el mismo `siguiente` y acabarían con el MISMO
 * NCF. Dos comprobantes con el mismo número autorizado no es un
 * duplicado cualquiera: es un problema con la DGII.
 *
 * El UPDATE lleva la condición `siguiente = ?` con el valor que se
 * acaba de leer. Si otro proceso se adelantó, `changes` es 0 y se
 * reintenta. Es la forma de hacerlo sin bloquear la base entera.
 *
 * Devuelve null si la secuencia se agotó o no existe. Quien llama
 * decide: para una factura fiscal, eso significa que no se puede
 * emitir; para un recibo no fiscal, ni se pregunta. */
function tomarNcf(tipo) {
  const d = abrir();

  for (let intento = 0; intento < 5; intento++) {
    const s = d.prepare('SELECT * FROM secuencias_ncf WHERE tipo = ? AND activa = 1').get(tipo);
    if (!s) return null;
    if (s.siguiente > s.hasta) return null;          // agotada

    const r = d.prepare(`
      UPDATE secuencias_ncf SET siguiente = siguiente + 1
       WHERE id = ? AND siguiente = ?`).run(s.id, s.siguiente);

    if (r.changes === 1) {
      return {
        ncf: `${s.prefijo}${String(s.siguiente).padStart(8, '0')}`,
        /* La fecha de vencimiento viaja con el número: el comprobante
           la imprime, y buscarla después obligaría a suponer que la
           secuencia sigue cargada igual que el día que se emitió. */
        vence: s.vence || null,
        quedan: s.hasta - s.siguiente,
      };
    }
  }
  return null;
}

/* Cuántos comprobantes quedan en cada secuencia. Lo usa el aviso de
   agotamiento y la pantalla de administración. */
const secuenciasNcf = () => abrir().prepare(`
  SELECT *, (hasta - siguiente + 1) AS quedan
    FROM secuencias_ncf ORDER BY usa_sitio DESC, tipo`).all();

/* Cargar un rango autorizado por la DGII.
 *
 * Es el gesto que pone el sistema a emitir: en cuanto exista una
 * secuencia B02 activa y marcada `usa_sitio`, los clientes sin RNC
 * dejan de recibir el recibo no fiscal y empiezan a recibir su factura
 * de consumo, sin tocar una línea de código.
 *
 * Un rango ya cargado NO se pisa: `siguiente` es cuántos comprobantes
 * llevan emitidos, y reescribirlo repetiría números ya usados. Lo que
 * sí se puede corregir es lo que no afecta a la numeración —el
 * vencimiento, si está activa, si la usa el sitio—. */
function cargarSecuencia({ tipo, nombre, desde, hasta, vence = null, activa = true, usaSitio = false }) {
  const d = abrir();
  const t = String(tipo || '').trim().toUpperCase();
  const a = Math.trunc(Number(desde));
  const b = Math.trunc(Number(hasta));

  if (!/^B\d{2}$/.test(t)) throw Object.assign(new Error('El tipo es B seguido de dos dígitos'), { codigo: 400 });
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < a) {
    throw Object.assign(new Error('El rango va de un número menor a uno mayor'), { codigo: 400 });
  }
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) {
    throw Object.assign(new Error('El vencimiento va como AAAA-MM-DD'), { codigo: 400 });
  }

  const yaEsta = d.prepare('SELECT * FROM secuencias_ncf WHERE tipo = ? AND desde = ?').get(t, a);
  if (yaEsta) {
    d.prepare(`UPDATE secuencias_ncf SET vence = ?, activa = ?, usa_sitio = ?, nombre = ?
                WHERE id = ?`)
      .run(vence, activa ? 1 : 0, usaSitio ? 1 : 0, nombre || yaEsta.nombre, yaEsta.id);
    return { ...d.prepare('SELECT * FROM secuencias_ncf WHERE id = ?').get(yaEsta.id), nueva: false };
  }

  /* Dos rangos activos del mismo tipo harían que `tomarNcf` eligiera
     uno cualquiera. El anterior se desactiva al cargar el nuevo. */
  if (activa) d.prepare('UPDATE secuencias_ncf SET activa = 0 WHERE tipo = ? AND activa = 1').run(t);

  const idSec = id();
  d.prepare(`INSERT INTO secuencias_ncf
     (id, tipo, nombre, prefijo, desde, hasta, siguiente, vence, activa, usa_sitio, creada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(idSec, t, nombre || t, t, a, b, a, vence, activa ? 1 : 0, usaSitio ? 1 : 0, ahora());

  return { ...d.prepare('SELECT * FROM secuencias_ncf WHERE id = ?').get(idSec), nueva: true };
}

/* El siguiente número interno, correlativo y sin huecos.
 *
 * Se cuenta sobre la propia tabla y no con un contador aparte: un
 * contador puede desincronizarse de las filas que dice contar, y
 * entonces hay que decidir cuál de los dos tiene razón. Aquí la
 * respuesta siempre es la tabla.
 *
 * Por año, que es como se archivan: MM-2026-000001 vuelve a empezar en
 * MM-2027-000001. */
function siguienteNumero(fecha) {
  const anio = String(fecha || ahora()).slice(0, 4);
  const ultimo = abrir().prepare(`
    SELECT numero FROM facturas WHERE numero LIKE ?
     ORDER BY numero DESC LIMIT 1`).get(`MM-${anio}-%`);

  const n = ultimo ? Number(String(ultimo.numero).split('-')[2]) + 1 : 1;
  return `MM-${anio}-${String(n).padStart(6, '0')}`;
}

/* Guarda un comprobante. El número y el NCF se toman aquí dentro, en la
   misma transacción que la inserción: pedirlos fuera y luego insertar
   deja una ventana en la que otro pago se cuela y toma el mismo. */
function crearFactura(datos) {
  const d = abrir();
  const hecho = d.prepare(`
    INSERT INTO facturas
      (id, pago_id, organizacion_id, numero, tipo, ncf, ncf_vencimiento, ncf_modificado,
       razon_social, rnc, direccion, telefono, correo,
       concepto, subtotal, descuento, itbis_tasa, itbis, total, moneda,
       condicion_pago, metodo_pago, referencia_pago, periodo_servicio, notas,
       fecha, ruta_pdf, anula_a, creada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const idFactura = id();
  const fecha = datos.fecha || ahora();

  /* El número se calcula y se inserta dentro de la misma transacción.
     Si dos pagos coinciden, el segundo choca con el UNIQUE de `numero`
     —no se pierde ni se duplica— y se reintenta con el siguiente. */
  for (let intento = 0; intento < 5; intento++) {
    const numero = siguienteNumero(fecha);
    try {
      hecho.run(
        idFactura, datos.pagoId || null, datos.organizacionId || null, numero,
        datos.tipo, datos.ncf || null, datos.ncfVencimiento || null, datos.ncfModificado || null,
        datos.razonSocial || null, datos.rnc || null, datos.direccion || null,
        datos.telefono || null, datos.correo || null,
        datos.concepto || null,
        Math.round(datos.subtotal), Math.round(datos.descuento || 0),
        datos.itbisTasa != null ? Number(datos.itbisTasa) : 0.18,
        Math.round(datos.itbis), Math.round(datos.total),
        datos.moneda || 'DOP',
        datos.condicionPago || null, datos.metodoPago || null,
        datos.referenciaPago || null, datos.periodoServicio || null, datos.notas || null,
        fecha, datos.rutaPdf || null, datos.anulaA || null, ahora(),
      );
      return { id: idFactura, numero };
    } catch (e) {
      if (!/UNIQUE/i.test(e.message) || !/numero/i.test(e.message)) throw e;
    }
  }
  throw new Error('no se pudo asignar un número de comprobante');
}

/* El pago por su referencia.
 *
 * Se busca así y no como «el último pago de esta organización»: son
 * equivalentes hoy, con un solo proceso y la llamada inmediatamente
 * después, pero «el último» deja de ser cierto en cuanto haya dos
 * peticiones a la vez, y el error sería emitirle a un cliente el
 * comprobante del pago de otro. La referencia es única por cobro. */
const pagoPorReferencia = (ref) => abrir().prepare(
  'SELECT * FROM pagos WHERE referencia = ? ORDER BY creado DESC LIMIT 1').get(ref);

const pagoPorId = (idPago) => abrir().prepare('SELECT * FROM pagos WHERE id = ?').get(idPago);

/* Quién recibe el comprobante de una organización: su propietario. */
const propietarioDe = (idOrg) => abrir().prepare(`
  SELECT u.id, u.correo, u.nombre
    FROM miembros m JOIN usuarios u ON u.id = m.usuario_id
   WHERE m.organizacion_id = ? AND m.rol = 'propietario'
   ORDER BY m.creado LIMIT 1`).get(idOrg);

/* Un pago devuelto. No se borra: cambia de estado, y la nota de crédito
   queda enlazada al comprobante original. */
const marcarPagoDevuelto = (idPago) => abrir().prepare(
  "UPDATE pagos SET estado = 'devuelto' WHERE id = ?").run(idPago);

const facturaPorId = (idFactura) => abrir().prepare('SELECT * FROM facturas WHERE id = ?').get(idFactura);
const facturaDePago = (idPago) => abrir().prepare(
  "SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'").get(idPago);

const facturasDe = (idOrg) => abrir().prepare(
  'SELECT * FROM facturas WHERE organizacion_id = ? ORDER BY fecha DESC').all(idOrg);

/* Para administración: por mes y, si se pide, por estado de envío. */
function facturas({ mes, pendientes = false, limite = 500 } = {}) {
  const donde = [];
  const args = [];
  if (mes) { donde.push("substr(f.fecha, 1, 7) = ?"); args.push(mes); }
  if (pendientes) donde.push('(f.enviada_cliente IS NULL OR f.enviada_interna IS NULL)');

  args.push(limite);
  return abrir().prepare(`
    SELECT f.*, o.nombre AS empresa, u.correo AS correo_cliente
      FROM facturas f
      LEFT JOIN organizaciones o ON o.id = f.organizacion_id
      LEFT JOIN miembros m ON m.organizacion_id = o.id AND m.rol = 'propietario'
      LEFT JOIN usuarios u ON u.id = m.usuario_id
     ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''}
     ORDER BY f.fecha DESC
     LIMIT ?`).all(...args);
}

const marcarEnviada = (idFactura, cual) => abrir().prepare(
  `UPDATE facturas SET ${cual === 'interna' ? 'enviada_interna' : 'enviada_cliente'} = ? WHERE id = ?`)
  .run(ahora(), idFactura);

const sumarIntentoEnvio = (idFactura) => abrir().prepare(
  'UPDATE facturas SET intentos_envio = intentos_envio + 1 WHERE id = ?').run(idFactura);

const anotarPdf = (idFactura, ruta) => abrir().prepare(
  'UPDATE facturas SET ruta_pdf = ? WHERE id = ?').run(ruta, idFactura);

const marcarAnulada = (idFactura, idNota) => abrir().prepare(
  'UPDATE facturas SET anulado_por = ? WHERE id = ?').run(idNota, idFactura);

module.exports = {
  registrarAceptacion, aceptacionesDe, historialAceptaciones,
  tomarNcf, secuenciasNcf, cargarSecuencia, siguienteNumero, crearFactura, facturaPorId, facturaDePago,
  pagoPorReferencia, pagoPorId, propietarioDe, marcarPagoDevuelto,
  facturasDe, facturas, marcarEnviada, sumarIntentoEnvio, anotarPdf, marcarAnulada,
  abrir, id, ahora, hoy, sumarDias, sumarMeses, aSlug, huella, purgar,
  cifrarClave, claveCorrecta, cambiarClave,
  usuarioPorCorreo, usuarioPorId, crearCuenta, organizacionDe, sucursalPrincipal,
  abrirSesion, sesion, cerrarSesion, cerrarTodoDe,
  crearCodigo, verificarCodigo, marcarCorreoVerificado,
  recordarDispositivo, dispositivoDeConfianza,
  permitir, limpiarIntentos,
  registrarDealer, dealersPublicos, dealerPorSlug,
  solicitudes, solicitudCompleta, resolverSolicitud, contarPendientes, marcarAdmin,
  flotaPublica, flotaCompleta, flotaPorId, crearFlota, actualizarFlota, borrarFlota,
  AJUSTES, ajustes, guardarAjuste, fotosPorCategoria, heroePortada,
  crearSolicitudServicio, solicitudServicio, solicitudesServicio, marcarSolicitudServicio,
  fotosDeFlota, guardarFotosDeFlota,
  publicidadVigente, publicidadCompleta, publicidadPorId,
  crearPublicidad, actualizarPublicidad, borrarPublicidad, sumarImpresiones, sumarClic,
  sucursalesDe, sucursal, crearSucursal, actualizarSucursal, desactivarSucursal, marcarPrincipal,
  planes, planPorId, suscripcionActiva, suscripcionesDe, suscripcion,
  suscripcionConHueco, comprarCupos, ampliarCupos, membresiaInterna,
  moverAnuncioDeSuscripcion, refrescarAnunciosDe,
  crearAnuncio, anuncio, anunciosPublicos, buscarAnuncios, estadisticas, anunciosDeOrganizacion,
  cambiarEstadoAnuncio, guardarTrenMotriz, borrarAnuncio, caducarAnuncios,
  anunciosPorVencer, anunciosVencidosSinAvisar, marcarAviso, duenoDeAnuncio,
  anotarEvento, resumenOrganizacion,
};
