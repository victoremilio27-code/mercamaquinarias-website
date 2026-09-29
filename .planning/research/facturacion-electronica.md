# Facturación electrónica (e-CF, Ley 32-23) — investigación para migrar MercaMaquinarias

**Investigado:** 2026-09-29 · **Estado:** solo investigación, sin código tocado, sin commit.
**Confianza global:** MEDIA en calendario y proceso; MEDIA-BAJA en el detalle técnico fino (XSD, layout exacto de la
representación impresa), porque **`dgii.gov.do` y todos los blogs contables estaban bloqueados por el proxy** de esta
sesión (WebFetch devolvió EGRESS_BLOCKED). Solo se pudo leer el resumen que devuelve el buscador (con las URL de los
documentos oficiales), y el código de un repositorio público de GitHub (`victors1681/dgii-ecf`, MIT, 101 estrellas).
Los PDF oficiales de la DGII **no se leyeron**: hay que leerlos antes de implementar (ver §6, acción 6).

Leyenda de las marcas: **[V]** verificado con una fuente citada (resumen del buscador de un documento o noticia
oficial/prensa, no el texto íntegro); **[C]** tomado del código de un SDK público (fuente secundaria, coherente con lo
oficial pero no es la DGII); **[P]** conocimiento previo, SIN verificar; **[E]** comprobado por mí con una prueba
local (ver §3.7).

---

## 0. Lo más importante primero

1. **La fecha de Victor no coincide con lo que encontré. Hay que aclararla ya con el contador.**
   Victor dijo: los NCF B quedan obsoletos el **30 de noviembre**, e-CF desde el **1 de diciembre** (sin fuente).
   Lo que sale publicado es:
   - **Pequeños, micro y no clasificados: plazo hasta el 15 de noviembre de 2026** (prórroga de seis meses, **Aviso
     06-26 de la DGII, 6 de mayo de 2026**) [V]. El director de la DGII, Pedro Urrutia, dijo el 10 de septiembre de
     2026 que **no habrá otra prórroga** [V].
   - **Grandes locales y medianos: e-CF exclusivo desde el 1 de noviembre de 2026**; sus secuencias B valen hasta el
     31 de octubre y después solo en contingencia declarada [V].
   - No encontré ninguna fuente para el 30 de noviembre / 1 de diciembre. Puede ser una fecha del contador (por
     ejemplo, cuando vencen sus secuencias B) o una confusión. **Se planifica contra el 15 de noviembre** y se trata
     el 30 como margen, nunca como plan.
2. **No sabemos en qué grupo cae Inversiones XZT, S.R.L. (RNC 1-31-27975-9).** Si fuera «mediano» o «grande local»,
   el corte es el **1 de noviembre**, a 18 días del lanzamiento. La DGII publica listados por RNC [V]
   (`.../Listados-contribuyentes-obligados-implementar-facturacion-electronica.aspx`). Es lo primero que hay que mirar.
3. **La creencia «cuando quedan pocas B se piden más y la DGII las da al instante» no está verificada** y choca con el
   espíritu del aviso de agosto (la DGII ya no quiere B para los obligados). No conviene apoyar el plan en ella. Ver §1.4.
4. **Recomendación técnica: proveedor autorizado (PSFE) por API REST, detrás de un adaptador**, no firma directa. Emitir
   directo exige además exponer nosotros cuatro endpoints públicos de recepción y pasar el set de pruebas con XML
   propio, todo en 33-47 días. Ver §4.
5. **El requisito de «cero paquetes» no bloquea nada**, pero hay una trampa: `node:crypto` **no lee `.p12`**. Ver §3.3.

---

## 1. Marco legal y calendario

### 1.1 Norma

| Pieza | Qué dice | Marca |
|---|---|---|
| **Ley 32-23 de Facturación Electrónica** | Crea el e-CF con validez fiscal y jurídica; obligatoriedad escalonada; sanciones (art. 27) | [V] existencia y escalonado; fecha de promulgación (16-05-2023) [P] pero coherente con los 36 meses → 15-05-2026 |
| **Decreto 587-24** (10-oct-2024) | Reglamento de aplicación; su capítulo IX regula la **contingencia**; su art. 55 fija la vigencia de las B para los obligados | [V] (Gosocket/El Dinero/Hahn Ceara, resumen del buscador) |
| **Norma General 06-2018** | Comprobantes fiscales: secuencias, vigencia (hasta el 31-dic del año siguiente), art. 9 | [V] vía Aviso 28-23 de EY |
| **Aviso 06-26** (6-may-2026) | Prórroga administrativa de 6 meses, automática y generalizada, para pequeños, micro y no clasificados: de 15-may a **15-nov-2026** | [V] (DGII noticias, EY, Ensegundos, Presidencia) |
| **Aviso de agosto 2026** (número no localizado) | Grandes locales y medianos: e-CF exclusivo desde 1-nov-2026; B válidas hasta 31-oct | [V] (Diario Libre, Listín, KPMG, 7días 26-ago-2026) |

### 1.2 Calendario por tipo de contribuyente

| Grupo | Obligación | Marca |
|---|---|---|
| Grandes contribuyentes nacionales | Solo e-CF desde 15-may-2024 | [V] |
| Grandes locales y medianos | Solo e-CF desde **1-nov-2026** (las B, hasta 31-oct) | [V] |
| **Pequeños, micro y no clasificados** | **15-nov-2026**, sin más prórroga anunciada | [V] |
| Victor: todos, B obsoletas el 30-nov, e-CF el 1-dic | — | **Dato de Victor, sin fuente. No verificado.** |

Los 36 meses de la ley para quien no está en las listas vencían el 15-may-2026 y la prórroga los movió seis meses
[V]. Los medios reportan la fecha de los medianos con versiones distintas (15-nov-2025 antes, 1-nov-2026 ahora):
la vigente es la del aviso de agosto.

### 1.3 Qué pasa con los NCF B

- Para los obligados que ya vencieron (grandes, medianos): las secuencias B **dejan de valer** en la fecha de corte y
  después solo sirven en **contingencia declarada** (Reglamento 587-24, cap. IX): máximo 15 días naturales con B en papel,
  y hay que reemplazarlas por e-CF enviados a la DGII en ≤30 días [V, resumen del buscador; el 15 y el 30 conviene
  confirmarlos en el texto del Decreto].
- Para pequeños/micro: hasta el 15-nov se puede seguir con papel [V]. **No encontré el texto exacto** de qué pasa con
  las B de este grupo después del 15-nov; por analogía con el art. 55, solo contingencia. **Sin verificar.**
- Sanción por no cumplir: multa (los medios dicen 5 a 30 salarios mínimos y 0,25 % de los ingresos del ejercicio
  anterior, art. 27; otro medio dice 5 a 50). **Las fuentes se contradicen**; lo cierto es que hay multa. [V/LOW]
- Un comprobante B ya emitido **sigue siendo válido**, y se puede corregir con una **nota de crédito electrónica E34
  que lo referencia**: la Comunidad de Ayuda de la DGII responde que una E34 puede modificar una serie B, pero una B
  no puede modificar una E [V, resumen del buscador de tres hilos de ayuda.dgii.gov.do]. Esto importa: el B01 emitido
  el 20-oct que haya que anular el 20-dic se anula con E34, no con B04.
- Riesgo comercial antes del corte: un medio contable afirma que **desde el 15-may-2026 un NCF en papel ya no da
  crédito fiscal a un cliente-empresa que sí es emisor electrónico** [LOW: un solo blog]. Si es cierto, los dealers
  empresa podrían rechazar un B01 en octubre. Preguntar al contador.

### 1.4 «Se piden más secuencias y la DGII las da al instante»

- Que la solicitud de secuencias sea inmediata en la Oficina Virtual: [P], **no verificado**.
- Que la DGII **siga autorizando B nuevas** a un obligado a partir de cierto momento: **no verificado y dudoso**. La
  cantidad y tipo se asignan según la actividad, volumen y riesgo (Norma 06-2018) [V]; y la DGII ya dice que las B de los
  obligados mueren en la fecha de corte [V].
- Consecuencia práctica: hoy hay **15 números de B01 (16-30), 10 de B04 y ninguna B02** (el que compra sin RNC recibe
  un recibo no fiscal). Con el corte a 4-6 semanas del lanzamiento, **no vale la pena que Victor gaste esfuerzo en
  pedir B02**: la solución de fondo para el consumidor final es E32. Confirmarlo con el contador antes de descartarlo.
- Vigencia de las secuencias: B y E valen hasta el **31-dic del año siguiente** al de autorización [V]. El aviso `ncf` de
  `tools/tareas.js` ya mira `vence`; hoy las B están cargadas con `vence = NULL` (pendiente del contador).

### 1.5 Requisitos para ser emisor y saturación

- Para ser emisor electrónico hace falta: RNC actualizado y activo, estar al día con obligaciones, clave de Oficina
  Virtual (OFV), **certificado digital** de una entidad autorizada por INDOTEL, cumplir los requisitos técnicos y
  software especializado (propio, de un proveedor autorizado, o el Facturador Gratuito) [V].
- La DGII cuenta **190 proveedores autorizados** [V] y **84.003 emisores** en septiembre de 2026 frente a 23.686 en
  enero [V]: la cola de certificación puede estar saturada a fin de octubre (los blogs hablan de 2-4 semanas normales y
  6-8 si hay saturación, [LOW]).

---

## 2. Tipos de e-CF y equivalencias

**e-NCF = 13 caracteres: la letra `E` + 2 dígitos de tipo + 10 dígitos de secuencia** (por ejemplo `E310000000001`).
Un NCF B tiene 11 (B + 2 + 8) [V]. Por eso en el código **`padStart(8)` y el prefijo `B\d{2}` no sirven** (ver §5).

| e-CF | Nombre | Equivale a | ¿Lo necesita MercaMaquinarias? |
|---|---|---|---|
| **E31** | Factura de crédito fiscal electrónica | B01 | **Sí** (cliente con RNC/cédula, dealers) |
| **E32** | Factura de consumo electrónica | B02 | **Sí** (particular sin RNC). **< RD$250.000 → resumen RFCE**, ver §3.6 |
| E33 | Nota de débito electrónica | B03 | Solo por si hay que aumentar un importe ya facturado; no se emite hoy |
| **E34** | Nota de crédito electrónica | B04 | **Sí** (anular/corregir; también sobre un B viejo) |
| E41 | Comprobante de compras | B11 | No (lo consume el contador por fuera) |
| E43 | Gastos menores | B13 | No |
| E44 | Regímenes especiales | B14 | No |
| E45 | Gubernamental | B15 | No, salvo que se venda a una entidad del Estado |
| E46 | Exportaciones | (B16) | No |
| E47 | Pagos al exterior | (B17) | No |

Marca: los tipos E31-E47 y las equivalencias B01/B02/B03/B04/B11/B13/B14/B15 [V] (DGII TipoyEstructurae-CF, Nexo POS,
FacturandoRD, resumen); E46→B16 y E47→B17 como comparación son [P]. Las tres que usaremos son E31, E32 y E34.

Notas de 2026: la DGII actualizó los XSD de E33 y E34 (el bloque del comprador ya no es obligatorio en el encabezado)
y añadió MXN a `TipoMonedaType` [V, LLB Solutions y Gosocket, oct-2025/2026]. **Hay que usar los XSD vigentes**, no
los de un tutorial.

Una nota de crédito electrónica no puede superar el saldo de las operaciones del comprobante que referencia (la DGII
lo valida) y una E33/E34 no puede modificar a otra E33/E34 [V, ayuda.dgii.gov.do, resumen].

---

## 3. Cómo se emite (camino directo)

### 3.1 Certificación como emisor electrónico

Tres etapas [V, «Proceso de Certificación para ser Emisor Electrónico», DGII, resumen del buscador]:

1. **Solicitud** en la OFV → Solicitudes → «Solicitud para ser Emisor Electrónico» (formulario **FI-GDF-016**) [V]. La
   respuesta llega al buzón de la OFV con el enlace al **portal de certificación**, usuario y clave.
2. **Set de pruebas** en el portal: (a) *pruebas de datos*: se descarga un Excel con los datos que la DGII dicta y
   hay que generar, firmar y enviar los XML de e-CF y de aprobación/rechazo comercial; (b) *pruebas de simulación*:
   se sube el PDF de la representación impresa (≤10 MB) de lo enviado, para que revisen los mínimos; (c) *validación
   de la RI*; (d) *recepción y aprobación comercial*: la DGII **nos envía** comprobantes a las URL que declaremos
   y hay que devolver el acuse (ARECF) y la aprobación (ACECF). Se declaran las URL de nuestros servicios
   (autenticación, recepción, aprobación) [V/LOW]. Un blog habla de **≥25 comprobantes de prueba** [LOW].
3. **Declaración jurada** electrónica (las pruebas se hicieron íntegras) y **certificación**: se habilita el menú de
   facturación electrónica en la OFV [V]. Luego se **solicitan las secuencias e-NCF** por la OFV [V].

Duración: los blogs dicen 2-6 semanas [LOW]. Con un PSFE ya certificado el trámite del emisor es **más corto** (el
formulario pide el nombre del software contratado y las URL del proveedor) [V], pero sigue habiendo etapa de pruebas.

### 3.2 Ambientes [V/C]

| Ambiente | Ruta | Para qué |
|---|---|---|
| **TesteCF** (pre-certificación) | `https://ecf.dgii.gov.do/TesteCF/...` | Desarrollo libre |
| **CerteCF** (certificación) | `https://ecf.dgii.gov.do/CerteCF/...` | El set de pruebas oficial |
| **eCF** (producción) | `https://ecf.dgii.gov.do/eCF/...` | Real |

El RFCE va a otro host: `https://fc.dgii.gov.do/{TesteCF|CerteCF|eCF}/...` [C]. Estado de servicios y ventanas de
mantenimiento en `https://statusecf.dgii.gov.do` con clave de API [C].

### 3.3 Certificado digital y formato

- Lo emite una **entidad de certificación autorizada por INDOTEL**: **Avansi**, **Viafirma** y **Digifirma de la Cámara
  de Comercio de Santo Domingo** figuran en los resultados [V]; la lista oficial está en indotel.gob.do/firma-digital.
  Debe ser el **«certificado digital para procedimientos tributarios»**, a nombre del contribuyente o de su representante
  autorizado [V]. Precio orientativo US$30-70 al año, 3-10 días hábiles, vigencia 1-2 años [LOW, blogs].
- El certificado gratuito del Facturador Gratuito tenía fecha límite de solicitud **30-sep-2025** [V, resumen]; no
  sé si sigue disponible. **Sin verificar.**
- **Incluso con proveedor, el emisor necesita su propio certificado** [V, DGII: proceso con PSFE].
- Formato: se entrega como **`.p12` / `.pfx`** (PKCS#12) con contraseña [C: el SDK lo lee con `node-forge`].
- **TRAMPA CON «CERO PAQUETES»:** `node:crypto` no tiene lector de PKCS#12 (comprobado: no hay ninguna función
  `pkcs`/`pfx`/`p12` en `crypto`; `tls.createSecureContext({pfx})` lo carga pero no expone la clave). Salidas:
  1. **Convertir una vez a PEM con `openssl pkcs12 -in c.p12 -nodes ...`** en la máquina de Victor o del VPS y guardar
     la clave privada fuera del repo con permisos 0600, como ya se guardan los demás secretos (recomendado; OpenSSL 3
     está en cualquier VPS; con `.p12` antiguos hace falta `-legacy`). [E] la conversión funciona en OpenSSL 3.0.13.
  2. Escribir un lector PKCS#12 a mano (DER + KDF de PKCS#12 + 3DES/AES/**RC2**). Node no trae RC2, que usan los `.p12`
     antiguos. **No recomendado**: mucho riesgo para muy poco.
  Es decir: no hace falta ningún paquete, sí un paso manual de conversión y un sitio seguro para la clave. Con un PSFE
  que firma en su lado, el problema desaparece para nosotros.

### 3.4 Firma XML (XMLDSig)

Perfil que usan los SDK públicos, coherente con lo que exige la DGII [C, más confirmación del buscador]:

- **Firma envuelta (enveloped)**, `Reference URI=""`, un solo `Transform`: `enveloped-signature`.
- **SignatureMethod:** `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`. **Digest: SHA-256.**
- **Canonicalización:** `http://www.w3.org/TR/2001/REC-xml-c14n-20010315` (C14N **inclusiva**, sin comentarios).
  Los resultados discrepan entre «exclusiva» e «inclusiva»; el SDK en .NET dice «C14N inclusivo» y el de Node usa la
  URL de arriba, que es la inclusiva. **Sin verificar contra el PDF «Firmado de e-CF».**
- **Nota del SDK de Node:** «DGII requiere el digest sobre la forma canónica con los atributos xmlns ordenados»
  [C]. Es decir, la DGII valida por su cuenta y es quisquillosa con la serialización.
- `KeyInfo` con el `X509Certificate` en base64.
- **Código de seguridad** del e-CF = **los 6 primeros caracteres del `SignatureValue`** (en base64) [V, DGII].
- `FechaHoraFirma` (dd-MM-aaaa HH:mm:ss) va dentro del XML y en el QR [V].

### 3.5 Estructura del XML y esquemas

Documentos oficiales (PDF y XSD, no leídos, solo localizados por el buscador) [V]:

- «Formato Comprobante Fiscal Electrónico (e-CF) v1.0» (última: octubre 2025), «Descripción Técnica de Facturación
  Electrónica v1.6» (jun-2023), «Informe Técnico e-CF v1.0» (actualizado 2026), «Formato Resumen Factura Consumo v1.0»,
  «Formato Anulación de e-NCF v1.0», instructivo «Firmado de e-CF».
- Los XSD se descargan de la página de facturación electrónica de la DGII (un XSD por tipo: `e-CF 31`, `32`, `33`, `34`,
  `RFCE`, `ACECF`, `ARECF`, `ANECF`).

Esqueleto (raíz `ECF`; **sin declaración `<?xml?>` en lo que se firma**, sin prefijos) [V nombres de campo,
resumen de docs de terceros; el orden lo fija el XSD]:

```
ECF
 ├ Encabezado
 │   ├ Version (1.0)
 │   ├ IdDoc: TipoeCF, eNCF, FechaVencimientoSecuencia, IndicadorMontoGravado, TipoIngresos, TipoPago, ...
 │   ├ Emisor: RNCEmisor, RazonSocialEmisor, DireccionEmisor, FechaEmision, ...
 │   ├ Comprador: RNCComprador, RazonSocialComprador   (obligatorio en E31)
 │   └ Totales: MontoGravadoTotal, MontoGravadoI1, ITBIS1, TotalITBIS, TotalITBIS1, MontoTotal
 ├ DetallesItems / Item: NumeroLinea, IndicadorFacturacion (1 = ITBIS 18 %), NombreItem,
 │                        IndicadorBienoServicio, CantidadItem, PrecioUnitarioItem, MontoItem
 ├ InformacionReferencia (solo E33/E34): NCFModificado, FechaNCFModificado, CodigoModificacion
 ├ FechaHoraFirma
 └ Signature (ds)
```

**Puntos de ajuste con nuestro modelo (todo [P], comprobar con el XSD):**
- Importes con 2 decimales; nosotros guardamos **pesos enteros**. `total = subtotal + ITBIS` se cumple por
  construcción, pero **`ITBIS = round(subtotal × 0,18)`** puede diferir de `subtotal × 0,18` hasta RD$0,50. La DGII
  valida el cálculo con una tolerancia que no conozco. **Riesgo real de rechazo** con el 3 % dentro del subtotal
  gravado (05.1). Comprobar con el set de pruebas y añadir una prueba que recorra los precios de todos los planes.
- Los servicios son `IndicadorBienoServicio = 2` (servicio), `IndicadorFacturacion = 1` (gravado al 18 %).
- Las fechas van `dd-MM-aaaa` en hora local. `facturas.js:fechaCorta` usa UTC (fallo ya anotado en STATE para el
  panel): **para el e-CF hay que usar America/Santo_Domingo**, o un comprobante emitido entre 20:00 y 23:59 locales
  saldría con la fecha del día siguiente.
- El comprador con RNC/cédula debe ser **válido** (9 u 11 dígitos); hoy `cliente.rnc` es texto libre. Validar formato al
  capturar (y, si se quiere, contra la consulta de RNC de la DGII).

### 3.6 Servicios web de la DGII [C, salvo lo marcado]

Base `https://ecf.dgii.gov.do/{ambiente}/`. Las rutas, según el código de `victors1681/dgii-ecf`:

| Servicio | Método y ruta | Notas |
|---|---|---|
| Semilla | `GET Autenticacion/api/Autenticacion/Semilla` | Devuelve un XML con un valor y una fecha [P] |
| Validar semilla | `POST autenticacion/api/Autenticacion/ValidarSemilla` | multipart, campo **`xml`** = la semilla **firmada**; responde JSON con `token`, `expira` |
| Enviar e-CF | `POST recepcion/api/FacturasElectronicas` | multipart `xml`; nombre del archivo **`{RNC}{eNCF}.xml`** (p. ej. `101672919E3100000001.xml`); `Authorization: Bearer <token>`; devuelve **TrackId** |
| Estado por TrackId | `GET consultaresultado/api/Consultas/Estado?trackId=` | Estados: aceptado / aceptado condicional / rechazado / en proceso [P] |
| Estado por e-NCF | `GET consultaestado/api/Consultas/Estado?rncEmisor=&ncfElectronico=&rncComprador=&codigoSeguridad=` | |
| TrackIds de un e-NCF | `GET ConsultaTrackIds/api/TrackIds/Consulta?rncEmisor=&encf=` | |
| **RFCE** (E32 < 250 000) | `POST recepcionfc/api/recepcion/ecf` en **`fc.dgii.gov.do`** | El resumen se firma y se envía; **el e-CF completo NO se envía**, se conserva entero [V] |
| Consulta RFCE | `GET consultarfce/api/Consultas/Consulta` en `fc.dgii.gov.do` | Solo producción [C] |
| **Aprobación comercial** (ACECF) | `POST aprobacionComercial/api/AprobacionComercial` | Es del **comprador** sobre un e-CF recibido |
| **Anulación de rangos** (ANECF) | `POST anulacionrangos/api/operaciones/anularrango` | Se anulan rangos de e-NCF **no usados** |
| Directorio | `GET consultadirectorio/api/consultas/obtenerdirectorioporrnc` (prod) / `.../listado` (test y cert) | Dónde recibe cada emisor |

Detalles operativos [C]:
- **`Content-Length` obligatorio** en el multipart, o la DGII responde «Multipart cannot be empty». Armar el cuerpo
  con `Buffer` a mano es trivial.
- El token se renueva un minuto antes de expirar y se reintenta una vez ante 401.
- Endpoint de **recepción propio** (lado comprador; imprescindible para certificar): `fe/autenticacion/api/semilla`,
  `fe/autenticacion/api/validacioncertificado`, `fe/recepcion/api/ecf`, `fe/aprobacioncomercial/api/ecf`. Hay que
  emitir semillas, validar la semilla firmada por la DGII, entregar un JWT, aceptar el multipart, contestar un ARECF
  firmado. Detrás de Cloudflare, con `CF-Connecting-IP`. **Esto es lo que más pesa del camino directo.**
- Ventanas de mantenimiento y estado de servicio: consultarlas antes de dar por caído un envío.

**RFCE / consumo < RD$250.000.** Todo lo que vendemos cabe ahí (el plan más caro ronda RD$6.700). El e-CF E32 se
firma y se genera igual, pero a la DGII se le manda el **resumen** con el mismo código de seguridad; el XML completo
lo conservamos nosotros. La cadencia de envío (por documento o agrupada) **no se pudo confirmar**: un resultado dice
«mensual», lo cual me parece dudoso; el SDK trata cada RFCE como un envío inmediato. Confirmar en «Preguntas frecuentes
Resumen Factura de Consumo». **Sin verificar.**

**Representación impresa (RI) y QR** [V]:
- QR abajo a la izquierda. URL para E31: `https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=..&RncComprador=..&ENCF=..&FechaEmision=dd-MM-aaaa&MontoTotal=..&FechaFirma=dd-MM-aaaa HH:mm:ss&CodigoSeguridad=XXXXXX`.
- Para E32 < 250.000: `https://fc.dgii.gov.do/eCF/ConsultaTimbreFC?RncEmisor=..&ENCF=..&MontoTotal=..&CodigoSeguridad=..`
  (sin fechas ni comprador).
- Debajo del QR, el código de seguridad **en texto**. La RI lleva además e-NCF, fecha de emisión, fecha de
  vencimiento de la secuencia, fecha y hora de firma y los datos del comprador. **La lista exacta de mínimos
  la revisa la DGII en el paso «validación de RI»: leerla en el «Informe Técnico e-CF».**
- **Un QR sin dependencias es viable**: un codificador QR a mano son unas 300 líneas (modo byte, Reed-Solomon,
  máscara), y `pdf.js` ya dibuja rectángulos, así que el QR se pinta como cuadraditos vectoriales sin decodificar ni
  incrustar imágenes. Hace falta versión ~9-11 para esa URL.

### 3.7 Prueba local que hice (evidencia [E])

En el scratchpad (no en el repo): con Node 22.22 y un certificado autofirmado, armé un XML mínimo **ya en forma
canónica** (sin declaración, sin `<a/>`, sin atributos salvo `xmlns`), lo firmé con `crypto.sign('sha256')`, calculé el
digest con `crypto.createHash('sha256')` y generé el `Signature`. Resultado:
- `xmllint --c14n` del cuerpo da **exactamente** la misma cadena que emitimos (`true`), así que la canonicalización es
  trivial **si el generador es determinista**: no hace falta un canonicalizador general.
- La firma verifica con la clave pública del certificado (`crypto.verify` → `true`).
- Conclusión: **firmar con `node:crypto` es viable en cero paquetes.**
- **Límites de la prueba:** (a) la verificación es mía contra mí (no había `xmlsec1`); no demuestra que la DGII la
  acepte; (b) el `SignedInfo` se canonicaliza «en contexto» heredando los `xmlns` de la raíz y del `Signature` con un
  orden que deduje a mano, y **no lo contrasté con un verificador independiente**. Es justo donde la DGII es
  quisquillosa. Habría que resolverlo con la herramienta oficial «App Firma Digital» o el servicio de validación de
  firma de TesteCF antes de fiarse.

---

## 4. Facturador gratuito de la DGII, proveedor autorizado (PSFE) o emisión directa

| | **Facturador Gratuito (DGII)** | **PSFE por API** | **Directo (nosotros firmamos y enviamos)** |
|---|---|---|---|
| Integración con el sitio | **Ninguna.** Portal web `fg.dgii.gov.do`; hay que teclear cada factura y **cada vez** los datos del comprador [V] | **REST/JSON**, el sitio llama tras `confirmarPago` | Total, pero todo a nuestra cuenta |
| Límite | ~150 facturas al mes (la DGII puede cambiarlo); solo DOP [V] | Por proveedor | Ninguno |
| Tipos | Consumo, crédito fiscal, notas de crédito y débito [V] | Todos | Todos |
| Certificado propio | Sí (hay un trámite gratuito que vencía el 30-sep-2025 [V]) | **Sí, también** [V] | Sí |
| Trabajo de certificación | Cero (ya lo hizo la DGII) | Corto: el proveedor ya está certificado; el emisor completa pruebas en el portal [V] | **Todo: XML, firma, 4 endpoints de recepción, ≥25 documentos de prueba, RI** |
| Tiempo estimado | Días (cuando llegue el certificado) | 2-4 semanas [LOW] | 4-8 semanas [LOW] con riesgo de repetir pruebas |
| Coste | Gratis | Por documento o mensual; **no pude verificar precios** (Alanube declara «pago por uso, sin paquetes obligatorios» [V]) | Solo tiempo nuestro y de Victor |
| Encaja con «cero paquetes» | Sí (no hay código) | **Sí:** un `https.request` a mano, como ya hay para Brevo y CardNet | Sí, pero con la trampa del `.p12` y sin validador XSD (no hay libxml en Node) |
| Bloqueo por proveedor | No | **Sí**: mitigable con un adaptador y guardando siempre el XML y el PDF | No |
| Ley del «cero envío automático al contador» | Compatible | Compatible | Compatible |

**Recomendación (opinión con evidencia media):**

1. **Camino principal: un PSFE con API REST**, encapsulado en un solo módulo (`tools/ecf-proveedor.js`) con una interfaz
   mínima (`emitir(comprobante) → { eNcf, trackId, estado, xml, codigoSeguridad, fechaFirma, qrUrl }`, `consultar`,
   `anular`). Sin dependencias, con costura de pruebas como `tools/cardnet.js`. Motivos: (a) el plazo real es de
   33-47 días y la certificación directa exige nuestra propia recepción pública y el set de pruebas con XML propio;
   (b) no tenemos validador XSD y un XML mal formado se descubre por rechazo de la DGII; (c) no queremos ser
   nosotros quienes custodien la clave privada de un certificado tributario.
2. **Respaldo si la certificación se retrasa: el Facturador Gratuito**, con el flujo manual. El sitio **ya sabe emitir
   un «recibo de pago no fiscal»** y `facturas.pendientesDeRegularizar()` ya lista los recibos sin NCF: Victor
   regulariza a mano en el portal. Es un puente legítimo pero no una solución (no da comprobante fiscal al instante al
   cliente, y hay que preguntar al contador si eso es suficiente después del 15-nov).
3. **Emisión directa: diferida a después del lanzamiento**, solo si el coste del PSFE o el bloqueo lo justifican. El
   adaptador permite añadirla sin tocar el resto.

Preguntas que hay que hacerle a cada proveedor candidato (Alanube, MSeller, The Factory HKA, Digifact u otro de los
190 de la lista oficial):
1. ¿Firma con **nuestro** certificado (subimos el `.p12`) o con el suyo? ¿Sirve para el «Emisor con proveedor»?
2. ¿Cuánto cobra por comprobante y por mes, y hay mínimo? ¿Cobra los rechazados y los de prueba?
3. ¿Sandbox gratuito ya conectado a TesteCF/CerteCF?
4. ¿Nos entrega el **XML firmado y el código de seguridad**, para dibujar nuestra propia RI con `tools/pdf.js`? (si no,
   ¿el PDF de ellos lleva nuestro membrete?)
5. ¿Quién **lleva la secuencia** de e-NCF: pedimos el rango a la DGII y lo pasamos, o lo administran ellos?
6. ¿Cuánto tarda el proceso de certificación con ellos, y **hay cola** ahora?
7. ¿Idempotencia: qué pasa si enviamos dos veces el mismo pago? ¿Hay clave de idempotencia?
8. ¿Cómo notifican el estado final (aceptado/rechazado): webhook o consulta? ¿Con qué firma autentican el webhook?
9. ¿Exportación de todo el histórico de XML si nos vamos?
10. ¿Cubren E32 < 250.000 con RFCE y E34 sobre una B vieja?

---

## 5. Qué cambia en ESTE código

### 5.1 Lo que se reutiliza casi tal cual

| Pieza | Por qué se queda |
|---|---|
| `tools/pagos.js` → `confirmarPago` y `emitir` | **Es el único punto de emisión** (transición pendiente → aprobado). El e-CF cuelga de ahí; no hay que tocar cupos, renovación ni CardNet |
| `facturas.emitirPorPago` (idempotente por `pago_id`), `db.facturaDePago` | La regla «un pago, un comprobante» es la misma |
| Emisión fuera del `SAVEPOINT` de `confirmarPago` | Con e-CF es todavía más importante: **una llamada de red nunca va dentro de una transacción** |
| `regenerarPdfsPendientes`, `enviar` (correo cliente + copia interna aparte) | Se conservan, con la condición nueva de §5.3 |
| `tools/pdf.js` (sin imágenes, todo vectorial) | Sirve para la RI, y el QR se dibuja como cuadros |
| `facturas` (`itbis_tasa`, `metodo_pago`, `referencia_pago`, `ncf_modificado`, `anula_a`, `anulado_por`) | Ya guarda lo que el XML pide |
| Nota de crédito: no se borra el original, `anulado_por` apunta a la nota | Es la regla de la DGII también en e-CF |
| Aviso `ncf` de `tools/tareas.js` (`secuenciasBajas`: pocos números y por vencer a 30 días) | Funciona igual para E31/E32/E34; solo cambia el texto |
| Interruptor por entorno (`MERCA_CARDNET`, `MERCA_SMS`) | Modelo para `MERCA_ECF` |
| `tools/correo.js` `EMPRESA` (razón social, RNC, domicilio fiscal) | Datos del emisor del XML |

### 5.2 Lo que hay que construir o cambiar (y por qué no encaja tal cual)

1. **`secuencias_ncf` y `tomarNcf` están atados al formato B.** `cargarSecuencia` rechaza todo lo que no sea
   `/^B\d{2}$/`, y `tomarNcf` hace `padStart(8, '0')`. El e-NCF es `E` + 2 + **10** dígitos. Hay que: aceptar
   `E31/E32/E33/E34`, parametrizar el ancho (8 para B, 10 para E) **sin cambiar cómo se consumen las B**, y tener una
   secuencia E activa por tipo. Como `secuencias_ncf` tiene `UNIQUE(tipo, desde)` y B y E son tipos distintos, no
   chocan. Todo por migración **añadida al final**; nunca reescribir una anterior.
2. **`facturas.tipo` tiene un `CHECK IN (recibo, factura_consumo, factura_credito_fiscal, nota_credito)`.** SQLite no
   permite cambiar un `CHECK` sin reconstruir la tabla, que va contra «no reescribir comprobantes». **No hace falta**:
   `factura_credito_fiscal` = E31, `factura_consumo` = E32, `nota_credito` = E34. Se distinguen con columnas nuevas
   (`formato` = `B`|`E`, `ecf_tipo`, ver 3) y el e-NCF cabe en `ncf TEXT UNIQUE`.
3. **Tabla nueva de solo añadir `ecf_envios`** (una fila por intento: `factura_id`, `ambiente`, `xml_enviado`,
   `codigo_seguridad`, `fecha_firma`, `track_id`, `estado`, `respuesta_cruda`, `creado`) y columnas en `facturas` para
   el estado actual (`ecf_estado`, `ecf_track_id`, `ecf_codigo_seguridad`, `ecf_fecha_firma`, `ecf_xml` ruta). El
   **XML firmado se guarda como el PDF**: en `MERCA_FACTURAS`, fuera del repo y dentro del respaldo. Hay que conservarlo
   años (el plazo legal exacto **no está verificado**, ver §7).
4. **Máquina de estados asíncrona.** Hoy emitir es síncrono e instantáneo. Con e-CF la DGII responde con un TrackId y
   luego un estado. Flujo: (a) `crearFactura` con el e-NCF, ya fila fiscal; (b) construir y firmar XML; (c) enviar;
   (d) tarea que consulta el estado hasta que sea **aceptado** o **rechazado**. Se propone una tarea nueva `ecf` en
   `tools/tareas.js` junto a `comprobantes`.
5. **`enviar()` (correo al cliente) debe esperar a «aceptado».** Un e-CF que la DGII no ha aceptado no es válido. Hoy
   `enviar` sale en cuanto hay PDF.
6. **`dibujar()` necesita una variante e-CF de la RI**: e-NCF, «Factura de crédito fiscal electrónica», fecha de
   vencimiento de la secuencia, fecha y hora de firma, **QR** y código de seguridad. Los textos legales de `legales`
   dicen «NCF impreso»; se cambian para e-CF, **solo hacia adelante**. Los B ya emitidos se reimprimen como estaban.
7. **`decidirTipo`**: hoy elige B01/B02. Debe elegir E31/E32 cuando el interruptor esté en `produccion` y B en cualquier
   otro caso; **el corte lo decide el interruptor, no la fecha del reloj**. Con el interruptor encendido y el proveedor
   caído, **no se puede degradar en silencio a B** (crédito fiscal de un B fuera de plazo); se emite el recibo no fiscal
   y se avisa, como hoy con B02.
8. **`emitirNotaCredito`**: hoy toma B04 y sale siempre. Con e-CF, E34 con `InformacionReferencia` (NCF modificado,
   fecha, código de modificación). Cuando el original es una B vieja, **sigue siendo válido referenciarla** con E34 [V].
   El importe de la nota no puede exceder el saldo del original.
9. **Módulos nuevos** (sin dependencias): `tools/ecf.js` (constructor determinista del XML y del RFCE, firma con
   `node:crypto`, código de seguridad, URL del QR); `tools/qr.js` (codificador QR a mano); `tools/ecf-proveedor.js`
   (adaptador, con la costura de pruebas del doble); `tools/ecf-dgii.js` (cliente directo, diferido).
10. **Validación de RNC/cédula del comprador** en el formulario (hoy es texto libre) y **fecha en hora dominicana**.
11. **Auditoría de `facturas.js` línea `fechaCorta`** (UTC) y de los importes con decimales al pasar al XML.
12. **Consola:** nueva sección o columna con el estado e-CF de cada comprobante (aceptado, rechazado, en proceso), con
    reintento manual. Las rutas `/api/admin/*` con `conAdmin` y bitácora, como todo lo demás.
13. **Fase 12 (lote del contador) hay que replantearla**: el paquete del mes tendría que incluir la RI y el XML firmado
    de cada e-CF, no solo el PDF. Como el plan 12 ya está escrito, conviene ajustarlo antes de ejecutarlo.
14. **Fase 6 (CardNet)**: `DataDo.Invoice` NO debe ser el e-NCF (reservar el e-NCF antes de cobrar sigue prohibido). No
    cambia nada de lo ya decidido; solo confirmarlo.

### 5.3 Las reglas fiscales de CLAUDE.md frente al e-CF

- **«Un comprobante emitido nunca se borra ni se reescribe».** Con e-CF se cumple sin cambios: el importe, el e-NCF y la
  fecha no se tocan. Las columnas de estado (`ecf_estado`, `ecf_track_id`) **sí cambian**, igual que hoy cambian
  `ruta_pdf` y `enviada_cliente`: no son el hecho fiscal. Aun así el historial de cada intento va en **`ecf_envios`,
  de solo añadir**.
- **Un e-CF rechazado no es un comprobante emitido.** La DGII lo rechazó, no existe. Qué se hace con su e-NCF
  (reenviarlo corregido con el **mismo** e-NCF, o anularlo con ANECF y tomar otro) **no se pudo verificar** [P: en el
  set de pruebas se reenvía corregido]. Hasta confirmarlo, la política segura es: **nunca reescribir el XML rechazado;
  guardar el intento fallido y generar uno nuevo con su propia fila en `ecf_envios`**.
- **Saltos en la secuencia:** los e-NCF que se tomaron y no se usaron hay que **anularlos por rangos (ANECF)**;
  la DGII vigila los huecos igual que con las B.
- **«Nunca se envía nada automáticamente a un contador» NO impide enviar el e-CF a la DGII.** Son dos cosas distintas:
  - Enviar el e-CF a la DGII **es la emisión misma**: sin ese envío el comprobante no existe fiscalmente. La DGII es
    la autoridad, no el contador. Es automático por diseño y obligatorio.
  - El **lote mensual** que Victor descarga y manda a su contador (Fase 12) sigue siendo **solo manual**. El correo de
    copia interna a `facturacion@mercamaquinarias.com` sigue siendo el archivo de la empresa, no un envío a un contador.
  - Un proveedor PSFE también recibe los datos para emitir: es un encargado de la emisión, no un contador. Conviene que
    Victor lo sepa antes de firmar, pero no viola la regla.
- **Los informes siguen yendo a `gerencia@inversionesxzt.com`** con la copia aparte a `facturacion@`. Sin cambios.
- **Teléfono:** el XML no lleva teléfono de la empresa. Si el proveedor exige un teléfono de contacto, es dato interno
  del contrato, nunca de la web ni de la RI.
- **Transporte y financiamiento** siguen apagados por `servicios.js`; no interviene.

---

## 6. Qué necesita Victor y en qué orden (hacia atrás desde el corte)

Fecha de corte de planificación: **15 de noviembre**. Si Inversiones XZT resulta ser «mediana» o «grande», todo se
adelanta al **1 de noviembre** y varias fechas de abajo ya son imposibles: por eso la acción 1 es la primera.
El plazo se menciona aquí una vez.

| # | Cuándo (límite) | Acción de Victor | Notas |
|---|---|---|---|
| 1 | **Ya (30-sep / 1-oct)** | Preguntar al contador: (a) grupo de Inversiones XZT según el listado de la DGII; (b) de dónde sale el 30-nov/1-dic; (c) si ya somos emisor electrónico o tenemos secuencias B nuevas asignadas; (d) qué piensa del recibo no fiscal a partir de esa fecha | Sin esto, el resto es a ciegas |
| 2 | 2-oct | Comprobar que tiene **clave de OFV y un dispositivo de seguridad** (token, tarjeta de códigos o token digital) [V] | Sin OFV no se pide nada |
| 3 | **6-oct** | **Pedir el certificado digital** para procedimientos tributarios a una entidad de INDOTEL (Avansi, Viafirma o Digifirma), a nombre de la empresa o del representante | 3-10 días hábiles; es el camino largo; sin él no se avanza en ninguna opción |
| 4 | 9-oct | **Elegir proveedor (PSFE)** y darnos las **credenciales de su sandbox**; contestarle las 10 preguntas de §4 | Sin sandbox no se puede construir contra algo real |
| 5 | 9-oct | **Bajar los PDF y los XSD oficiales** de la DGII (Formato e-CF v1.0, Descripción Técnica v1.6, Informe Técnico, Firmado de e-CF, Formato RFCE, Anulación, y los XSD por tipo) y dejarlos en el repo o pasárnoslos | **El proxy de esta sesión no dejó leerlos.** Son la fuente de verdad; este documento es un mapa, no el contrato |
| 6 | 14-oct | Lanzamiento del sitio con B01/B04 y recibo no fiscal para el consumidor. Guardar 15 B01 y 10 B04 (ver saldo con `node tools/facturas.js secuencias`); confirmar `vence` | No perder tiempo con B02 |
| 7 | **16-oct** | Presentar **«Solicitud para ser Emisor Electrónico» (FI-GDF-016)** en la OFV, con el certificado ya en mano | La respuesta trae el portal de certificación y sus credenciales |
| 8 | 19-oct a 30-oct | Con nosotros: **pruebas de datos, simulación y RI** en el portal; subir los PDF de la RI | Aquí es donde se aprende si el XML de verdad pasa |
| 9 | 31-oct | **Declaración jurada** | Solo Victor o el representante puede firmarla |
| 10 | **~6-nov** | Certificación otorgada; **pedir las secuencias e-NCF** (E31, E32, E34) en la OFV | Que sea «al instante» no está verificado |
| 11 | 9-nov a 13-nov | Pruebas en producción con un comprobante real de poco valor; interruptor en `produccion` | Colchón de una semana |
| 12 | **15-nov** | Corte (en la lectura verificada) | |
| — | 30-nov | Fecha de Victor: solo margen | |

Si el paso 8 o el 9 se pasa de la fecha: activar el **plan de contingencia** — Facturador Gratuito para cada venta o recibo
no fiscal y regularización, y **decir al contador** que hay una contingencia declarada (Reglamento 587-24, cap. IX: hasta
15 días con B y regularizar en 30).

---

## 7. Propuesta de fase para el ROADMAP

**Fase 6.1 (INSERTADA): Facturación electrónica e-CF construida, probada y apagada**
Va **entre la 6 y la 11**. Es un cambio de orden respecto a lo que fijó Victor (transporte → lote → deuda), porque tiene
una fecha legal propia que cae dentro de v2; necesita su visto bueno. Se ejecuta con perfil `quality` (toca NCF e
ITBIS), con Opus.

**Goal:** Que, cuando la DGII certifique a la empresa como emisor electrónico, encender un interruptor baste para emitir
E31, E32 y E34 desde `confirmarPago`, sin cambiar cupos, precios ni el camino de cobro; y que mientras tanto todo el sitio
se comporte exactamente como hoy con B01/B04 y el recibo no fiscal.

**Depends on:** Fase 3 (`confirmarPago` como único punto), Fase 5.1 (fórmula única e ITBIS guardado). **Bloqueos
externos (no son trabajo de una fase, ver §6):** certificado digital, alta de emisor electrónico, credenciales del
sandbox del proveedor. La fase se construye y prueba con un **doble** del proveedor, igual que CardNet con
`tools/cardnet.js`.

**Requisitos (numeración provisional, a registrar en REQUIREMENTS.md):**

- **FE-01** `MERCA_ECF` = `apagado` (por defecto) | `pruebas` | `produccion`. Con `apagado` el sitio se comporta
  exactamente como antes de la fase; con `pruebas` nada toca una secuencia ni una fila fiscal real.
- **FE-02** Migración final: e-NCF de 13 caracteres (`padStart` por tipo), secuencias `E31/E32/E33/E34` con vencimiento,
  columnas `formato`/`ecf_*` en `facturas`, tabla `ecf_envios` de solo añadir. Las B existentes no se tocan.
- **FE-03** Generador determinista del XML de E31, E32 y E34 y del RFCE, contra los XSD vigentes de la DGII, con una
  prueba que recorre todos los planes/precios (redondeo del ITBIS, fecha en hora dominicana, RNC válido).
- **FE-04** Firma XMLDSig con `node:crypto` (o delegada al proveedor), código de seguridad de 6 caracteres y URL del QR,
  con la clave privada fuera del repo; verificación cruzada de la firma con una herramienta independiente.
- **FE-05** Codificador QR sin dependencias y representación impresa e-CF en `tools/pdf.js` (e-NCF, vencimiento de
  secuencia, fecha de firma, QR y código de seguridad), con validación visual.
- **FE-06** Adaptador de proveedor (PSFE) con costura de pruebas: enviar, consultar estado, reintentar; idempotente por
  `pago_id`; sin red en las pruebas.
- **FE-07** Máquina de estados asíncrona (`en proceso` → `aceptado` | `rechazado`) con tarea `ecf` que consulta; el
  correo al cliente solo sale con `aceptado`; el historial en `ecf_envios`; un rechazo nunca reescribe el XML previo.
- **FE-08** `decidirTipo` y `emitirNotaCredito` con E31/E32/E34: el corte lo decide el interruptor, no el reloj;
  E34 puede referenciar una B vieja; sin degradar a B en silencio.
- **FE-09** Anulación por rangos (ANECF) de e-NCF tomados y no usados, más el aviso de huecos.
- **FE-10** Consola: estado e-CF de cada comprobante, reintento manual y el aviso `ncf` adaptado al ciclo E (por escala y
  por vencimiento), con bitácora.
- **FE-11** Guía de encendido en `deploy/README.md`: cómo convertir el `.p12`, dónde vive la clave, cómo pasar de
  `pruebas` a `produccion`, qué hacer en contingencia.
- **FE-12** Ajustar el plan de la Fase 12 para que el lote incluya RI y XML, y la Fase 13 para que los respaldos cubran
  los XML firmados.
- **FE-13** (solo si se elige emisión directa) Endpoints de recepción propios (`fe/autenticacion`, `fe/recepcion`,
  `fe/aprobacioncomercial`) y set de pruebas oficial con un script `tools/ecf-certificar.js`.

**Criterios de éxito (qué debe ser verdad):**
1. Con `MERCA_ECF=apagado`, la batería completa (`auditar`, `facturas:probar`, `transferencia:probar`, `renovacion:probar`
   …) da igual que hoy; los B siguen saliendo con sus secuencias y `decidirTipo` no cambia.
2. Con el doble del proveedor en `pruebas`, un pago aprobado genera un e-CF E31 (con RNC) o E32 (sin), con XML firmado
   guardado, código de seguridad, QR y RI; repetir la confirmación no duplica nada.
3. Un rechazo simulado deja el pago aprobado, el comprobante sin correo al cliente, el intento en `ecf_envios` y ningún
   dato fiscal reescrito.
4. Una anulación emite E34 que referencia al original (incluso si el original es una B01), sin superar su saldo.
5. Cada precio de cada plan produce un XML cuyo ITBIS y total pasan la validación de la DGII con el XSD real.
6. Un cliente puede verificar el e-CF escaneando el QR en el ambiente de pruebas de la DGII (esto solo se comprueba con
   credenciales reales: **criterio humano de Victor**).
7. Ningún camino envía un comprobante a un contador de forma automática; el lote sigue siendo descarga manual.

**Plan de cortes:** 1) migración y secuencias E (con pruebas, Opus), 2) XML + firma + QR + RI, 3) adaptador y máquina de
estados, 4) `decidirTipo`, notas de crédito, consola y guías. Los 1 y 2 se pueden hacer en paralelo con dos agentes si
no tocan los mismos archivos (`db.js` y `facturas.js` lo tocan el 1 y el 4, no el 2).

**Flags de investigación para la fase:** necesita **investigación propia y lectura de los PDF/XSD oficiales** antes de
planificar (FE-03, FE-05); el resto (adaptador, estados, migración) sigue patrones ya usados en CardNet y en `tareas.js`.

---

## 8. Lo que NO se pudo verificar

1. **La fecha de Victor (30-nov/1-dic).** Sin fuente encontrada; lo verificado es 15-nov (pequeños/micro/no clasificados)
   y 1-nov (grandes locales/medianos).
2. **El grupo de Inversiones XZT** en los listados de la DGII.
3. **Qué pasa con las B de pequeños/micro después del 15-nov** (texto exacto).
4. **Que la DGII entregue secuencias B nuevas «al instante»** y que lo siga haciendo hasta el corte.
5. **Cantidad de días de contingencia (15) y de regularización (30)**: viene de un resumen del buscador del cap. IX del 587-24.
6. **Canonicalización (inclusiva o exclusiva) y transformaciones** exactas del perfil de firma: el SDK público usa la
   inclusiva, pero no leí el PDF «Firmado de e-CF». El `SignedInfo` en contexto lo deduje a mano.
7. **Tolerancia del cálculo de ITBIS** (pesos enteros frente a 2 decimales).
8. **Cadencia del RFCE** (por documento, o agrupado).
9. **Qué hace la DGII con el e-NCF de un e-CF rechazado** (reenvío con el mismo número o anulación).
10. **Plazo legal de conservación del XML** (se habla de 10 años, sin fuente).
11. **Estructura exacta de la semilla, el token y los códigos de respuesta**, y su vigencia.
12. **Requisitos exactos de la representación impresa** (lista mínima de campos y tamaño del QR).
13. **Precios de los proveedores** y quién firma con qué certificado (pregunta 1 de §4).
14. **Que siga disponible el certificado gratuito** de la DGII (la fecha límite era 30-sep-2025).
15. **Que un B01 en papel haya perdido valor de crédito fiscal desde el 15-may-2026** para clientes-empresa (un blog).
16. **Duraciones de certificación** (2-8 semanas): solo blogs.
17. **Cifras de sanciones** (las fuentes se contradicen).
18. **Si el Formato 607 se alimenta solo con los e-CF**: relevante para la Fase 12 y para lo que pida el contador.

---

## 9. Fuentes

Todas consultadas **por el buscador** (con la URL y un resumen), salvo la excepción de GitHub. WebFetch a `dgii.gov.do`
y a los blogs contables fue bloqueado por el proxy, así que **no se leyó ningún texto íntegro**.

**Oficiales (DGII, INDOTEL, Presidencia), localizados pero no leídos íntegros:**
- Aviso 06-26, prórroga: https://dgii.gov.do/noticias/Paginas/DGII-otorga-prorroga-seis-meses-Peque%C3%B1os-Micros-y-no-clasificados.aspx
- Presidencia: https://presidencia.gob.do/noticias/dgii-concede-prorroga-de-seis-meses-para-implementacion-de-facturacion-electronica
- Listados de obligados: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Listados-contribuyentes-obligados-implementar-facturacion-electronica.aspx
- Tipos y estructura: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/TipoyEstructurae-CF.aspx
- Asignación de secuencias: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscales/Paginas/secuenciaNCF.aspx
- Aviso de emisión exclusiva (2025): https://dgii.gov.do/publicacionesOficiales/avisosInformativos/Documents/2025/25-25.pdf
- Decreto 587-24: https://dgii.gov.do/legislacion/decretos/Documents/2024/Decreto587-24.pdf
- Proceso de certificación del emisor: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso%20de%20Certificacion%20para%20ser%20Emisor%20Electronico.pdf
- Emisor con proveedor: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Documentaciones%20Proceso%20de%20Certificaci%C3%B3n%20FE/Proceso-Certificacion-EmisorElectronico-Proveedor-Servicios-FECertificado.pdf
- Descripción técnica v1.6: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion-tecnica-de-facturacion-electronica.pdf
- Informe técnico e-CF v1.0: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf
- Formato e-CF v1.0 (oct-2025): https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20(e-CF)%20v1.0.pdf
- Formato RFCE: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Resumen%20Factura%20Consumo%20Electr%C3%B3nica%20v1.0.pdf
- Firmado de e-CF: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Instructivos%20sobre%20Facturaci%C3%B3n%20Electr%C3%B3nica/Firmado%20de%20e-CF.pdf
- Facturador Gratuito: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/facturador-gratuito.aspx
- Preguntas frecuentes del Facturador Gratuito: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Preguntas%20frecuentes/Generales/Preguntas-Frecuentes-Facturador-Gratuito.pdf
- Proveedores autorizados: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Proveedores-servicios-FE-autorizados.aspx
- Entidades de certificación (INDOTEL): https://indotel.gob.do/firma-digital/entidades-de-certificacion/
- Comunidad de Ayuda DGII (E34 sobre B01): https://ayuda.dgii.gov.do/conversations/discusiones/se-puede-anular-una-factura-b01-con-una-nota-de-credito-electronica-e34-los-formatos-admiten-la-diferencia-de-comprobante/659ef10a8361cf480fd1c6e1

**Prensa y consultoras:**
- Diario Libre, 10-sep-2026, no habrá prórroga: https://www.diariolibre.com/economia/negocios/2026/09/10/dgii-advierte-no-habra-prorroga-para-la-factura-electronica/3655048
- Diario Libre, 26-ago-2026, grandes y medianos: https://www.diariolibre.com/economia/energia/2026/08/26/grandes-contribuyentes-emitiran-facturas-electronicas-desde-noviembre/3640336
- Listín Diario: https://listindiario.com/economia/20260828/noviembre-grandes-medianos-contribuyentes-deberan-emitir-facturas-electronicas_919969.html
- KPMG Flash Fiscal: https://kpmg.com/do/es/tendencias/flashes-fiscales/dgii-informa-sobre-la-emision-exclusiva-de-comprobantes-fiscales-electronicos-para-grandes-contribuyentes-locales-y-medianos.html
- EY, prórroga: https://www.ey.com/es_ce/technical/tax/tax-alerts/republica-dominicana-dgii-otorga-prorroga-de-seis-meses-a-contribuyentes-identificados-como-pequenos-micros-y-no-clasificados-para-la-implementacion-de-fe
- EY, Aviso 28-23: https://www.ey.com/es_ce/technical/tax/tax-alerts/republica-dominicana-la-dgii-emite-el-aviso-28-23-sobre-el-vencimiento
- Alegra (calendario y certificado): https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/ · https://blog.alegra.com/republica-dominicana/prorroga-ecf-pymes/ · https://blog.alegra.com/republica-dominicana/certificado-digital-facturacion/
- Viafirma: https://www.viafirma.do/prorroga-facturacion-electronica-dgii/
- Gosocket, Decreto 587-24 y XSD: https://gosocket.net/centro-de-recursos/decreto-587-24-implicaciones-tecnicas-y-operativas-para-la-facturacion-electronica-en-republica-dominicana/ · https://gosocket.net/centro-de-recursos/la-dgii-actualiza-diez-esquemas-de-xsd-e-cf-v-1-0-octubre-2025/
- LLB Solutions, cambios en E33/E34: https://llbsolutions.com/es/dgii-actualiza-los-e-cf-cambios-en-notas-de-debito-y-credito-electronicas-en-2026/
- Alanube (API PSFE): https://developer.alanube.co/ · https://blog.alanube.co/rd/api-factura-electronica/
- Certificación paso a paso (proveedores): https://docs.ecf.mseller.app/docs/certification/process · https://ecf.ssd.com.do/documentacion/core-dgii/ · https://glecf.com/docs/certificacion/

**Código público (fuente secundaria, sí leída):**
- `victors1681/dgii-ecf` (Node/TypeScript, MIT): https://github.com/victors1681/dgii-ecf — de `src/networking/RestApi.ts`,
  `restClient.ts`, `Signature/Signature.ts` y `ecf/ECF.ts` salen las rutas, el multipart y el perfil de firma.
- `dev-fcastro/dgii-ecf` (.NET, portado del anterior): https://github.com/dev-fcastro/dgii-ecf — perfil «C14N inclusivo,
  RSA-SHA256, Reference URI="", enveloped» y código de seguridad = 6 primeros del SignatureValue.

**Prueba local:** scratchpad de la sesión (`spike/firma.js`); no forma parte del repositorio.
