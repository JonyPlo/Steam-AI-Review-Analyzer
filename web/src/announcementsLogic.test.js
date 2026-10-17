// Tests unitarios (node:test, sin dependencias) de la lógica de los
// avisos de nuevas features.
// Ejecución: npm test (raíz) o `node --test src/` dentro de web/.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  getActiveAnnouncement,
  cleanSeenIds,
} from './announcementsLogic.js'

// "Hoy" fijo para los tests: 16 de octubre de 2026, mediodía UTC
// (el mismo día base que los tests de fechaLanzamiento).
const NOW = Date.parse('2026-10-16T12:00:00Z')

// Aviso de prueba: por defecto vigente respecto de NOW.
function aviso(id, { addedAt = '2026-10-01', expiresAt = '2026-10-31' } = {}) {
  return { id, title: `T ${id}`, body: `B ${id}`, addedAt, expiresAt }
}

// ---------- getActiveAnnouncement ----------

test('aviso vigente y no visto → lo devuelve', () => {
  const activo = aviso('a1', { addedAt: '2026-10-15', expiresAt: '2026-11-14' })
  assert.equal(getActiveAnnouncement([activo], [], NOW), activo)
})

test('vencido (expiresAt ya pasó) → null', () => {
  const vencido = aviso('a1', { addedAt: '2026-09-01', expiresAt: '2026-10-10' })
  assert.equal(getActiveAnnouncement([vencido], [], NOW), null)
})

test('aún no vigente (addedAt en el futuro) → null', () => {
  const futuro = aviso('a1', { addedAt: '2026-10-20', expiresAt: '2026-11-20' })
  assert.equal(getActiveAnnouncement([futuro], [], NOW), null)
})

test('ya visto (id en seenIds) → null, aunque siga vigente', () => {
  const activo = aviso('a1', { addedAt: '2026-10-15', expiresAt: '2026-11-14' })
  assert.equal(getActiveAnnouncement([activo], ['a1'], NOW), null)
  // seenIds como Set también
  assert.equal(getActiveAnnouncement([activo], new Set(['a1']), NOW), null)
})

test('varios candidatos → el de addedAt más reciente (sin importar el orden de la lista)', () => {
  const viejo = aviso('viejo', { addedAt: '2026-10-01' })
  const medio = aviso('medio', { addedAt: '2026-10-05' })
  const nuevo = aviso('nuevo', { addedAt: '2026-10-10' })
  assert.equal(getActiveAnnouncement([medio, viejo, nuevo], [], NOW), nuevo)
  // El orden de la lista no importa: siempre gana el addedAt más reciente
  assert.equal(getActiveAnnouncement([nuevo, medio, viejo], [], NOW), nuevo)
})

test('varios candidatos, uno ya visto → el siguiente más reciente', () => {
  const medio = aviso('medio', { addedAt: '2026-10-05' })
  const nuevo = aviso('nuevo', { addedAt: '2026-10-10' })
  assert.equal(getActiveAnnouncement([medio, nuevo], ['nuevo'], NOW), medio)
})

test('lista vacía o ausente → null', () => {
  assert.equal(getActiveAnnouncement([], [], NOW), null)
  assert.equal(getActiveAnnouncement(undefined, [], NOW), null)
  assert.equal(getActiveAnnouncement(null, undefined, NOW), null)
})

test('límites de la ventana: addedAt == now incluye; expiresAt == now excluye', () => {
  // addedAt exactamente en NOW → vigente (addedAt <= now)
  const alLance = aviso('a1', { addedAt: '2026-10-16T12:00:00Z', expiresAt: '2026-10-31' })
  assert.equal(getActiveAnnouncement([alLance], [], NOW), alLance)
  // expiresAt exactamente en NOW → vencido (now < expiresAt falla)
  const alSegundo = aviso('a2', { addedAt: '2026-10-01', expiresAt: '2026-10-16T12:00:00Z' })
  assert.equal(getActiveAnnouncement([alSegundo], [], NOW), null)
})

test('fecha inválida en el aviso → queda fuera, sin romper a los demás', () => {
  const roto = { id: 'roto', title: 'T', body: 'B', addedAt: 'no es una fecha', expiresAt: '2026-10-31' }
  const bueno = aviso('bueno', { addedAt: '2026-10-15', expiresAt: '2026-11-14' })
  assert.equal(getActiveAnnouncement([roto, bueno], [], NOW), bueno)
  assert.equal(getActiveAnnouncement([roto], [], NOW), null)
})

test('seenIds ausente → se trata como lista vacía', () => {
  const activo = aviso('a1', { addedAt: '2026-10-15', expiresAt: '2026-11-14' })
  assert.equal(getActiveAnnouncement([activo], undefined, NOW), activo)
})

// ---------- cleanSeenIds ----------

test('tira los ids que ya no están en el registro', () => {
  const seen = { a1: 1, borrado: 2 }
  const resultado = cleanSeenIds(seen, [aviso('a1')], NOW)
  assert.deepEqual(resultado, { a1: 1 })
})

test('tira los ids cuyo aviso ya venció', () => {
  const seen = { vigente: 1, vencido: 2 }
  const registro = [
    aviso('vigente', { addedAt: '2026-10-01', expiresAt: '2026-10-31' }),
    aviso('vencido', { addedAt: '2026-09-01', expiresAt: '2026-10-10' }),
  ]
  assert.deepEqual(cleanSeenIds(seen, registro, NOW), { vigente: 1 })
})

test('conserva los vistos vigentes sin mutar el original', () => {
  const seen = { a1: 100, b2: 200 }
  const registro = [aviso('a1'), aviso('b2', { expiresAt: '2026-11-14' })]
  const resultado = cleanSeenIds(seen, registro, NOW)
  assert.deepEqual(resultado, { a1: 100, b2: 200 })
  assert.deepEqual(seen, { a1: 100, b2: 200 }) // intacto
})

test('seen vacío o ausente → objeto vacío', () => {
  assert.deepEqual(cleanSeenIds({}, [aviso('a1')], NOW), {})
  assert.deepEqual(cleanSeenIds(null, [aviso('a1')], NOW), {})
})
