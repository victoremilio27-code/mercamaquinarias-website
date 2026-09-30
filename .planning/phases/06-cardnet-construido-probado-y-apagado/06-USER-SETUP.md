# Phase 6: User Setup Required

**Generated:** 2026-09-25
**Phase:** 06-cardnet-construido-probado-y-apagado
**Status:** Incomplete

Todo el cobro con tarjeta está construido, probado y **apagado**. Sin estos datos,
CardNet no existe para el comprador y el sitio se comporta exactamente como antes de la
fase. Nada de esto se puede hacer sin Victor: son credenciales y trámites con CardNet.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `MERCA_CARDNET` | Victor: `lab` con las credenciales de certificación; `produccion` tras certificar. Vacía = apagado. | `/etc/mercamaquinarias.env` |
| [ ] | `MERCA_CARDNET_LLAVE_PUB` | CardNet: `PublicAccountKey` de la plataforma de **Tokenización** (no la del Botón de Pago) | `/etc/mercamaquinarias.env` |
| [ ] | `MERCA_CARDNET_LLAVE_PRIV` | CardNet: `PrivateAccountKey` de Tokenización | `/etc/mercamaquinarias.env` (chmod 600) |

Ninguna clave va en el repositorio ni en `.env.example`, tampoco las de certificación que
CardNet publica en su documentación.

## Account Setup

- [ ] **Afiliación de comercio con CardNet** pidiendo por escrito la plataforma de
  Tokenización (Card on File) y los casos de uso `Ecommerce_COF` y `MOTO_Recurring`;
  sin ellos las renovaciones se rechazan.
- [ ] **Credenciales de certificación (QA)** de Tokenización, para encender `lab`.

## Dashboard Configuration

- [ ] **Registrar la URL de notificación** en CardNet (la configuran ellos a mano):
  `https://mercamaquinarias.com/api/pagos/cardnet/notificacion`
- [ ] **Preguntas abiertas a CardNet** (06-CONTEXT.md): `DataDo.Invoice` = número de orden y
  no NCF (**si es el NCF, no se enciende**); activación del perfil (¿siempre?, ¿quién manda el
  código?); campos obligatorios de `POST /v1/api/customer`.
- [ ] **¿El cobro recurrente exige algún indicador en `purchase`?** Si lo exige se añade solo
  en `cardnet.cuerpoCompra` (`tools/cardnet.js`); nada más del sitio cambia.
- [ ] **Lo que solo se ve en el laboratorio de CardNet**: la forma del `message` que manda el
  formulario al terminar, que admita ser embebido en un iframe, el alto que necesita para el
  reto 3-D Secure y el orden en que devuelve los perfiles nuevos. Cada uno se corrige en su
  función aislada (lista en la sección 10c, punto 6).

## Verification

```bash
npm run cardnet:probar      # sin red, con CardNet apagado en el entorno
```

El procedimiento completo de encendido está en `deploy/README.md`, **sección 10c «Cobro con
tarjeta (CardNet)»**: qué pedir a CardNet, el respaldo verificado de la base antes de la
migración, encender en `lab`, la URL de notificación, la instalación del temporizador
`mercamaquinarias-pagos`, la lista de comprobación en lab, el paso a `produccion` y cómo
apagar. La lista de comprobaciones manuales por criterio está en `06-VALIDATION.md`.

---

**Once all items complete:** Mark status as "Complete" at top of file.
