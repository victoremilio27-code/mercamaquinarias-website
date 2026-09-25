-- ═══════════════════════════════════════════════════════════
-- MercaMaquinarias · Esquema de la base de datos
--
-- Escrito para SQLite (node:sqlite, sin dependencias) pero sin usar
-- nada que no exista en PostgreSQL: los tipos son los mínimos comunes
-- y las claves son TEXT para poder pasar a UUID sin tocar nada.
--
-- El esquema está pensado para no exigir migraciones grandes cuando
-- el negocio crezca. Cuatro decisiones cargan con ese peso:
--
--  1. LA ORGANIZACIÓN ES EL INQUILINO, NO EL USUARIO. Todo lo que se
--     posee (anuncios, suscripciones, pagos, sucursales) cuelga de
--     `organizaciones`, nunca de `usuarios`. Un particular también
--     tiene su organización, de tipo 'particular', con un solo
--     miembro. El día que ese particular se convierta en dealer con
--     seis empleados no hay que mover ni una fila de sitio: se cambia
--     el tipo y se añaden miembros.
--
--  2. LA RELACIÓN USUARIO-ORGANIZACIÓN ES UNA TABLA APARTE, CON ROL.
--     Desde el primer día admite varios administradores por empresa y
--     que una misma persona opere dos organizaciones (un mecánico que
--     vende lo suyo y además administra el dealer donde trabaja).
--
--  3. LAS SUCURSALES EXISTEN DESDE EL PRINCIPIO. Cada anuncio apunta a
--     una. Un dealer de una sola oficina tiene una sucursal principal
--     creada automáticamente y no se entera de que existe; cuando abra
--     en Santiago, el modelo ya lo soporta.
--
--  4. LAS MÉTRICAS SE AGREGAN POR DÍA AL ESCRIBIRSE. `eventos` guarda
--     el detalle crudo con retención corta y `metricas_diarias` el
--     acumulado permanente. Con miles de anuncios, el panel lee filas
--     agregadas y nunca hace COUNT sobre millones de eventos.
--
-- Dinero: enteros en pesos dominicanos. En este mercado no se cotiza
-- maquinaria con centavos y evita por completo el punto flotante.
-- ═══════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Identidad ──────────────────────────────────────────────

-- Persona que inicia sesión. No posee nada por sí misma: opera sobre
-- organizaciones a través de `miembros`.
CREATE TABLE IF NOT EXISTS usuarios (
  id             TEXT PRIMARY KEY,
  -- Se guarda siempre en minúsculas desde el código, en vez de usar
  -- una colación propia de SQLite que luego no existiría igual en
  -- PostgreSQL.
  correo         TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL,
  telefono       TEXT,
  clave_hash     TEXT NOT NULL,
  clave_sal      TEXT NOT NULL,
  correo_verificado INTEGER NOT NULL DEFAULT 0,
  -- Personal de MercaMaquinarias que revisa las solicitudes de dealer. No se
  -- otorga desde ninguna pantalla: se pone a mano con tools/admin.js,
  -- de modo que nadie pueda concedérselo registrándose.
  es_admin       INTEGER NOT NULL DEFAULT 0,
  creado         TEXT NOT NULL,
  ultimo_acceso  TEXT
);

-- Quien vende. `tipo` distingue al particular del dealer establecido;
-- es lo único que separa una cuenta normal de una con perfil público.
--
-- `rnc` es único cuando existe: dos organizaciones no pueden reclamar
-- el mismo registro nacional. En SQLite y en PostgreSQL, UNIQUE deja
-- pasar varios NULL, que es justo lo que hace falta para que los
-- particulares no choquen entre sí.
--
-- El RNC es dato reservado: identifica fiscalmente a la empresa y solo
-- se usa para comprobar que existe. No sale en ninguna respuesta
-- pública; las consultas del directorio y del perfil no lo seleccionan
-- siquiera, para que no pueda escaparse por un `SELECT *`.
CREATE TABLE IF NOT EXISTS organizaciones (
  id             TEXT PRIMARY KEY,
  tipo           TEXT NOT NULL CHECK (tipo IN ('particular', 'dealer')),
  nombre         TEXT NOT NULL,
  rnc            TEXT UNIQUE,
  slug           TEXT UNIQUE,               -- URL del perfil público
  correo         TEXT,
  telefono       TEXT,
  web            TEXT,
  descripcion    TEXT,
  -- La página propia del dealer. `correo` y `telefono` de arriba son
  -- los de la CUENTA: los de abajo son los que el dealer decide
  -- enseñar. Separarlos es lo que evita publicar en el directorio la
  -- dirección con la que alguien inicia sesión.
  logo             TEXT,
  banner           TEXT,
  lema             TEXT,
  correo_publico   TEXT,
  telefono_publico TEXT,
  -- El plan da DERECHO a tener página; esto dice si está terminada.
  -- Sin la separación, pagar publicaría al instante una página vacía.
  estado_pagina  TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (estado_pagina IN ('borrador', 'publicada')),
  publicada_en   TEXT,
  verificada     INTEGER NOT NULL DEFAULT 0, -- sello, se otorga a mano
  perfil_publico INTEGER NOT NULL DEFAULT 0, -- el plan lo habilita
  -- Segunda condición para salir publicado, independiente del plan.
  -- Un particular no pasa por revisión y se queda en 'no_aplica'.
  -- Son dos llaves separadas a propósito: así da igual el orden en que
  -- ocurran el pago y la aprobación, y el directorio exige las dos.
  estado_revision TEXT NOT NULL DEFAULT 'no_aplica'
                  CHECK (estado_revision IN ('no_aplica', 'pendiente', 'aprobada', 'rechazada')),
  -- Publica sin pagar. Son las cuentas internas —las de los socios—,
  -- no una promoción: se concede a mano con tools/admin.js y no hay
  -- pantalla ni ruta de la API que la otorgue. Va en la organización
  -- porque quien contrata y factura es la empresa, no la persona.
  exenta_pago    INTEGER NOT NULL DEFAULT 0,
  creada         TEXT NOT NULL,
  actualizada    TEXT
);

CREATE INDEX IF NOT EXISTS ix_org_tipo ON organizaciones (tipo);
CREATE INDEX IF NOT EXISTS ix_org_revision ON organizaciones (estado_revision);

-- Rol de cada persona dentro de cada organización.
--   propietario    — factura, contrata y puede eliminar la organización
--   administrador  — publica, edita y ve métricas de toda la empresa
--   vendedor       — publica y edita solo sus propios anuncios
CREATE TABLE IF NOT EXISTS miembros (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  usuario_id      TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol             TEXT NOT NULL CHECK (rol IN ('propietario', 'administrador', 'vendedor')),
  sucursal_id     TEXT,                      -- si se limita a una sucursal
  creado          TEXT NOT NULL,
  UNIQUE (organizacion_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS ix_miembros_usuario ON miembros (usuario_id);

-- Puntos físicos. Cada organización tiene al menos una, marcada
-- `principal`, creada junto con ella.
CREATE TABLE IF NOT EXISTS sucursales (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  provincia       TEXT,
  municipio       TEXT,
  direccion       TEXT,
  telefono        TEXT,
  -- Añadidas por migración y traídas aquí después: una base nueva y una
  -- migrada tienen que quedar idénticas. Faltaban, y quien leyera este
  -- archivo como la verdad se encontraba dos columnas de menos.
  whatsapp        TEXT,
  horario         TEXT,
  principal       INTEGER NOT NULL DEFAULT 0,
  activa          INTEGER NOT NULL DEFAULT 1,
  creada          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_sucursales_org ON sucursales (organizacion_id);

-- ── La página propia del dealer ────────────────────────────

-- Redes y enlaces externos que el dealer quiere enseñar.
CREATE TABLE IF NOT EXISTS organizacion_enlaces (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN (
                    'instagram', 'facebook', 'youtube', 'tiktok',
                    'linkedin', 'web', 'whatsapp')),
  valor           TEXT NOT NULL,
  orden           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_org_enlaces ON organizacion_enlaces (organizacion_id, orden);

-- Fotos de la empresa: el taller, la nave, el equipo de trabajo. No
-- son anuncios; son lo que da confianza a quien no conoce al dealer.
CREATE TABLE IF NOT EXISTS organizacion_galeria (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  alt             TEXT,
  orden           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_org_galeria ON organizacion_galeria (organizacion_id, orden);

-- Los bloques de la página, en el orden en que el dealer los puso.
--
-- Una tabla y no veinte columnas más: lo que se pidió es que arme su
-- página añadiendo, quitando y reordenando. Con columnas fijas, cada
-- bloque nuevo sería una migración; así es una opción más en un
-- desplegable. `cuerpo` va como JSON porque un bloque de texto y uno
-- de equipos destacados no comparten campos.
CREATE TABLE IF NOT EXISTS organizacion_secciones (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN (
                    'texto', 'galeria', 'marcas', 'servicios',
                    'destacados', 'sucursales', 'inventario')),
  titulo          TEXT,
  cuerpo          TEXT,
  orden           INTEGER NOT NULL DEFAULT 0,
  visible         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS ix_org_secciones ON organizacion_secciones (organizacion_id, orden);

-- ── Flota propia ───────────────────────────────────────────

-- Los equipos que MercaMaquinarias alquila y las camas con las que
-- transporta. No son anuncios de terceros: son los servicios propios
-- de la plataforma.
--
-- Estaban escritos a mano en assets/data.js, así que quitar una
-- excavadora del alquiler exigía editar código y volver a desplegar.
-- Ahora los administra el equipo desde /admin.html.
--
-- UNA SOLA TABLA con `servicio` en vez de dos: comparten forma
-- —nombre, detalle, icono, orden, activo— y todo lo que se hace con
-- una se hace con la otra. Dos tablas serían dos veces el mismo CRUD.
-- `capacidad` solo la usa el transporte y `unidad` solo el alquiler;
-- cada una queda NULL donde no aplica.
CREATE TABLE IF NOT EXISTS flota (
  id         TEXT PRIMARY KEY,
  servicio   TEXT NOT NULL CHECK (servicio IN ('alquiler', 'transporte')),
  nombre     TEXT NOT NULL,
  detalle    TEXT,
  icono      TEXT,
  unidad     TEXT,                      -- alquiler: día, semana, viaje
  capacidad  INTEGER,                   -- transporte: toneladas
  foto       TEXT,
  -- Se desactiva en vez de borrarse: una cama retirada del servicio
  -- puede volver, y borrarla perdería el histórico de cotizaciones
  -- que la mencionan.
  activo     INTEGER NOT NULL DEFAULT 1,
  orden      INTEGER NOT NULL DEFAULT 0,
  creado     TEXT NOT NULL,
  actualizado TEXT
);

CREATE INDEX IF NOT EXISTS ix_flota_servicio ON flota (servicio, activo, orden);

-- Fotografías de cada tipo de equipo.
--
-- VARIAS Y DE MARCAS DISTINTAS a propósito. No se alquila «la CAT 320»:
-- se alquila «una excavadora de 20 toneladas», y se entrega la que esté
-- disponible ese día. Enseñar una sola máquina promete un modelo
-- concreto que nadie se comprometió a dar.
CREATE TABLE IF NOT EXISTS flota_fotos (
  id       TEXT PRIMARY KEY,
  flota_id TEXT NOT NULL REFERENCES flota(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  alt      TEXT,
  orden    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_flota_fotos ON flota_fotos (flota_id, orden);

-- ── Solicitudes de servicio ────────────────────────────────
--
-- Alquiler, transporte e importación. Antes estos formularios no
-- mandaban nada: pintaban un resumen en pantalla y le pedían al cliente
-- que lo copiara a WhatsApp. Quien no lo copiaba se perdía, y no
-- quedaba rastro de cuántos se perdieron.
--
-- Los datos de contacto son obligatorios: sin ellos la solicitud no
-- sirve de nada, porque no hay a quién responder.
CREATE TABLE IF NOT EXISTS solicitudes_servicio (
  id         TEXT PRIMARY KEY,
  servicio   TEXT NOT NULL CHECK (servicio IN ('alquiler', 'transporte', 'importacion', 'contacto')),
  referencia TEXT NOT NULL UNIQUE,        -- la que se le da al cliente

  nombre     TEXT NOT NULL,
  telefono   TEXT NOT NULL,
  correo     TEXT,
  empresa    TEXT,

  -- El detalle cambia según el servicio, así que va en JSON en vez de
  -- veinte columnas nulas. No se consulta por dentro: se lee entero.
  detalle    TEXT NOT NULL,

  estado     TEXT NOT NULL DEFAULT 'nueva'
             CHECK (estado IN ('nueva', 'atendida', 'cerrada')),
  nota       TEXT,
  creada     TEXT NOT NULL,
  atendida   TEXT
);

CREATE INDEX IF NOT EXISTS ix_solicitudes_servicio ON solicitudes_servicio (servicio, estado, creada);

-- ── Ajustes del sitio ──────────────────────────────────────

-- Pares clave/valor que el equipo cambia desde /admin.html sin tocar
-- código ni reiniciar. Deliberadamente pocos y concretos: esto NO es
-- un baúl de configuración. Cada clave que entra aquí tiene una
-- pantalla que la edita y un motivo escrito.
--
--   heroe_imagen  ruta en /fotos de la fotografía de la portada
--   heroe_alt     qué se ve en ella, para quien no puede verla
CREATE TABLE IF NOT EXISTS ajustes (
  clave       TEXT PRIMARY KEY,
  valor       TEXT,
  actualizado TEXT NOT NULL
);

-- ── Publicidad ─────────────────────────────────────────────

-- Espacios publicitarios de la portada. Se administran desde
-- /admin.html: alta, imagen, enlace, fechas y encendido.
--
-- `espacio` es una posición fija de la maqueta, no una medida libre:
-- así el diseño no se rompe porque alguien suba una imagen de
-- proporción rara. Cada espacio tiene su formato documentado abajo.
--
-- Las fechas mandan sobre `activo`: una campaña con fecha de fin deja
-- de mostrarse sola el día que toca, sin que nadie tenga que acordarse
-- de apagarla un domingo.
CREATE TABLE IF NOT EXISTS publicidad (
  id          TEXT PRIMARY KEY,
  -- Los nueve formatos del tarifario. La lista de tools/api.js es la
  -- autoridad; esto es la red de abajo. Cuando se añada uno, hace falta
  -- una migración: SQLite no deja ampliar un CHECK con ALTER TABLE.
  espacio     TEXT NOT NULL CHECK (espacio IN (
                'superior', 'catalogo', 'bloque', 'ficha',
                'lateral-izq', 'lateral-der',
                'movil-superior', 'movil-cuadro', 'movil-lista')),
  nombre      TEXT NOT NULL,             -- para reconocerla en el panel
  anunciante  TEXT,                      -- quién la paga
  imagen      TEXT NOT NULL,             -- ruta en /fotos, subida como el resto
  enlace      TEXT,                      -- a dónde lleva; vacío = no enlaza
  alt         TEXT NOT NULL,             -- lo que lee quien no ve la imagen

  desde       TEXT,                      -- NULL = desde ya
  hasta       TEXT,                      -- NULL = sin fecha de fin
  activo      INTEGER NOT NULL DEFAULT 1,
  orden       INTEGER NOT NULL DEFAULT 0, -- rota entre varias del mismo espacio

  -- Para poder decirle al anunciante qué recibió por su dinero.
  impresiones INTEGER NOT NULL DEFAULT 0,
  clics       INTEGER NOT NULL DEFAULT 0,

  creado      TEXT NOT NULL,
  actualizado TEXT
);

CREATE INDEX IF NOT EXISTS ix_publicidad_espacio ON publicidad (espacio, activo, orden);

-- ── Alta de dealers ────────────────────────────────────────

-- Lo que declara una empresa al pedir su cuenta de dealer. Existe
-- aparte de `organizaciones` por dos razones: son datos de un momento
-- concreto que no deben cambiar cuando la empresa edite su perfil, y
-- así el administrador revisa lo que se declaró, no lo que se editó
-- después.
--
-- El RNC no se copia aquí: vive solo en `organizaciones`. Un dato
-- reservado guardado en dos sitios se filtra por el que se olvide.
CREATE TABLE IF NOT EXISTS solicitudes_dealer (
  id               TEXT PRIMARY KEY,
  organizacion_id  TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  usuario_id       TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- Identidad de la empresa
  nombre_comercial TEXT,                    -- si opera con otro nombre
  anios_operando   INTEGER,

  -- Quién responde por la empresa
  encargado        TEXT NOT NULL,
  cargo            TEXT,

  -- Operación: dimensiona el negocio y permite ver si el alta encaja
  equipos_inventario INTEGER,
  equipos_publicar   INTEGER,
  tipos_equipo     TEXT,

  -- Contexto libre
  origen           TEXT,                    -- cómo llegó a MercaMaquinarias
  comentario       TEXT,

  -- Revisión
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  creada           TEXT NOT NULL,
  revisada         TEXT,
  revisada_por     TEXT REFERENCES usuarios(id),
  motivo           TEXT                     -- por qué se rechazó
);

CREATE INDEX IF NOT EXISTS ix_solicitudes_estado ON solicitudes_dealer (estado, creada);
CREATE INDEX IF NOT EXISTS ix_solicitudes_org ON solicitudes_dealer (organizacion_id);
CREATE INDEX IF NOT EXISTS ix_solicitudes_usuario ON solicitudes_dealer (usuario_id);
CREATE INDEX IF NOT EXISTS ix_solicitudes_revisor ON solicitudes_dealer (revisada_por);

-- Sesiones. Cookie con un testigo aleatorio; nada de estado en memoria
-- para que el día que corran dos procesos no haya que cambiar nada.
CREATE TABLE IF NOT EXISTS sesiones (
  testigo    TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada     TEXT NOT NULL,
  expira     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id);

-- ── Verificación por correo ────────────────────────────────

-- Códigos de un solo uso para tres cosas distintas: confirmar el
-- correo al registrarse, autorizar un inicio de sesión desde un
-- equipo nuevo y restablecer la contraseña.
--
-- NO se guarda el código: se guarda su HMAC con el secreto del
-- servidor. Quien lea la base no puede entrar con lo que ve, igual
-- que pasa con las contraseñas.
--
-- `intentos` corta el barrido a fuerza bruta: seis dígitos son un
-- millón de combinaciones, que sin límite se agotan en minutos.
CREATE TABLE IF NOT EXISTS codigos (
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  correo      TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('verificacion', 'acceso', 'restablecer')),
  codigo_hash TEXT NOT NULL,
  intentos    INTEGER NOT NULL DEFAULT 0,
  consumido   INTEGER NOT NULL DEFAULT 0,
  expira      TEXT NOT NULL,
  creado      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_codigos_vigentes ON codigos (correo, tipo, consumido, expira);
CREATE INDEX IF NOT EXISTS ix_codigos_usuario ON codigos (usuario_id);

-- Equipos en los que ya se verificó un código. Evita pedirlo en cada
-- inicio de sesión: si no existiera, la verificación por correo sería
-- tan molesta que el primer instinto sería quitarla.
CREATE TABLE IF NOT EXISTS dispositivos (
  testigo     TEXT PRIMARY KEY,
  usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  descripcion TEXT,
  creado      TEXT NOT NULL,
  expira      TEXT NOT NULL,
  ultimo_uso  TEXT
);

CREATE INDEX IF NOT EXISTS ix_dispositivos_usuario ON dispositivos (usuario_id);

-- Contador de intentos por ventana de tiempo. En la base y no en
-- memoria: así el límite se respeta aunque corran varios procesos y
-- no se reinicia con cada despliegue.
CREATE TABLE IF NOT EXISTS intentos (
  clave   TEXT PRIMARY KEY,
  cuenta  INTEGER NOT NULL DEFAULT 0,
  expira  TEXT NOT NULL
);

-- ── Comercial ──────────────────────────────────────────────

-- Catálogo de planes. Es una tabla y no una constante del código
-- porque los precios cambian y las suscripciones ya vendidas tienen
-- que seguir apuntando a las condiciones con las que se firmaron.
--
--   modalidad 'vigencia'  — se compra un periodo y el anuncio caduca
--   modalidad 'membresia' — cuota recurrente; los anuncios no caducan
--   anuncios_incluidos NULL — sin límite
CREATE TABLE IF NOT EXISTS planes (
  id                 TEXT PRIMARY KEY,
  nombre             TEXT NOT NULL,
  nivel              TEXT NOT NULL,
  modalidad          TEXT NOT NULL CHECK (modalidad IN ('vigencia', 'membresia')),
  precio             INTEGER NOT NULL,     -- vigencia: 30 días · membresía: mes
  -- PROMOCIONES. Viven aquí, junto al precio que se cobra, y no en la
  -- interfaz: la promoción de lanzamiento estaba escrita solo en el
  -- JavaScript del navegador, así que la página anunciaba el plan
  -- Estándar gratis mientras el servidor seguía cobrándolo. El importe
  -- lo decide siempre esta tabla.
  --
  -- `promo_hasta` es obligatorio para que la promoción exista: una
  -- rebaja sin fecha de término no es una promoción, es el precio.
  precio_promocional INTEGER,
  promo_hasta        TEXT,
  anuncios_incluidos INTEGER,
  fotos_maximas      INTEGER NOT NULL DEFAULT 20,
  -- Videos por anuncio. Por defecto 0: un plan que no lo diga no los
  -- ofrece. Un video de 30 s a 720p ocupa unos 6 MB, doce veces lo que
  -- una foto, así que el número se reparte con cuidado y no se regala.
  videos_maximos     INTEGER NOT NULL DEFAULT 0,
  destacado          INTEGER NOT NULL DEFAULT 0,
  perfil_publico     INTEGER NOT NULL DEFAULT 0,
  solo_dealer        INTEGER NOT NULL DEFAULT 0,
  orden              INTEGER NOT NULL DEFAULT 0,
  activo             INTEGER NOT NULL DEFAULT 1
);

-- Lo contratado. Una organización puede acumular varias: cinco
-- compras por vigencia conviviendo, o una membresía viva más una
-- compra suelta de Destacado para un equipo concreto.
CREATE TABLE IF NOT EXISTS suscripciones (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES planes(id),
  modalidad       TEXT NOT NULL,
  ciclo           TEXT,                    -- 'mensual' | 'anual' | NULL
  estado          TEXT NOT NULL CHECK (estado IN ('activa', 'vencida', 'cancelada', 'impaga')),
  -- Condiciones congeladas al contratar: si mañana sube el precio del
  -- plan, esta suscripción sigue facturando lo que se pactó.
  precio_pactado     INTEGER NOT NULL,
  -- Los cupos comprados. Cada anuncio publicado ocupa uno; al marcar
  -- un equipo como vendido el cupo queda libre y se reutiliza sin
  -- volver a pagar. NULL solo en las suscripciones sin límite que
  -- quedaron del modelo anterior.
  anuncios_incluidos INTEGER,
  -- 30 o 60. Hace falta para prorratear una ampliación a mitad de
  -- ciclo: sin él habría que deducirlo restando fechas, y una
  -- suscripción renovada ya no diría la duración que se contrató.
  dias_ciclo      INTEGER,
  inicio          TEXT NOT NULL,
  fin             TEXT,                    -- NULL en membresía viva
  proximo_cargo   TEXT,
  cancelada       TEXT,
  creada          TEXT NOT NULL,
  -- Renovación automática con tarjeta guardada (CardNet): solo con la
  -- casilla marcada por el anunciante, que queda fechada en
  -- `renovacion_aceptada`. `renovacion_avisada` es el `fin` del ciclo ya
  -- avisado por correo, para no avisar dos veces.
  metodo_pago_id        TEXT,
  renovacion_automatica INTEGER NOT NULL DEFAULT 0,
  renovacion_aceptada   TEXT,
  renovacion_intentos   INTEGER NOT NULL DEFAULT 0,
  renovacion_proxima    TEXT,
  renovacion_avisada    TEXT
);

CREATE INDEX IF NOT EXISTS ix_susc_org ON suscripciones (organizacion_id, estado);

-- Medios de pago tokenizados. NUNCA se guarda el número de tarjeta:
-- solo el testigo que devuelve el procesador y lo imprescindible para
-- que el anunciante reconozca cuál es.
CREATE TABLE IF NOT EXISTS metodos_pago (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  procesador      TEXT NOT NULL,
  token           TEXT NOT NULL,
  marca           TEXT,
  ultimos4        TEXT,
  vence_mes       INTEGER,
  vence_anio      INTEGER,
  predeterminado  INTEGER NOT NULL DEFAULT 0,
  creado          TEXT NOT NULL,
  -- El cliente (`CustomerId`) y el perfil (`PaymentProfileId`) en CardNet.
  procesador_cliente_id TEXT,
  procesador_perfil_id  TEXT,
  -- 0 mientras el banco no active el perfil con su código.
  activo          INTEGER NOT NULL DEFAULT 1,
  -- Rechazos seguidos: con tres, la renovación deja de intentarla.
  fallos_seguidos INTEGER NOT NULL DEFAULT 0,
  -- Borrado lógico: los pagos cobrados con ella siguen apuntándola.
  borrado         TEXT,
  -- El mes (AAAA-MM) del último aviso de tarjeta por vencer.
  aviso_vencimiento TEXT
);

CREATE INDEX IF NOT EXISTS ix_metodos_org ON metodos_pago (organizacion_id);
-- ux_metodos_perfil (organizacion_id, procesador, procesador_perfil_id)
-- vive en la migración 2026-10-cardnet de tools/db.js: este archivo se
-- ejecuta antes de migrar() y en una base vieja la columna aún no existe.

CREATE TABLE IF NOT EXISTS pagos (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  suscripcion_id  TEXT REFERENCES suscripciones(id) ON DELETE SET NULL,
  metodo_pago_id  TEXT REFERENCES metodos_pago(id) ON DELETE SET NULL,
  subtotal        INTEGER NOT NULL,
  itbis           INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  moneda          TEXT NOT NULL DEFAULT 'DOP',
  estado          TEXT NOT NULL CHECK (estado IN ('aprobado', 'rechazado', 'pendiente', 'devuelto')),
  referencia      TEXT,
  procesador      TEXT,
  creado          TEXT NOT NULL,
  -- Un cobro con importe nace 'pendiente': lo comprado espera en
  -- `intencion` (JSON) hasta que el dinero se confirma en `confirmado`.
  intencion       TEXT,
  confirmado      TEXT,
  actualizado     TEXT,
  -- Lo que dijo la pasarela: su id de compra, la autorización del
  -- emisor, el código de respuesta y el motivo que se le dio al
  -- anunciante si se rechazó. `intentos`: cuántas veces se envió.
  procesador_id    TEXT,
  autorizacion     TEXT,
  codigo_respuesta TEXT,
  motivo           TEXT,
  intentos         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_pagos_org ON pagos (organizacion_id, creado);
CREATE INDEX IF NOT EXISTS ix_pagos_suscripcion ON pagos (suscripcion_id);
CREATE INDEX IF NOT EXISTS ix_pagos_estado ON pagos (estado, creado);
-- La referencia es la clave de idempotencia que viaja a CardNet en
-- `UniqueID`. Única solo entre pagos de CardNet: las antiguas no lo eran.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_cardnet_referencia ON pagos (referencia) WHERE procesador = 'cardnet';
-- ix_pagos_procesador_id (procesador, procesador_id) vive en la
-- migración 2026-10-cardnet: en una base vieja la columna aún no existe
-- cuando se ejecuta este archivo.

-- El cliente de cada organización en la pasarela (`CustomerId` de CardNet).
CREATE TABLE IF NOT EXISTS clientes_procesador (
  organizacion_id TEXT NOT NULL,
  procesador      TEXT NOT NULL,
  cliente_id      TEXT NOT NULL,
  creado          TEXT NOT NULL,
  PRIMARY KEY (organizacion_id, procesador)
);

-- Cada aviso y cada consulta a la pasarela, ya limpios de datos de
-- tarjeta. De solo añadir: los dos disparadores abortan UPDATE y DELETE.
CREATE TABLE IF NOT EXISTS pagos_eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pago_id    TEXT,
  procesador TEXT NOT NULL,
  origen     TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  cuerpo     TEXT,
  creado     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_pagos_eventos_pago ON pagos_eventos (pago_id, id);

CREATE TRIGGER IF NOT EXISTS tr_pagos_eventos_sin_cambios
  BEFORE UPDATE ON pagos_eventos
BEGIN
  SELECT RAISE(ABORT, 'Los eventos de pago no se modifican');
END;

CREATE TRIGGER IF NOT EXISTS tr_pagos_eventos_sin_borrado
  BEFORE DELETE ON pagos_eventos
BEGIN
  SELECT RAISE(ABORT, 'Los eventos de pago no se borran');
END;

-- ── Inventario ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anuncios (
  id              TEXT PRIMARY KEY,
  organizacion_id TEXT NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  sucursal_id     TEXT REFERENCES sucursales(id) ON DELETE SET NULL,
  usuario_id      TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  suscripcion_id  TEXT REFERENCES suscripciones(id) ON DELETE SET NULL,

  estado          TEXT NOT NULL DEFAULT 'activo'
                  CHECK (estado IN ('borrador', 'activo', 'pausado', 'vencido', 'vendido', 'retirado')),

  categoria       TEXT NOT NULL,
  subcategoria    TEXT,
  marca           TEXT NOT NULL,
  modelo          TEXT NOT NULL,
  anio            INTEGER NOT NULL,
  condicion       TEXT,
  uso_valor       INTEGER,
  uso_unidad      TEXT DEFAULT 'h',
  serie           TEXT,
  potencia        TEXT,
  peso            TEXT,
  implementos     TEXT,
  descripcion     TEXT,

  provincia       TEXT,
  municipio       TEXT,

  precio          INTEGER,
  moneda          TEXT NOT NULL DEFAULT 'DOP',
  modalidad_precio TEXT NOT NULL DEFAULT 'fijo'
                  CHECK (modalidad_precio IN ('fijo', 'ofertas')),
  precio_minimo   INTEGER,                 -- privado, filtra ofertas
  itbis_incluido  INTEGER NOT NULL DEFAULT 0,
  permuta         INTEGER NOT NULL DEFAULT 0,
  financiamiento  INTEGER NOT NULL DEFAULT 0,
  video           TEXT,

  -- Tren motriz. Solo lo llevan los vehículos de carretera —camiones,
  -- cabezotes y autobuses—, donde es lo primero que pregunta el
  -- comprador. En una excavadora el motor es parte de la máquina y no
  -- se elige, así que estas columnas quedan NULL.
  motor_marca     TEXT,
  motor_modelo    TEXT,
  transmision_marca  TEXT,
  transmision_modelo TEXT,

  destacado_hasta TEXT,
  publicado       TEXT,
  vence           TEXT,                    -- NULL si lo sostiene una membresía

  -- Cuándo se avisó de cada cosa. Fecha y no 0/1: cuando alguien
  -- reclama que no le llegó el aviso, lo que se mira es el cuándo.
  aviso_por_vencer TEXT,
  aviso_vencido    TEXT,

  creado          TEXT NOT NULL,
  actualizado     TEXT
);

-- Los tres accesos que de verdad se usan: el catálogo público filtra
-- por estado y categoría, el panel filtra por organización, y el
-- proceso de caducidad busca por fecha de vencimiento.
CREATE INDEX IF NOT EXISTS ix_anuncios_publico ON anuncios (estado, categoria, publicado);
CREATE INDEX IF NOT EXISTS ix_anuncios_org ON anuncios (organizacion_id, estado);
CREATE INDEX IF NOT EXISTS ix_anuncios_vence ON anuncios (vence) WHERE vence IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_anuncios_marca ON anuncios (marca);

-- Ordenación del catálogo. Sin estos, cada carga ordena en memoria
-- todos los resultados antes de quedarse con la página. Medido sobre
-- 20.000 anuncios: de 13 ms a 0,01 ms por fecha, de 11 ms a 0,01 ms
-- por precio.
CREATE INDEX IF NOT EXISTS ix_anuncios_recientes ON anuncios (estado, publicado DESC);
CREATE INDEX IF NOT EXISTS ix_anuncios_precio ON anuncios (estado, precio, publicado DESC);
CREATE INDEX IF NOT EXISTS ix_anuncios_anio ON anuncios (estado, anio, publicado DESC);

-- Claves foráneas. SQLite no las indexa sola, y sin índice borrar la
-- fila padre recorre la tabla hija entera para resolver el ON DELETE.
CREATE INDEX IF NOT EXISTS ix_anuncios_usuario ON anuncios (usuario_id);
CREATE INDEX IF NOT EXISTS ix_anuncios_sucursal ON anuncios (sucursal_id);
CREATE INDEX IF NOT EXISTS ix_anuncios_suscripcion ON anuncios (suscripcion_id);

-- Rangos con sentido para precio y año.
--
-- La API ya los valida, y esta es la segunda línea: cubre lo que entre
-- por un script de importación, una carga masiva o un error de código
-- que no pase por la ruta de publicación. Un precio negativo o un año
-- 1500 no se detectan al escribirlos, sino meses después, cuando el
-- catálogo ordena por precio y aparece algo absurdo en la primera
-- página.
--
-- Se usan disparadores y no CHECK a propósito: añadir un CHECK a una
-- tabla que ya existe obliga a reconstruirla entera, y de `anuncios`
-- cuelgan fotos, contactos, eventos y métricas. Un disparador se añade
-- igual en una base nueva y en una que ya está en producción, así que
-- el esquema y las migraciones no divergen.
--
-- El límite inferior es 1900 y no 1970 como en la API. No es un
-- descuido: la API impone la regla de negocio —en este mercado no se
-- vende maquinaria anterior a 1970— y el disparador solo ataja datos
-- corruptos. Si mañana se decide admitir una grúa de 1965, se cambia
-- la API sin tocar la base.
CREATE TRIGGER IF NOT EXISTS tr_anuncios_valores_ins
BEFORE INSERT ON anuncios
BEGIN
  SELECT CASE
    WHEN NEW.precio IS NOT NULL AND NEW.precio < 0
      THEN RAISE(ABORT, 'El precio no puede ser negativo')
    WHEN NEW.anio IS NOT NULL AND (NEW.anio < 1900
      OR NEW.anio > CAST(strftime('%Y', 'now') AS INTEGER) + 1)
      THEN RAISE(ABORT, 'Año fuera de rango')
  END;
END;

CREATE TRIGGER IF NOT EXISTS tr_anuncios_valores_upd
BEFORE UPDATE OF precio, anio ON anuncios
BEGIN
  SELECT CASE
    WHEN NEW.precio IS NOT NULL AND NEW.precio < 0
      THEN RAISE(ABORT, 'El precio no puede ser negativo')
    WHEN NEW.anio IS NOT NULL AND (NEW.anio < 1900
      OR NEW.anio > CAST(strftime('%Y', 'now') AS INTEGER) + 1)
      THEN RAISE(ABORT, 'Año fuera de rango')
  END;
END;

-- `url` y `miniatura` guardan RUTAS, no la imagen.
--
-- Antes aquí se metía el `data:` URI completo. Medido con el mismo
-- código del navegador sobre una foto de móvil: 697 KB por imagen,
-- 16,3 MB una página de catálogo de 24 anuncios y 5,3 GB con mil
-- anuncios a ocho fotos. Y nada de eso se podía cachear, porque
-- viajaba dentro del JSON.
--
-- Dos tamaños porque una tarjeta del catálogo mide unos 400 px:
-- mandarle la de 1600 es tirar el 90 % de los bytes.
CREATE TABLE IF NOT EXISTS anuncio_fotos (
  id         TEXT PRIMARY KEY,
  anuncio_id TEXT NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,             -- 1600 px · ficha y galería
  miniatura  TEXT,                      -- 900 px · tarjetas del catálogo
  orden      INTEGER NOT NULL DEFAULT 0,
  creada     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_fotos_anuncio ON anuncio_fotos (anuncio_id, orden);

-- Videos del anuncio. Tabla aparte y no una columna más en `anuncios`
-- porque son varios por anuncio y cuántos depende del plan.
--
-- `duracion` se guarda en segundos aunque el tope sea de 30: sirve para
-- pintar el reproductor con su tamaño antes de descargar nada, y para
-- poder auditar después si algo se coló por encima del límite.
--
-- `poster` es el primer fotograma, guardado como una foto normal. Sin
-- él, `<video>` enseña un rectángulo negro hasta que el usuario pulsa,
-- y en una ficha de maquinaria eso se lee como algo que no cargó.
CREATE TABLE IF NOT EXISTS anuncio_videos (
  id         TEXT PRIMARY KEY,
  anuncio_id TEXT NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  poster     TEXT,
  duracion   REAL,
  orden      INTEGER NOT NULL DEFAULT 0,
  creada     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_videos_anuncio ON anuncio_videos (anuncio_id, orden);

-- Los teléfonos cuelgan del anuncio y no de la organización porque un
-- dealer puede querer que el volteo lo atienda un vendedor y la
-- excavadora otro.
CREATE TABLE IF NOT EXISTS anuncio_contactos (
  id         TEXT PRIMARY KEY,
  anuncio_id TEXT NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  numero     TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'ambos',
  nota       TEXT,
  orden      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_contactos_anuncio ON anuncio_contactos (anuncio_id, orden);

-- ── Métricas ───────────────────────────────────────────────

-- Detalle crudo. Sirve para depurar y para detectar fraude de clics;
-- se purga pasados unos meses. El panel NO lee de aquí.
CREATE TABLE IF NOT EXISTS eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  anuncio_id TEXT NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('vista', 'telefono', 'whatsapp', 'correo', 'favorito', 'compartir')),
  dia        TEXT NOT NULL,
  visitante  TEXT,                         -- huella anónima, no IP en claro
  creado     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_eventos_anuncio ON eventos (anuncio_id, dia);

-- Acumulado por anuncio y día. Se actualiza con UPSERT en el mismo
-- momento en que entra el evento: el panel siempre lee filas ya
-- sumadas, sin importar cuántos millones de eventos haya detrás.
CREATE TABLE IF NOT EXISTS metricas_diarias (
  anuncio_id      TEXT NOT NULL REFERENCES anuncios(id) ON DELETE CASCADE,
  dia             TEXT NOT NULL,
  vistas          INTEGER NOT NULL DEFAULT 0,
  clics_telefono  INTEGER NOT NULL DEFAULT 0,
  clics_whatsapp  INTEGER NOT NULL DEFAULT 0,
  clics_correo    INTEGER NOT NULL DEFAULT 0,
  favoritos       INTEGER NOT NULL DEFAULT 0,
  compartidos     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (anuncio_id, dia)
);

CREATE INDEX IF NOT EXISTS ix_metricas_dia ON metricas_diarias (dia);

-- ── Catálogo inicial de planes ─────────────────────────────
-- `precio` es lo que cuesta UN cupo durante treinta días. La cantidad
-- de cupos no vive aquí: se elige al contratar y se guarda en la
-- suscripción, porque es lo que distingue a un vendedor con un camión
-- de un dealer con cuarenta. Antes había un plan por cada cantidad
-- ("Múltiple Estándar", "Múltiple Destacados") y eso multiplicaba el
-- catálogo sin añadir nada: eran el mismo nivel con otro número.
--
-- El descuento por cantidad y el de 60 días los calcula
-- assets/precios.js, que usan el servidor y el navegador.
--
-- `anuncios_incluidos` queda en NULL a propósito: el cupo es de la
-- suscripción, no del plan.

INSERT OR IGNORE INTO planes
  (id, nombre, nivel, modalidad, precio, anuncios_incluidos, fotos_maximas, destacado, perfil_publico, solo_dealer, orden) VALUES
  ('estandar',  'Estándar',  'estandar',  'vigencia', 2000, NULL,  8, 0, 0, 0, 1),
  ('destacado', 'Destacado', 'destacado', 'vigencia', 3500, NULL, 20, 1, 0, 0, 2),
  ('premium',   'Premium',   'premium',   'vigencia', 5500, NULL, 30, 1, 1, 0, 3);
