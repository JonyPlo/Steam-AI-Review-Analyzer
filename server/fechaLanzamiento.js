// Fecha de lanzamiento de Steam (appdetails), en un módulo sin dependencias
// para poder probarla con node:test sin levantar el server (server.js hace
// listen al importarse, y eso arranca todo el resto junto con él).
//
// El campo llega (con l=english, el formato estable que pedimos a propósito)
// como objeto { coming_soon, date } — ej.: { coming_soon: false, date: 'Oct 3,
// 2026' } — o como string plano en respuestas antiguas, o ausente.
// "Coming soon", "To be announced", vacío o cualquier cosa que no matchea → null.

const DIA_MS = 24 * 60 * 60 * 1000

// Meses en inglés, por nombre (corto o completo), case-insensitive.
const MESES = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

// FUNCIÓN AUXILIAR: parsea la fecha de lanzamiento de Steam y la devuelve como
// un Date a medianoche UTC (o null si no se puede). Tolerancias:
//   'Oct 3, 2026' / '3 Oct, 2026'  (con o sin coma) → fecha completa
//   'Oct 2026'                      → día 1 del mes
//   '2026'                         → 1 de enero
//   'Coming soon' / 'To be announced' / '' / null → null
// Acepta también el objeto crudo de appdetails ({ coming_soon, date }): se
// desarma acá para que el llamado no tenga que preocuparse por el shape.
export function parseSteamReleaseDate(valor) {
  const texto = (
    typeof valor === 'string' ? valor : (valor?.date ?? '')
  )
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!texto) return null

  let m
  if ((m = texto.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/))) {
    // '3 Oct 2026' (formato EU, el que trae appdetails en inglés)
    return fechaUtc(+m[3], MESES[m[2]], +m[1])
  }
  if ((m = texto.match(/^([a-z]+) (\d{1,2}) (\d{4})$/))) {
    // 'Oct 3 2026' (formato US)
    return fechaUtc(+m[3], MESES[m[1]], +m[2])
  }
  if ((m = texto.match(/^([a-z]+) (\d{4})$/))) {
    // 'Oct 2026' (mes sin día): no hay día que recuperar, se toma el 1
    return fechaUtc(+m[2], MESES[m[1]], 1)
  }
  if ((m = texto.match(/^(\d{4})$/))) {
    // '2026' (solo año): se toma 1 de enero
    return fechaUtc(+m[1], 0, 1)
  }
  return null // 'coming soon', 'to be announced', basura: sin fecha
}

// Medianoche UTC con validación de día: evita el rollover de Date.UTC
// ('31 Feb' no existe y debe dar null, no "3 de marzo").
function fechaUtc(anio, mes, dia) {
  if (mes === undefined || anio < 1000 || anio > 2999 || dia < 1 || dia > 31)
    return null
  const d = new Date(Date.UTC(anio, mes, dia))
  if (d.getUTCMonth() !== mes || d.getUTCDate() !== dia) return null
  return d
}

// FUNCIÓN AUXILIAR: diferencia entera en días entre hoy (a medianoche UTC) y
// la fecha de lanzamiento: 0 = salió hoy, 1 = salió ayer, negativa = aún no
// se lanza (fecha en el futuro). Ambas fechas son a medianoche UTC, así la
// resta es exacta y no hay redondeos de huso. Sin fecha → null (el endpoint
// la propaga como daysSinceRelease = null).
export function diasDesdeLanzamiento(fecha, ahora = new Date()) {
  if (!fecha) return null
  const hoyUtc = Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    ahora.getUTCDate(),
  )
  return Math.round((hoyUtc - fecha.getTime()) / DIA_MS)
}

// FUNCIÓN AUXILIAR: decide si el panel histórico aporta algo usando solo las
// dos muestras de reseñas — el fallback para cuando NO hay fecha de
// lanzamiento parseable. Aporta si la muestra completa trae algún id que no
// está en la ventana de 30 días, es decir, si existe material más vieja que
// la ventana. (No se puede comparar el query_summary con/sin day_range:
// Steam ignora el parámetro en el summary, ver la nota en /analizar.)
export function muestraHistoricaAporta(listaRecientes, listaHistorica) {
  if (!listaHistorica || listaHistorica.length === 0) return false
  const ids30Dias = new Set(
    (listaRecientes || [])
      .map((r) => r.recommendationid)
      .filter((id) => id !== undefined && id !== null),
  )
  return listaHistorica.some((r) => !ids30Dias.has(r.recommendationid))
}
