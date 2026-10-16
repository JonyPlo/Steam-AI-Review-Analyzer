// Tests unitarios (node:test, sin dependencias) de parseSteamReleaseDate y
// del cálculo de días que decide si el panel histórico aplica.
// Ejecución: npm test (raíz) o `node --test` dentro de server/.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseSteamReleaseDate,
  diasDesdeLanzamiento,
  muestraHistoricaAporta,
} from './fechaLanzamiento.js'

// "Hoy" fijo para los tests: 16 de octubre de 2026, medianoche UTC.
const HOY = new Date(Date.UTC(2026, 9, 16))

// ---------- parseSteamReleaseDate ----------

test('parsea el formato EU "3 Oct, 2026" (el que trae appdetails en inglés)', () => {
  const f = parseSteamReleaseDate('3 Oct, 2026')
  assert.equal(f.toISOString(), '2026-10-03T00:00:00.000Z')
})

test('parsea el formato US "Oct 3, 2026"', () => {
  const f = parseSteamReleaseDate('Oct 3, 2026')
  assert.equal(f.toISOString(), '2026-10-03T00:00:00.000Z')
})

test('parsea sin coma: "Oct 3 2026" y "3 Oct 2026"', () => {
  assert.equal(parseSteamReleaseDate('Oct 3 2026').toISOString(), '2026-10-03T00:00:00.000Z')
  assert.equal(parseSteamReleaseDate('3 Oct 2026').toISOString(), '2026-10-03T00:00:00.000Z')
})

test('mes sin día: "Oct 2026" → día 1 del mes', () => {
  const f = parseSteamReleaseDate('Oct 2026')
  assert.equal(f.toISOString(), '2026-10-01T00:00:00.000Z')
})

test('solo año: "2026" → 1 de enero', () => {
  const f = parseSteamReleaseDate('2026')
  assert.equal(f.toISOString(), '2026-01-01T00:00:00.000Z')
})

test('nombres de mes largos ("October 3, 2026") y case-insensitive', () => {
  assert.equal(parseSteamReleaseDate('October 3, 2026').toISOString(), '2026-10-03T00:00:00.000Z')
  assert.equal(parseSteamReleaseDate('3 OCT 2026'.toLowerCase()).toISOString(), '2026-10-03T00:00:00.000Z')
  assert.equal(parseSteamReleaseDate('  oct 3 , 2026  ').toISOString(), '2026-10-03T00:00:00.000Z')
})

test('acepta el objeto crudo de appdetails { coming_soon, date }', () => {
  const f = parseSteamReleaseDate({ coming_soon: false, date: 'Oct 3, 2026' })
  assert.equal(f.toISOString(), '2026-10-03T00:00:00.000Z')
  // coming_soon: la date dice "Coming soon" → null aunque el flag también lo marque
  assert.equal(parseSteamReleaseDate({ coming_soon: true, date: 'Coming soon' }), null)
})

test('"Coming soon" y "To be announced" → null', () => {
  assert.equal(parseSteamReleaseDate('Coming soon'), null)
  assert.equal(parseSteamReleaseDate('To be announced'), null)
})

test('vacío, null, undefined y texto inválido → null', () => {
  assert.equal(parseSteamReleaseDate(''), null)
  assert.equal(parseSteamReleaseDate(null), null)
  assert.equal(parseSteamReleaseDate(undefined), null)
  assert.equal(parseSteamReleaseDate({}), null)
  assert.equal(parseSteamReleaseDate('no es una fecha'), null)
  assert.equal(parseSteamReleaseDate('123'), null)
  assert.equal(parseSteamReleaseDate('Oct 2026 extra'), null)
})

test('fechas imposibles → null (sin rollover de Date.UTC)', () => {
  assert.equal(parseSteamReleaseDate('31 Feb, 2026'), null)
  assert.equal(parseSteamReleaseDate('Feb 30, 2026'), null)
  assert.equal(parseSteamReleaseDate('0 Oct, 2026'), null)
  assert.equal(parseSteamReleaseDate('Oct 32, 2026'), null)
})

test('meses desconocidos → null', () => {
  assert.equal(parseSteamReleaseDate('Xpt 3, 2026'), null)
  assert.equal(parseSteamReleaseDate('3 Xpt, 2026'), null)
})

// ---------- días desde el lanzamiento (el cálculo que decide el panel) ----------

test('exactly 30 días → 30, y el panel histórico NO aplica (<= 30)', () => {
  // 16 de septiembre → 16 de octubre: 30 días exactos
  const f = parseSteamReleaseDate('16 Sep, 2026')
  const dias = diasDesdeLanzamiento(f, HOY)
  assert.equal(dias, 30)
  assert.equal(dias > 30, false)
})

test('exactly 31 días → 31, y el panel histórico SÍ aplica (> 30)', () => {
  // 15 de septiembre → 16 de octubre: 31 días exactos
  const f = parseSteamReleaseDate('15 Sep, 2026')
  const dias = diasDesdeLanzamiento(f, HOY)
  assert.equal(dias, 31)
  assert.equal(dias > 30, true)
})

test('salió hoy → 0; salió ayer → 1; ambos sin histórico', () => {
  assert.equal(diasDesdeLanzamiento(parseSteamReleaseDate('Oct 16, 2026'), HOY), 0)
  assert.equal(diasDesdeLanzamiento(parseSteamReleaseDate('Oct 15, 2026'), HOY), 1)
  assert.equal(diasDesdeLanzamiento(parseSteamReleaseDate('Oct 15, 2026'), HOY) > 30, false)
})

test('mensual (sin día): "Sep 2026" → día 1; cuenta desde el 1', () => {
  // 1 de septiembre → 16 de octubre: 45 días → histórico sí aplica
  const f = parseSteamReleaseDate('Sep 2026')
  const dias = diasDesdeLanzamiento(f, HOY)
  assert.equal(dias, 45)
  assert.equal(dias > 30, true)
})

test('solo año: "2024" → 1 de enero de 2024, histórico sí aplica', () => {
  const f = parseSteamReleaseDate('2024')
  const dias = diasDesdeLanzamiento(f, HOY)
  assert.ok(dias > 30)
  // 1 enero 2024 → 16 octubre 2026: 1019 días (2024 es bisiesto)
  assert.equal(dias, 1019)
})

test('juego sin lanzar (fecha futura) → días negativos, sin histórico y sin NaN', () => {
  const f = parseSteamReleaseDate('Nov 1, 2026')
  const dias = diasDesdeLanzamiento(f, HOY)
  assert.equal(dias, -16)
  assert.equal(dias > 30, false)
  assert.ok(Number.isFinite(dias))
})

test('sin fecha (null) → días null (el endpoint decide con las reseñas)', () => {
  const f = parseSteamReleaseDate('Coming soon')
  assert.equal(f, null)
  assert.equal(diasDesdeLanzamiento(f, HOY), null)
  // El endpoint guarda daysSinceRelease = null y el frontend no muestra
  // subtítulo con null (ver subtituloLanzamiento en App.jsx).
})

test('fallback sin fecha: histórico vacío → no aporta', () => {
  assert.equal(muestraHistoricaAporta([{ recommendationid: 1 }], []), false)
  assert.equal(muestraHistoricaAporta([], null), false)
})

test('fallback sin fecha: historia entera dentro de los 30 días → no aporta', () => {
  const recientes = [{ recommendationid: 1 }, { recommendationid: 2 }]
  const historicas = [{ recommendationid: 2 }, { recommendationid: 1 }]
  assert.equal(muestraHistoricaAporta(recientes, historicas), false)
})

test('fallback sin fecha: hay material más vieja que la ventana → aporta', () => {
  const recientes = [{ recommendationid: 1 }]
  const historicas = [{ recommendationid: 1 }, { recommendationid: 999 }]
  assert.equal(muestraHistoricaAporta(recientes, historicas), true)
})

test('fallback sin fecha: sin reseñas en 30 días pero sí históricas → aporta', () => {
  assert.equal(muestraHistoricaAporta([], [{ recommendationid: 5 }]), true)
})

test('cruce del umbral: guardado con 30 días, reevaluado al día siguiente → histórico', () => {
  // Simula la entrada de caché: el análisis se guardó el 16/10 cuando el
  // juego tenía exactamente 30 días (showHistorical=false). Al día
  // siguiente (17/10) tiene 31 → debe recalcular a true.
  const release = parseSteamReleaseDate('16 Sep, 2026')
  const alDiaSiguiente = new Date(Date.UTC(2026, 9, 17))
  const diasAntes = diasDesdeLanzamiento(release, HOY)
  const diasDespues = diasDesdeLanzamiento(release, alDiaSiguiente)
  assert.equal(diasAntes > 30, false) // al guardarlo: sin histórico (correcto)
  assert.equal(diasDespues > 30, true) // al recargar: histórico (correcto)
})
