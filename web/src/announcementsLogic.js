// Lógica pura de los avisos de nuevas features. Sin efecto y sin
// localStorage (el storage vive en el componente AvisoNuevaFeature):
// se puede probar con node:test desde la raíz (npm test).

// Normaliza seenIds a un Set: array (lo normal), Set o string suelto.
function aConjunto(entrada) {
  if (entrada == null) return new Set()
  if (typeof entrada === 'string') return new Set([entrada])
  return new Set(entrada)
}

// Convierte un valor de fecha flexible (Date, ms o string ISO) a ms.
// Si no se puede parsear, devuelve el valor por defecto (NaN marca
// "fecha inválida").
function aMilisegundos(entrada, porDefecto) {
  if (entrada instanceof Date)
    return Number.isNaN(entrada.getTime()) ? porDefecto : entrada.getTime()
  if (typeof entrada === 'number')
    return Number.isFinite(entrada) ? entrada : porDefecto
  if (typeof entrada === 'string') {
    const t = Date.parse(entrada)
    return Number.isFinite(t) ? t : porDefecto
  }
  return porDefecto
}

// Devuelve a lo sumo UN aviso:
// - Candidatos: vigentes (addedAt <= now < expiresAt) cuyo `id` NO está
//   en seenIds.
// - Si hay más de uno, el de `addedAt` más reciente (empate: el que
//   aparece primero en la lista). Los demás no se marcan vistos:
//   siguen elegibles en visitas futuras hasta que venzan, así los
//   avisos nunca se apilan.
// `seenIds` puede ser un array (o Set) de ids ya vistos; `now`, un
// Date, ms o string ISO.
export function getActiveAnnouncement(announcements, seenIds, now) {
  const nowMs = aMilisegundos(now, Date.now())
  const vistos = aConjunto(seenIds)

  let ganador = null
  let ganadorMs = -Infinity
  for (const aviso of announcements ?? []) {
    if (!aviso || typeof aviso.id !== 'string' || vistos.has(aviso.id)) continue
    const desde = aMilisegundos(aviso.addedAt, NaN)
    const hasta = aMilisegundos(aviso.expiresAt, NaN)
    // Fecha inválida: el aviso queda fuera (no se muestra sin certeza)
    if (Number.isNaN(desde) || Number.isNaN(hasta)) continue
    if (desde <= nowMs && nowMs < hasta && desde > ganadorMs) {
      ganador = aviso
      ganadorMs = desde
    }
  }
  return ganador
}

// Limpia el mapa de avisos vistos ({ id: msVisto }) que vive en
// localStorage: tira los ids que ya no están en el registro o cuyo
// aviso ya venció (expiresAt <= now). Devuelve un objeto nuevo; el
// original no se muta.
export function cleanSeenIds(seen, announcements, now) {
  const ahoraMs = aMilisegundos(now, Date.now())
  const porId = new Map()
  for (const aviso of announcements ?? []) {
    if (aviso && typeof aviso.id === 'string') porId.set(aviso.id, aviso)
  }

  const limpio = {}
  for (const [id, vistoMs] of Object.entries(seen ?? {})) {
    const aviso = porId.get(id)
    if (!aviso) continue
    const hasta = aMilisegundos(aviso.expiresAt, NaN)
    // Vencido: se limpia. Fecha de vencimiento inválida: se conserva
    // (no hay forma de saber que expiró).
    if (!Number.isNaN(hasta) && hasta <= ahoraMs) continue
    limpio[id] = typeof vistoMs === 'number' ? vistoMs : Date.now()
  }
  return limpio
}
