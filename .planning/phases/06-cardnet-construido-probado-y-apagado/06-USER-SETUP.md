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
  no NCF; activación del perfil (¿siempre?, ¿quién manda el código?); campos obligatorios de
  `POST /v1/api/customer`.

## Verification

```bash
npm run cardnet:probar      # sin red, con CardNet apagado en el entorno
```

Con las credenciales de QA puestas en el VPS en modo `lab`, la prueba manual está en
`deploy/README.md`, sección CardNet (la escribe 06-08).

---

**Once all items complete:** Mark status as "Complete" at top of file.
