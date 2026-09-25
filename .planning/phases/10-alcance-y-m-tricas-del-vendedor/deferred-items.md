# Fase 10 — hallazgos fuera de alcance

Cosas encontradas mientras se ejecutaban los planes de esta fase que no se tocan aquí
porque no las pidió ningún criterio de éxito de la fase.

## Duplicar no restaura motor ni transmisión (10-03, Tarea 2)

`copiarAnuncio` en `tools/api.js` manda `equipo.motorMarca`, `motorModelo`,
`transmisionMarca` y `transmisionModelo` en la copia, pero `estadoInicial()` en
`assets/publicar.js` no tiene esos campos y `volcarEstadoAlFormulario()` nunca los
asigna a `#e-motor-marca` y compañía. Al duplicar un camión u otro vehículo de
carretera, el asistente no precarga su tren motriz, aunque el original lo tuviera.

No afecta a ningún criterio de éxito de la fase 10 (los equipos usados para probar
—retroexcavadoras y excavadoras— no llevan tren motriz) y arreglarlo bien exige tocar
`estadoInicial()`, `volcarEstadoAlFormulario()` y exponer `pintarTrenMotriz()` fuera de
`montarPasoEquipo()` para poder repoblar sus `<select>` en cadena, igual que se hizo
para categoría → subcategoría → marca → modelo. Queda para quien retome el asistente
de publicar.
