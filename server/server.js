import express from 'express'
import axios from 'axios'
import 'dotenv/config'
import Groq from 'groq-sdk' // Importamos el SDK de Groq

// Helpers puros de fecha de lanzamiento (módulo aparte para poder
// probarlos con node:test sin levantar el server; ver fechaLanzamiento.js)
import {
  parseSteamReleaseDate,
  diasDesdeLanzamiento,
  muestraHistoricaAporta,
} from './fechaLanzamiento.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET

// Inicializamos Groq (null si no hay key: la cascada salta a los siguientes proveedores)
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null

const app = express()
const PORT = process.env.PORT || 3001

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept',
  )
  next()
})

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// User-Agent de navegador para TODAS las peticiones de /analizar a Steam. Axios
// desde Node no manda ninguno por defecto, y un endpoint de datos sin UA es un
// fingerprint de bot: tras golpetear `appreviews` varios días, Steam pasó a
// limitar la IP (302 → portada o 429) y la app "de la nada" dejó de generar
// resúmenes (verificar 10/2026).
const UA_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Mensaje de usuario para el 503 de throttle de Steam: App.jsx lo muestra en el
// detalle de la pantalla de error de la sala (lee json.error).
const MSG_STEAM_BLOQUEADO =
  'Steam está limitando las peticiones desde esta red por ahora (filtro anti-bot). No es un fallo de la app: probá de nuevo en unos minutos u horas.'

// Sube cuando Steam está limitando el acceso de esta IP: 429/403/503 directo, o
// el 302 → portada que axios sigue y convierte en HTML con 200. Antes ese 302 se
// leía en silencio como "0 reseñas" (la sala decía "insuficientes" para cualquier
// juego y la IA no corrió) y el 429 caía al 500 genérico. El endpoint lo traduce
// en un 503 con mensaje claro.
class ErrorSteamBloqueado extends Error {}

function esErrorThrottleSteam(err) {
  const s = err?.response?.status
  return s === 429 || s === 403 || s === 503
}

// Steam limitado responde 302 → portada: axios sigue el redirect y devuelve el
// HTML de la home con status 200. El JSON real de Steam siempre llega parseado
// como objeto; si el cuerpo llega como string, es HTML (bloqueo).
function esCuerpoHtml(respuesta) {
  return !respuesta?.data || typeof respuesta.data !== 'object'
}

// GET a Steam con UA de navegador y UN reintento tras pausa si el bloqueo
// parece transitorio (429/403/503): el throttle dura minutos/horas, pero un
// reintento barato atrapa el momento en que cede. Si el reintento sigue
// bloqueado (o llega con HTML), sube ErrorSteamBloqueado; cualquier otro error
// se repasa tal cual para que lo maneje el catch de cada caller.
async function pedirSteam(url) {
  const hacer = () => axios.get(url, { headers: { 'User-Agent': UA_NAVEGADOR } })
  try {
    const r = await hacer()
    if (esCuerpoHtml(r)) throw new ErrorSteamBloqueado()
    return r
  } catch (err) {
    if (err instanceof ErrorSteamBloqueado) throw err
    if (esErrorThrottleSteam(err)) {
      await esperar(2500)
      const r = await hacer()
      if (esCuerpoHtml(r)) throw new ErrorSteamBloqueado()
      return r
    }
    throw err
  }
}

// FUNCIÓN AUXILIAR: Obtener Token de IGDB
async function obtenerIgdbToken() {
  try {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`
    const respuesta = await axios.post(url)
    return respuesta.data.access_token
  } catch (error) {
    console.error('Error obteniendo Token de IGDB:', error.message)
    return null
  }
}

// ENDPOINT 1: Buscador optimizado para renderizar las tarjetas del listado
// Desescapa las entidades HTML básicas que aparecen en los nombres del store.
function desescaparHTML(texto) {
  return texto
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// La página de resultados del store es HTML server-rendered. CADA JUEGO es
// un <a href=".../app/{ID}/..." ... class="search_result_row ..."> completo
// que contiene su título e imagen. El id se toma del href del propio tag:
// así id, título e imagen pertenecen a la misma fila por construcción.
// (NO dividir por el string "search_result_row" y tomar el primer
// data-ds-appid del trozo: en varias variantes del markup la class lleva
// tokens extra —"search_result_row ds_collapse_flag"— y el data-ds-appid va
// ANTES de la class, por lo que ese método caía al id de la fila siguiente
// o perdía filas enteras.)
// ponytail: scraping regex de un HTML que Steam puede cambiar; si falla, /buscar
// cae al fallback de storesearch (10 juegos). Upgrade path: API oficial de búsqueda.
function parsearResultadosSteam(html) {
  const filas = []
  const vistos = new Set()
  const reFila = /<a[^>]*class="search_result_row[^"]*"[^>]*>/g
  const matches = [...html.matchAll(reFila)]
  for (let i = 0; i < matches.length && filas.length < 20; i++) {
    const tag = matches[i][0]
    const inicio = matches[i].index
    const fin = i + 1 < matches.length ? matches[i + 1].index : inicio + tag.length + 4000
    const contenido = html.slice(inicio + tag.length, fin)
    const mHref = tag.match(/store\.steampowered\.com\/(?:app|agecheck\/app)\/(\d+)/)
    const mDs = tag.match(/data-ds-appid="(\d+)"/)
    const mNombre = contenido.match(/<span class="title">([^<]+)<\/span>/)
    const appId = mHref?.[1] || mDs?.[1]
    if (appId && mNombre && !vistos.has(appId)) {
      vistos.add(appId)
      filas.push({ appId, name: desescaparHTML(mNombre[1].trim()) })
    }
  }
  return filas
}

// FUNCIÓN AUXILIAR: extrae el `data` de una respuesta de /api/appdetails.
// OJO (cambio de Steam, 2026): para juegos registrados recientemente la
// respuesta NO viene keyeada por el appid pedido, sino por un id interno
// distinto (ej.: appids=3764200 responde con la clave "4460240", pero
// adentro data.steam_appid=3764200). Por eso NO se lee res.data[appId] a
// ciegas: se matchea por data.steam_appid, que siempre es el id real. Los
// juegos viejos siguen keyeados por el id pedido y ese match también los
// cubre. Si no matchea nadie pero hay una sola entrada con success=true,
// usamos esa: estas llamadas se hacen de a 1 appid por request, no hay
// ambigüedad.
function tomarDetailsAppdetails(respuesta, appId) {
  const cuerpo = respuesta?.data || {}
  const entradas = Object.values(cuerpo)
  const match = entradas.find(
    (e) => e?.success && Number(e?.data?.steam_appid) === Number(appId),
  )
  if (match) return match.data || {}
  const unica = entradas.find((e) => e?.success)
  return unica?.data || {}
}

app.get('/buscar', async (req, res) => {
  const { name } = req.query
  if (!name) return res.json([])

  try {
    // 1. Fuente de juegos: la página de resultados del store (SSR, 20+ por consulta).
    //    Si falla, fallback al API storesearch (topado en 10).
    let topJuegos = []
    try {
      const urlPagina = `https://store.steampowered.com/search/results/?term=${encodeURIComponent(name)}&f=games&cc=AR&l=spanish`
      const pagina = await axios.get(urlPagina, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      topJuegos = parsearResultadosSteam(pagina.data)
    } catch (err) {
      console.warn('HTML de resultados no disponible, uso storesearch:', err.message)
    }

    if (topJuegos.length === 0) {
      const urlBusqueda = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=spanish&cc=AR`
      const respuestaBusqueda = await axios.get(urlBusqueda)
      const items = respuestaBusqueda.data?.items || []
      topJuegos = items.slice(0, 20).map((j) => ({
        appId: j.id.toString(),
        name: j.name,
        capsule: j.tiny_image || null,
      }))
    }

    // 2. Enriquecemos cada juego en paralelo con DOS fuentes de Steam:
    //    - appdetails (la MISMA que usa la sala y la grilla de inicio):
    //      nombre OFICIAL + URLs de imagen REALES del juego. Nunca se
    //      confía en el nombre/imagen del HTML ni en URLs conjeturadas:
    //      la página de resultados entrega el título de cada fila
    //      desalineado respecto a su data-ds-appid (cada título
    //      corresponde al appid de la fila de al lado), y el patrón
    //      apps/{id}/header.jpg da 404 en varios juegos. Appdetails
    //      garantiza que nombre, imagen y clic siempre sean del mismo
    //      juego, porque todo sale del mismo appid.
    //    - appreviews: cantidad de reseñas + polaridad.
    const promesasEnriquecer = topJuegos.map(async (juego) => {
      const appId = juego.appId

      const [resDetails, resSummary] = await Promise.all([
        axios
          .get(`https://store.steampowered.com/api/appdetails?appids=${appId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          .catch(() => null),
        axios
          .get(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all&num_per_page=0`)
          .catch(() => null),
      ])

      // La clave del JSON no siempre es el appid pedido (ver helper).
      const details = tomarDetailsAppdetails(resDetails, appId)
      const summary = resSummary?.data?.query_summary || {}

      return {
        appId,
        // Nombre oficial de appdetails; solo si falla, el de la búsqueda.
        name: details.name || juego.name,
        // Imágenes reales de appdetails (mismas URLs que la grilla de
        // inicio y la portada de la sala); si no, URL estándar.
        header_image:
          details.header_image ||
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
        // El dropdown prefiere `capsule_image` (231×87) sobre `capsule_imagev5`
        // (184×69): un poquito más nítida en el mismo espacio.
        capsule_image:
          details.capsule_image ||
          details.capsule_imagev5 ||
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`,
        total_reviews: summary.total_reviews || 0,
        review_score_desc: summary.review_score_desc || 'Sin análisis',
      }
    })

    const resultadosTarjetas = await Promise.all(promesasEnriquecer)
    return res.json(resultadosTarjetas)
  } catch (error) {
    console.error('Error en el buscador de tarjetas:', error.message)
    return res
      .status(500)
      .json({ error: 'Error al procesar la búsqueda en Steam.' })
  }
})

// Todos los comentarios que terminan en el análisis (contexto Y destacados) tienen que
// pesar 400 caracteres o menos EN EL ORIGINAL. Esto es intencional incluso sabiendo que una
// traducción (ej. desde chino/japonés, idiomas muy "densos") puede expandirse varias veces:
// por eso además hay un tope duro post-traducción más abajo (MAX_CARACTERES_DESTACADO_TRADUCIDO).
const MAX_CARACTERES_COMENTARIO = 400
// Tope de seguridad DESPUÉS de traducir un destacado. No depende del idioma original: pase lo
// que pase en la traducción, un destacado nunca puede superar este largo en el resultado final.
const MAX_CARACTERES_DESTACADO_TRADUCIDO = 900
const SEGUNDOS_30_DIAS = 30 * 24 * 60 * 60

// FUNCIÓN AUXILIAR: Limpia caracteres invisibles y espacios raros del texto
function limpiarTextoResena(texto) {
  if (!texto) return ''
  return texto
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
}

// FUNCIÓN AUXILIAR: traduce la clasificación oficial de Steam (Overwhelmingly Positive, Mixed,
// etc.) al español. Se usa SOLO en el cierre de la columna "históricos" (reseñas generales),
// que es la que se basa en el % oficial de Steam (miles de reseñas).
function traducirDescripcionValve(desc) {
  if (!desc) return 'sin datos suficientes'
  const traducciones = {
    'Overwhelmingly Positive': 'extremadamente positivas',
    'Very Positive': 'muy positivas',
    'Mostly Positive': 'mayormente positivas',
    Positive: 'positivas',
    Mixed: 'mixtas',
    'Mostly Negative': 'mayormente negativas',
    Negative: 'negativas',
    'Very Negative': 'muy negativas',
    'Overwhelmingly Negative': 'extremadamente negativas',
    'No user reviews': 'sin reseñas de usuarios',
  }
  return traducciones[desc] || desc.toLowerCase()
}

// FUNCIÓN AUXILIAR: veredicto determinístico en base a un %, usado SOLO como fallback de la
// columna "recientes" si falla la IA (para que el cierre nunca quede vacío).
function veredictoSegunPct(pct) {
  if (pct === null)
    return 'no hay reseñas suficientes como para sacar una conclusión confiable'
  if (pct >= 85) return 'se recomienda su compra'
  if (pct >= 70) return 'vale la pena probarlo'
  if (pct >= 50)
    return 'conviene leer un poco más antes de decidir, ya que las opiniones están bastante divididas'
  return 'conviene esperar antes de comprarlo, dado que predominan las críticas'
}

// FUNCIÓN AUXILIAR: Detecta reseñas basura (plantillas, ASCII art, vacías, etc.)
// Se usa más abajo en obtenerResenasFiltradas; en JS las function declarations se "hoistean",
// así que no importa que esté definida después en el archivo.

// FUNCIÓN AUXILIAR: Pagina reseñas de Steam usando el cursor, filtrando basura y longitud
// A MEDIDA que van llegando. El objetivo es juntar `objetivoFiltradas` reseñas válidas
// (≤ MAX_CARACTERES_COMENTARIO caracteres, no-basura, y dentro del rango de fecha si aplica).
// Si con la primera tanda no alcanza, sigue pidiendo páginas de a `perPage` hasta lograrlo,
// hasta agotar las reseñas del juego, o hasta `maxCrudasTotal` como tope de seguridad
// (para juegos con cientos de miles de reseñas no nos quedamos pidiendo para siempre).
//
// El pool de 70 es a propósito (bajado de 150): armarInsumosDeResenas solo consume el
// top 50 (50 de contexto + 2 destacados, menos hasta 2 excluidos entre columnas) y la
// mitad de requests es lo que desinfla el golpeteo a `appreviews` que hace que Steam
// limite la IP. 70 deja margen para la dedup entre columnas sin pedir de más.
//
// Si Steam limita la IP a mitad de paginar, sube ErrorSteamBloqueado (vía pedirSteam):
// mejor un 503 honesto del endpoint que seguir "con éxito" una lista vacía o a medias.
async function obtenerResenasFiltradas(
  appId,
  {
    dayRange = null,
    objetivoFiltradas = 70,
    maxCrudasTotal = 700,
    perPage = 100,
    filtroAdicional = () => true,
  } = {},
) {
  let cursor = '*'
  let crudasProcesadas = 0
  const filtradas = []

  while (crudasProcesadas < maxCrudasTotal) {
    const params = new URLSearchParams({
      json: 1,
      filter: 'all', // 'all' = ordenadas por utilidad/votos, necesario para que day_range funcione
      language: 'all',
      num_per_page: perPage,
      cursor,
    })
    // OJO: si no se manda day_range, Steam NO devuelve "las más valoradas de todo el historial",
    // sino solo dentro de una ventana reciente por default. Para pedir de verdad "todo el
    // historial" hay que forzar el máximo de un int64. Cuando sí queremos una ventana chica
    // (ej. últimos 30 días) usamos el dayRange recibido.
    params.set('day_range', dayRange ?? '9223372036854775807')

    let data
    try {
      // pedirSteam lleva la UA de navegador y el reintento único ante
      // throttle; si el bloqueo persiste sube ErrorSteamBloqueado.
      const respuesta = await pedirSteam(
        `https://store.steampowered.com/appreviews/${appId}?${params.toString()}`,
      )
      data = respuesta.data
    } catch (err) {
      if (err instanceof ErrorSteamBloqueado) throw err
      console.error(`Error paginando reseñas de ${appId}:`, err.message)
      break
    }

    const reviews = data?.reviews || []
    if (reviews.length === 0) break

    crudasProcesadas += reviews.length

    for (const r of reviews) {
      if (esComentarioBasura(r)) continue
      if (limpiarTextoResena(r.review).length > MAX_CARACTERES_COMENTARIO)
        continue
      if (!filtroAdicional(r)) continue
      filtradas.push(r)
    }

    // Ya juntamos suficientes candidatas válidas, no hace falta seguir pidiendo páginas
    if (filtradas.length >= objetivoFiltradas) break
    // No hay más páginas (se acabaron las reseñas del juego, típico de indies/juegos nuevos)
    if (!data.cursor || reviews.length < perPage) break

    cursor = data.cursor
  }

  return filtradas
}

// FUNCIÓN AUXILIAR: Detecta reseñas basura (plantillas, ASCII art, vacías, etc.)
function esComentarioBasura(reviewObj) {
  const texto = limpiarTextoResena(reviewObj.review)
  if (!texto || texto.length < 3) return true

  // Plantillas tipo "---{ Graphics }---" con checkboxes
  if (/---\{[^}]+\}---/.test(texto)) return true
  const checkboxes = (texto.match(/[☑☐✓✗]/g) || []).length
  if (
    checkboxes >= 5 &&
    /graphics|gameplay|audio|audience|difficulty|grind|story|price|bugs/i.test(
      texto,
    )
  ) {
    return true
  }

  // ASCII / Braille art (gigachad, etc.): pocos caracteres alfabéticos o muchos bloques
  const letras = (texto.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9]/g) || []).length
  const bloques = (texto.match(/[\u2800-\u28FF⣿⡿⠿█▀▄▌▐░▒▓]/g) || []).length
  if (texto.length >= 80) {
    if (letras / texto.length < 0.12) return true
    if (bloques / texto.length > 0.25) return true
  }

  // Solo emojis / símbolos repetidos sin contenido real
  if (letras < 8 && texto.length > 20) return true

  return false
}

// FUNCIÓN AUXILIAR: Calcula qué tan "valorada" es una reseña combinando
// votos útiles, votos graciosos, el weighted_vote_score de Steam y las reacciones.
function calcularValoracion(review) {
  const votosArriba = review.votes_up || 0
  const votosGraciosos = review.votes_funny || 0
  const pesoSteam = parseFloat(review.weighted_vote_score || 0) * 100
  const reacciones = (review.reactions || []).reduce(
    (acc, r) => acc + (r.count || 0),
    0,
  )
  return votosArriba * 3 + votosGraciosos + pesoSteam + reacciones
}

// FUNCIÓN AUXILIAR: Convierte una reseña cruda al objeto que consume el frontend
function formatearDestacado(review) {
  const reacciones = (review.reactions || []).reduce(
    (acc, r) => acc + (r.count || 0),
    0,
  )
  const wvs = parseFloat(review.weighted_vote_score || 0)
  const minutosJugados = review.author?.playtime_at_review || 0
  return {
    recommendationid: review.recommendationid,
    review: limpiarTextoResena(review.review).slice(
      0,
      MAX_CARACTERES_COMENTARIO,
    ), // red de seguridad; ya viene ≤400
    language: review.language || '',
    voted_up: review.voted_up,
    votes_up: review.votes_up || 0,
    votes_funny: review.votes_funny || 0,
    weighted_vote_score: Math.round(wvs * 100),
    reactions: reacciones,
    timestamp_created: review.timestamp_created,
    timestamp_updated: review.timestamp_updated,
    fue_modificado: review.timestamp_updated > review.timestamp_created,
    autorNombre: review.author?.personaname || 'Usuario de Steam',
    autorPerfilUrl: review.author?.profile_url || null,
    horasJugadas: Math.round((minutosJugados / 60) * 10) / 10,
  }
}

// Idiomas donde un carácter representa mucha más información que en español (sistemas
// logográficos/silábicos: un símbolo puede equivaler a una palabra entera). Al traducirlos,
// el resultado se expande varias veces respecto al original. El ruso, por ejemplo, NO entra acá:
// el cirílico es alfabético como el español, un carácter ≈ un sonido, no hay expansión rara.
// Los valores son los códigos de idioma que usa la propia API de Steam.
const IDIOMAS_DENSOS = new Set(['schinese', 'tchinese', 'japanese', 'koreana'])
// Si un candidato a destacado está en uno de esos idiomas, tiene que ser bien cortito en el
// original (≤50 caracteres) para que la traducción no termine siendo un párrafo gigante.
const MAX_CARACTERES_DESTACADO_IDIOMA_DENSO = 50

// FUNCIÓN AUXILIAR: decide si un comentario puede ser destacado (no si va a la IA de contexto,
// eso no tiene esta restricción). Todo lo que no sea idioma denso ya pasó el filtro de 400
// caracteres en el fetch, así que no hace falta chequear nada más ahí.
function calificaComoDestacado(review) {
  if (!IDIOMAS_DENSOS.has(review.language)) return true
  return (
    limpiarTextoResena(review.review).length <=
    MAX_CARACTERES_DESTACADO_IDIOMA_DENSO
  )
}

// FUNCIÓN AUXILIAR: A partir de un pool YA FILTRADO (sin basura, ≤ MAX_CARACTERES_COMENTARIO,
// y ya dentro del rango de fecha correspondiente — ver obtenerResenasFiltradas), arma:
// - el texto de contexto para la IA (top 50 más valoradas, sin los 2 destacados)
// - los 2 comentarios destacados (los más valorados del top 50)
// - pctMuestra: el % de reseñas positivas DENTRO de esta muestra de 50 (NO es el % oficial de
//   Steam). Se usa únicamente en el cierre de la columna "recientes" (ver procesarColumna).
function armarInsumosDeResenas(reviews, { excluirIds = new Set() } = {}) {
  // Excluimos duplicados entre columnas (para que un destacado de "recientes" no se repita
  // también como destacado de "históricos") y, por las dudas, re-chequeamos basura/longitud
  // como red de seguridad extra (ya deberían venir filtradas desde obtenerResenasFiltradas).
  const validas = reviews.filter((r) => {
    if (excluirIds.has(r.recommendationid)) return false
    if (esComentarioBasura(r)) return false
    if (limpiarTextoResena(r.review).length > MAX_CARACTERES_COMENTARIO)
      return false
    return true
  })

  const conValoracion = validas
    .map((r) => ({ ...r, _valoracion: calcularValoracion(r) }))
    .sort((a, b) => b._valoracion - a._valoracion)

  const top50 = conValoracion.slice(0, 50)

  // Los 2 destacados: los más valorados del top 50 que ADEMÁS califiquen (ver calificaComoDestacado).
  // Si el mejor valorado es, por ejemplo, chino y tiene más de 50 caracteres, se lo salta y se
  // toma el siguiente mejor valorado que sí pase el chequeo. El que quedó afuera no se pierde:
  // como no entra en "destacados", cae automáticamente en "paraContexto" más abajo.
  const destacados = top50.filter(calificaComoDestacado).slice(0, 2)

  const idsDestacados = new Set(destacados.map((d) => d.recommendationid))
  const paraContexto = top50.filter(
    (r) => !idsDestacados.has(r.recommendationid),
  )

  const textoContexto = paraContexto
    .map((r) => `- ${limpiarTextoResena(r.review)}`)
    .join('\n')

  const totalPositivas = top50.filter((r) => r.voted_up).length
  const pctMuestra =
    top50.length > 0 ? Math.round((totalPositivas / top50.length) * 100) : 0

  return {
    textoContexto,
    destacados: destacados.map(formatearDestacado),
    pctMuestra,
  }
}

// ============================================================================
// TODO-EN-UNO: 1 solo llamado de IA por columna que arma resumen + traduce
// los 2 destacados (si hace falta) + redacta el cierre. Así son 2 llamados
// totales por análisis (1 por columna), en vez de hasta 4 por columna.
// ============================================================================

const INTRO_DESTACADOS_RECIENTES =
  'A continuación, vemos 2 comentarios destacados por la comunidad en los últimos 30 días:'
const INTRO_DESTACADOS_HISTORICOS =
  'A continuación, vemos 2 reseñas más valoradas por la comunidad:'

// Arma el prompt único que le pedimos a la IA: resumen + traducción de destacados + cierre,
// todo en formato JSON para poder parsearlo de forma determinística.
//
// `datosCierre` cambia de forma según `tipo`:
//   - 'recientes':  { pctMuestra }  -> % calculado sobre la muestra de 50 reseñas más valoradas
//                    de los últimos 30 días. El cierre es una RECOMENDACIÓN (comprar/probar/
//                    esperar/no recomendar), nunca una nota /10.
//   - 'historicos': { pctOficial, descOficialEsp } -> % OFICIAL de Steam sobre todo
//                    el historial (miles de reseñas). El cierre es una NOTA /10, nunca una
//                    recomendación de compra (para no contradecir a la columna de "recientes").
function construirPromptCompleto(tipo, textoContexto, destacados, datosCierre) {
  const instruccionResumen =
    tipo === 'recientes'
      ? `Sos un analista de la comunidad de Steam. Basándote ÚNICAMENTE en las reseñas de los últimos 30 días que te paso, resumí qué opinan los jugadores ahora.

Reglas:
1. Prohibido describir el juego como ficha de producto (género, ambientación, historia, mecánicas): eso ya lo hacen los desarrolladores, no es tu trabajo.
2. Usá SOLO temas que la gente realmente mencione en las reseñas (puede ser rendimiento, bugs, balance, contenido nuevo, precio, servidores, actualizaciones o lo que sea — no hay lista fija).
3. Si un tema no aparece en las reseñas, NO lo menciones ni lo asumas: inventar opiniones que la comunidad no expresó está prohibido (ej.: si nadie habla de FPS, no digas "no hay quejas de rendimiento").
4. Adaptate al tipo de juego: en un título liviano o 2D no tiene sentido sacar el tema de optimización si nadie lo comenta.
5. Escribí citando la percepción de los jugadores ("varios reportan que...", "la comunidad siente que..."), nunca como descripción objetiva.
6. Un solo párrafo directo de 60 a 90 palabras con 2 o 3 puntos concretos y recurrentes, sin listar géneros ni funciones.`
      : `Sos un analista de la comunidad de Steam. Basándote ÚNICAMENTE en las reseñas de todo el historial que te paso, resumí qué valora y qué critica la comunidad de este juego.

Reglas:
1. Prohibido describir el juego como ficha de producto (género, ambientación, mecánicas): eso ya lo hacen los desarrolladores, no es tu trabajo.
2. Usá ÚNICAMENTE temas que aparezcan en las reseñas (puede ser jugabilidad, mundo, combate, banda sonora, precio, duración, rejugabilidad o lo que la gente mencione — no hay lista fija).
3. Si un tema no está en las reseñas, no lo menciones ni lo des por sentado.
4. Escribí citando la percepción real de los jugadores, nunca describiendo de qué trata el juego.
5. Un solo párrafo directo de 60 a 90 palabras con 2 o 3 puntos concretos y recurrentes, sin listar géneros ni funciones.`

  const bloqueDestacados = destacados
    .map(
      (d, i) =>
        `DESTACADO_${i + 1} (idioma original reportado por Steam: "${d.language || 'desconocido'}"):\n${d.review}`,
    )
    .join('\n\n')

  const instruccionDestacados =
    destacados.length > 0
      ? `\n\nAdemás, te paso ${destacados.length} comentario(s) destacado(s) por la comunidad (son los mejor valorados). Si alguno NO está escrito en español, traducilo al español completo, natural y fiel al original, sin resumirlo ni acortarlo. Si ya está en español, dejalo tal cual (como mucho corregí errores de tipeo obvios).\n\n${bloqueDestacados}`
      : ''

  let instruccionCierre
  if (tipo === 'recientes') {
    const { pctMuestra } = datosCierre
    instruccionCierre = `Por último, redactá una frase de cierre en español (máximo 2 líneas): una RECOMENDACIÓN concreta y honesta — si vale la pena comprarlo ya, esperar una rebaja, o evitarlo por ahora. Tiene que sonar a consejo, nunca a nota (prohibido el formato "puntuación X/10"). Empezá OBLIGATORIAMENTE con "De las reseñas más recientes (últimos 30 días), un ${pctMuestra}% son positivas, por lo que" y completá con la recomendación (podés reformular ligeramente, pero siempre manteniendo ese arranque con el scope temporal). Usá EXACTAMENTE el número ${pctMuestra}% y no menciones ninguna cantidad de reseñas (nada de "50 reseñas").`
  } else {
    const { pctOficial, descOficialEsp } = datosCierre
    instruccionCierre =
      pctOficial !== null
        ? `Por último, redactá una frase de cierre en español (máximo 2 líneas): una conclusión sobre el panorama histórico del juego (recomiendo / no recomiendo / recomiendo con reservas). NO es una recomendación de compra inmediata tipo "cómpralo ya" ni "esperá una rebaja" (eso lo hace la otra columna, la de los últimos 30 días). Empezá OBLIGATORIAMENTE con "En vista general desde su lanzamiento, el juego tiene un ${pctOficial}% de reseñas positivas (Steam las clasifica como «${descOficialEsp}»), por lo que" y completá con tu conclusión. Prohibido cualquier formato de puntuación ("X/10", "x/x", etc.). Usá EXACTAMENTE el número ${pctOficial}% y no menciones ninguna cantidad de reseñas.`
        : `Por último, redactá una frase de cierre en español (máximo 2 líneas) aclarando que no hay datos oficiales suficientes de Steam como para dar una conclusión confiable, pero mencioná brevemente la impresión general que te dejaron las reseñas que leíste.`
  }

  return `${instruccionResumen}${instruccionDestacados}

${instruccionCierre}

RESEÑAS DE CONTEXTO PARA ARMAR EL RESUMEN (no las repitas ni las cites, son solo insumo):
${textoContexto}

Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después, sin marcadores de código como \`\`\`, con EXACTAMENTE esta forma:
{"resumen": "...", "destacados": [${destacados.map((_, i) => `"traducción o texto original del DESTACADO_${i + 1}"`).join(', ')}], "cierre": "..."}`
}

// Intenta extraer y parsear el JSON de la respuesta de la IA, aunque venga con texto
// extra alrededor o con marcadores de código.
function extraerJSON(textoCrudo) {
  if (!textoCrudo) return null
  let limpio = textoCrudo.trim()
  limpio = limpio
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const inicio = limpio.indexOf('{')
  const fin = limpio.lastIndexOf('}')
  if (inicio === -1 || fin === -1 || fin < inicio) return null

  try {
    return JSON.parse(limpio.slice(inicio, fin + 1))
  } catch {
    return null
  }
}

const SYSTEM_MSG =
  'Respondés siempre y únicamente en JSON válido, sin texto adicional ni marcadores de código.'

// FUNCIÓN AUXILIAR: crea un "intento" que llama a un modelo de Groq vía el SDK.
// Todos los modelos de Groq comparten la misma forma de llamado, solo cambia el nombre del modelo.
function crearIntentoGroq(nombre, modelo) {
  return {
    nombre,
    llamar: async (promptCompleto) => {
      if (!groq) throw new Error('GROQ_API_KEY no configurada')
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_MSG },
          { role: 'user', content: promptCompleto },
        ],
        model: modelo,
        max_tokens: 1800,
        temperature: 0.4,
      })
      return chatCompletion.choices[0]?.message?.content
    },
  }
}

// Los 2 modelos de Groq vigentes hoy (reemplazan a llama-3.3-70b-versatile,
// llama-3.1-8b-instant, gemma2-9b-it, mixtral-8x7b-32768 y qwen/qwen3.6-27b,
// todos deprecados/removidos — el de qwen salió de Groq en 10/2026 y devolvía
// 404 model_not_found).
const intentoGptOss120b = crearIntentoGroq(
  'Groq (GPT-OSS 120B)',
  'openai/gpt-oss-120b',
)
const intentoGptOss20b = crearIntentoGroq(
  'Groq (GPT-OSS 20B)',
  'openai/gpt-oss-20b',
)

// Gemini como cuarto respaldo, fuera de Groq (otro proveedor = otro pool de cuota).
// Con responseMimeType JSON + systemInstruction iguala el comportamiento de la rama de Groq.
const intentoGemini = {
  nombre: 'Gemini 2.5 Flash',
  llamar: async (promptCompleto) => {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
    const r = await axios.post(url, {
      systemInstruction: { parts: [{ text: SYSTEM_MSG }] },
      contents: [{ parts: [{ text: promptCompleto }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1800,
        responseMimeType: 'application/json',
      },
    })
    // La respuesta puede traerse dividida en varias parts: las unimos
    const parts = r.data?.candidates?.[0]?.content?.parts
    return parts ? parts.map((p) => p.text || '').join('') : undefined
  },
}

// Órdenes distintos por columna: así "recientes" e "históricos" no le pegan
// las 2 veces seguidas al mismo modelo/cuota como proveedor principal.
const ORDEN_RECIENTES = [
  intentoGptOss120b,
  intentoGptOss20b,
  intentoGemini,
]
const ORDEN_HISTORICOS = [
  intentoGptOss20b,
  intentoGemini,
  intentoGptOss120b,
]

// Cascada de proveedores: recorre el orden recibido y se queda con el primero que
// devuelva un JSON válido con un campo "resumen".
async function obtenerAnalisisCompletoIA(promptCompleto, ordenProveedores) {
  for (const intento of ordenProveedores) {
    try {
      const textoCrudo = await intento.llamar(promptCompleto)
      const json = extraerJSON(textoCrudo)
      if (json && typeof json.resumen === 'string' && json.resumen.trim()) {
        console.log(
          `🟢 Análisis combinado generado con éxito por ${intento.nombre}.`,
        )
        return json
      }
      console.log(
        `⚠️ ${intento.nombre} no devolvió un JSON válido, probando el siguiente...`,
      )
    } catch (err) {
      console.log(
        `⚠️ ${intento.nombre} falló (${err.message}), probando el siguiente...`,
      )
    }
  }

  return null // todos los proveedores fallaron
}

// Procesa una columna completa (recientes o históricos) con UN solo llamado de IA.
//
// `datosOficiales` SOLO se usa para 'historicos' ({ pctOficial, descOficialEsp }, calculado a
// partir del query_summary oficial de Steam sobre TODAS las reseñas). Para 'recientes' se pasa
// null y en cambio se usa insumos.pctMuestra (calculado sobre la muestra de 50 más valoradas).
async function procesarColumna(tipo, insumos, datosOficiales) {
  const introDestacados =
    insumos.destacados.length > 0
      ? tipo === 'recientes'
        ? INTRO_DESTACADOS_RECIENTES
        : INTRO_DESTACADOS_HISTORICOS
      : ''

  let datosCierre
  let cierreFallback

  if (tipo === 'recientes') {
    const { pctMuestra } = insumos
    datosCierre = { pctMuestra }
    cierreFallback = `Con un ${pctMuestra}% de opiniones positivas entre las reseñas más valoradas de los últimos 30 días, ${veredictoSegunPct(pctMuestra)}.`
  } else {
    const { pctOficial, descOficialEsp } = datosOficiales
    datosCierre = { pctOficial, descOficialEsp }
    cierreFallback =
      pctOficial !== null
        ? `En vista general desde su lanzamiento, el juego tiene un ${pctOficial}% de reseñas positivas (${descOficialEsp}), por lo que lo recomiendo como una buena opción.`
        : 'No hay datos oficiales suficientes de Steam como para dar una puntuación confiable.'
  }

  if (!insumos.textoContexto) {
    return {
      resumen:
        tipo === 'recientes'
          ? 'Todavía no hay suficientes reseñas de los últimos 30 días como para armar un resumen de la comunidad.'
          : 'Todavía no hay suficientes reseñas publicadas como para armar un resumen de la comunidad.',
      destacados: insumos.destacados,
      cierre: cierreFallback,
      intro: '',
    }
  }

  const promptCompleto = construirPromptCompleto(
    tipo,
    insumos.textoContexto,
    insumos.destacados,
    datosCierre,
  )

  const ordenProveedores =
    tipo === 'recientes' ? ORDEN_RECIENTES : ORDEN_HISTORICOS
  const resultadoIA = await obtenerAnalisisCompletoIA(
    promptCompleto,
    ordenProveedores,
  )

  // Fallback total: si TODOS los proveedores fallaron, igual devolvemos algo coherente
  // (resumen genérico, destacados sin traducir, cierre con los números reales).
  // `degradado` marca esa columna para que el endpoint exponga `degraded`:
  // el frontend la usa para NO pisar una copia buena en el caché (ni al
  // cargarla por primera vez ni al actualizarla) y muestra aviso inline.
  if (!resultadoIA) {
    return {
      resumen:
        'No se pudo generar el resumen debido a una saturación global en los proveedores de IA.',
      destacados: insumos.destacados,
      cierre: cierreFallback,
      intro: introDestacados,
      degradado: true,
    }
  }

  const destacadosFinal = insumos.destacados.map((d, i) => {
    const traducido =
      Array.isArray(resultadoIA.destacados) && resultadoIA.destacados[i]
        ? String(resultadoIA.destacados[i]).trim()
        : null
    if (!traducido) return d
    // SALVAGUARDA CLAVE: el original ya viene garantizado ≤400 caracteres, pero una traducción
    // desde un idioma muy "denso" (chino, japonés, coreano) puede expandirse varias veces. Este
    // tope duro asegura que, pase lo que pase en la traducción, nunca llegue un destacado gigante.
    return {
      ...d,
      review: traducido.slice(0, MAX_CARACTERES_DESTACADO_TRADUCIDO),
    }
  })

  return {
    resumen: resultadoIA.resumen?.trim() || 'No se pudo generar el resumen.',
    destacados: destacadosFinal,
    cierre: resultadoIA.cierre?.trim() || cierreFallback,
    intro: introDestacados,
  }
}

// ENDPOINT 2: El motor de análisis con sistema de redundancia
app.get('/analizar/:appId', async (req, res) => {
  const { appId } = req.params

  // Sin caché HTTP (ni del navegador ni de una CDN/proxy intermedio):
  // cada /analizar es fresco. El único caché real vive en el
  // localStorage del frontend (TTL 3 días), y lo saltea el botón
  // "Actualizar" desde ese lado.
  res.set('Cache-Control', 'no-store')

  // Validación: appId de Steam siempre es numérico
  if (!/^[0-9]+$/.test(appId)) {
    return res.status(400).json({ error: 'appId inválido.' })
  }

  try {
    // 1. CONSULTAS DE METADATA A STEAM
    // Este resumen oficial (miles de reseñas de TODA la vida del juego) es el que ya se
    // mostraba arriba en la tarjeta, y ahora también alimenta el cierre de "históricos".
    const urlMetaGeneral = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=all&language=all&num_per_page=0`
    // l=english a propósito: el release_date llega con formato estable
    // ("3 Oct, 2026") sin depender del locale default de Steam; el resto de
    // los campos que usamos de appdetails (nombre, imágenes, metacritic)
    // son independientes del idioma.
    const urlAppDetails = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`

    // La metadata va primero: la fecha de lanzamiento decide si el panel
    // histórico aplica y, por tanto, si vale la pena pedirle a Steam la
    // muestra histórica y gastar la segunda llamada de IA. pedirSteam
    // (UA de navegador + reintento ante throttle): si el bloqueo persiste,
    // ErrorSteamBloqueado cae al catch del endpoint y devuelve el 503 con
    // mensaje claro, nunca el 500 genérico.
    const [resMetaGeneral, resAppDetails] = await Promise.all([
      pedirSteam(urlMetaGeneral),
      pedirSteam(urlAppDetails),
    ])

    // La clave del JSON no siempre es el appid pedido (ver helper).
    const appDetailsData = tomarDetailsAppdetails(resAppDetails, appId)
    const headerImage = appDetailsData.header_image || ''
    // Fondo del wash de la sala (la pared difuminada de arriba): prefiere
    // `background_raw` (1438×810) — a 1438 px de ancho aguanta el escalado a
    // todo el viewport sin verse suave; los juegos viejos que no la traen
    // caen al header (460 px, el mismo fallback de siempre).
    const fondoSala = appDetailsData.background_raw || appDetailsData.header_image || ''
    // El campo se llama capsule_imagev5 por el contrato, pero prefiere
    // capsule_image (231×87): un poquito más nítida que la v5 (184×69).
    const capsuleImageV5 = appDetailsData.capsule_image || appDetailsData.capsule_imagev5 || ''
    const metacritic = appDetailsData.metacritic || {}
    // Si el juego no existe en Steam, appdetails no trae data: 404 directo
    // (se resuelve antes de gastar las peticiones de reseñas que no se usarían)
    if (!appDetailsData.name) {
      return res.status(404).json({ error: 'Juego no encontrado en Steam.' })
    }
    const nombreJuego = appDetailsData.name

    // Fecha de lanzamiento (medianoche UTC) y días desde entonces: deciden si
    // el Panel II (histórico) aporta algo o duplica al Panel I (30 días).
    // >30 días → ambos paneles (como siempre); <=30 (o aún sin lanzar) →
    // solo el de 30 días; sin fecha parseable → se decide con las reseñas
    // reales, más abajo (fallback, porque no hay otra fuente confiable).
    const fechaLanzamiento = parseSteamReleaseDate(appDetailsData.release_date)
    const daysSinceRelease =
      fechaLanzamiento === null ? null : diasDesdeLanzamiento(fechaLanzamiento)
    let showHistorical =
      daysSinceRelease === null ? null : daysSinceRelease > 30

    // 2. TRAEMOS RESEÑAS YA FILTRADAS: se pide de a 100, filtrando basura y longitud
    // (≤ 400 caracteres en el original) sobre la marcha, hasta juntar 70 candidatas válidas
    // por columna (o hasta agotar las reseñas del juego, típico de indies/juegos nuevos).
    // "Recientes" además exige que la reseña sea de los últimos 30 días.
    // La muestra histórica SOLO se pide cuando el panel histórico aplica:
    // en un juego joven duplica la de 30 días y además costaría su llamada de IA.
    const limiteRecientes = Math.floor(Date.now() / 1000) - SEGUNDOS_30_DIAS
    const promesaRecientes = obtenerResenasFiltradas(appId, {
      dayRange: 30,
      filtroAdicional: (r) => r.timestamp_created >= limiteRecientes,
    })
    let listaRecientesFiltrada
    let listaHistoricasFiltrada = null
    if (showHistorical === null) {
      // Sin fecha de lanzamiento: se decide con las reseñas reales. OJO:
      // NO se puede comparar el query_summary de appreviews con y sin
      // day_range — Steam lo ignora en el summary (verificado: con
      // num_per_page=0 todas las variantes devuelven el mismo total de
      // vida, y el filter/all de la lista sí respeta day_range), así que
      // esa comparación daría "sin histórico" hasta para juegos viejos.
      // Se comparan en cambio los ids de las dos muestras: el histórico
      // solo aporta si trae reseñas que NO están ya en la ventana de 30 días.
      ;[listaRecientesFiltrada, listaHistoricasFiltrada] = await Promise.all([
        promesaRecientes,
        obtenerResenasFiltradas(appId, { dayRange: null }),
      ])
      // Sin reseñas en la ventana histórica → nada nuevo que mostrar. Si la
      // historia entera ya cabe en los 30 días → también false. Cualquier
      // material más vieja → true.
      showHistorical = muestraHistoricaAporta(
        listaRecientesFiltrada,
        listaHistoricasFiltrada,
      )
    } else {
      ;[listaRecientesFiltrada, listaHistoricasFiltrada] = await Promise.all([
        promesaRecientes,
        showHistorical
          ? obtenerResenasFiltradas(appId, { dayRange: null })
          : null,
      ])
    }

    const summaryGeneral = resMetaGeneral.data?.query_summary || {}

    const calcularPorcentaje = (positives, total) => {
      if (!total || total === 0) return 0
      return Math.round((positives / total) * 100)
    }

    const pctGeneral = calcularPorcentaje(
      summaryGeneral.total_positive,
      summaryGeneral.total_reviews,
    )

    // % y clasificación OFICIAL de Steam sobre todo el historial (miles de reseñas). Se usa
    // SOLO para el cierre de la columna "históricos" (estilo puntuación /10). La columna
    // "recientes" usa en cambio insumos.pctMuestra (calculado sobre la muestra de 50).
    const datosOficialesHistoricos = {
      pctOficial: summaryGeneral.total_reviews > 0 ? pctGeneral : null,
      descOficialEsp: traducirDescripcionValve(
        summaryGeneral.review_score_desc,
      ),
    }

    const metaCard = {
      appId: appId,
      name: nombreJuego,
      header_image: headerImage,
      fondoSala: fondoSala,
      capsule_imagev5: capsuleImageV5,
      metacritic: {
        score: metacritic.score ?? null,
        url: metacritic.url ?? null,
      },
      allReviews: {
        review_score: summaryGeneral.review_score ?? 0,
        review_score_desc: summaryGeneral.review_score_desc || 'Sin análisis',
        total_reviews: summaryGeneral.total_reviews || 0,
        total_positive: summaryGeneral.total_positive || 0,
        total_negative: summaryGeneral.total_negative || 0,
        positive_percentage: pctGeneral,
      },
    }

    // 3. ARMAMOS LOS INSUMOS: recientes (30 días) e históricos (todas las fechas) por
    // separado. El histórico solo se arma cuando el panel aplica (si no, la muestra
    // no se pidió y no hay nada que procesar).
    const insumosRecientes = armarInsumosDeResenas(listaRecientesFiltrada)
    const idsDestacadosRecientes = new Set(
      insumosRecientes.destacados.map((d) => d.recommendationid),
    )
    const insumosHistoricas =
      listaHistoricasFiltrada !== null
        ? armarInsumosDeResenas(listaHistoricasFiltrada, {
            excluirIds: idsDestacadosRecientes,
          })
        : null

    // 4. GENERAMOS TODO EN LLAMADOS DE IA (uno por columna): resumen + destacados
    // traducidos (si hace falta) + cierre, todo junto en un solo JSON por columna.
    // Cada columna usa un orden de proveedores distinto (ver ORDEN_RECIENTES / ORDEN_HISTORICOS)
    // para no vaciar la cuota del mismo modelo dos veces seguidas.
    const resultadoRecientes = await procesarColumna(
      'recientes',
      insumosRecientes,
      null, // 'recientes' no usa datos oficiales, usa insumosRecientes.pctMuestra
    )

    // El histórico existe solo si el panel aplica (juego con >30 días o sin
    // fecha decidida por reseñas). En juegos jóvenes se ahorra la segunda
    // llamada de IA completa — y la pausa de 1.5 s que la protege no aplica
    // porque no hay segunda llamada que proteger.
    let resultadoHistoricas = null
    if (showHistorical) {
      await esperar(1500) // Pausa para evitar bloqueos por IP entre las 2 columnas
      resultadoHistoricas = await procesarColumna(
        'historicos',
        insumosHistoricas,
        datosOficialesHistoricos,
      )
    }

    // 5. CONSULTAR A IGDB
    let igdbDatos = {
      criticScore: '--',
      userScore: '--',
      totalScore: '--',
      count: 0,
    }

    const igdbToken = IGDB_CLIENT_ID && IGDB_CLIENT_SECRET ? await obtenerIgdbToken() : null

    if (igdbToken) {
      try {
        const urlGames = 'https://api.igdb.com/v4/games'
        // Se busca por el nombre limpio; si el nombre de Steam incluye "Remake",
        // se intenta primero con ese término y después sin él, porque IGDB a veces
        // registra el remake como un título propio y a veces como el original.
        const nombreLimpio = nombreJuego.toLowerCase().trim()
        const terminaEnRemake = /\bremake\b/i.test(nombreLimpio)
        const nombreBase = nombreLimpio.replace(/\bremake\b/gi, '').replace(/\s+/g, ' ').trim()

        const buscarEnIgdb = async (termino) => {
          const queryGames = `fields name, rating, aggregated_rating, total_rating, total_rating_count, summary; search "${termino}"; limit 5;`
          const resGame = await axios.post(urlGames, queryGames, {
            headers: {
              'Client-ID': IGDB_CLIENT_ID,
              Authorization: `Bearer ${igdbToken}`,
              'Content-Type': 'text/plain',
              Accept: 'application/json',
            },
          })
          return resGame.data || []
        }

        let candidatos = await buscarEnIgdb(terminaEnRemake ? nombreBase : nombreLimpio)
        // Sin resultados y el juego es un remake: reintentar sin la palabra "remake"
        if (candidatos.length === 0 && terminaEnRemake) {
          candidatos = await buscarEnIgdb(nombreBase)
        }

        if (candidatos.length > 0) {
          let juegoCorrecto = null

          // Si el juego es un remake, priorizamos el candidato que lo diga en el summary
          if (terminaEnRemake) {
            juegoCorrecto = candidatos.find(
              (c) => c.summary && c.summary.toLowerCase().includes('remake'),
            )
          }

          if (!juegoCorrecto) {
            juegoCorrecto =
              candidatos.find((c) => c.total_rating) || candidatos[0]
          }

          const criticScore = juegoCorrecto.aggregated_rating
            ? (Math.round(juegoCorrecto.aggregated_rating) / 10).toFixed(1)
            : '--'
          const userScore = juegoCorrecto.rating
            ? (juegoCorrecto.rating / 10).toFixed(1)
            : '--'
          const totalScore = juegoCorrecto.total_rating
            ? (juegoCorrecto.total_rating / 10).toFixed(1)
            : '--'

          igdbDatos = {
            criticScore: criticScore.toString(),
            userScore: userScore.toString(),
            totalScore: totalScore.toString(),
            count: juegoCorrecto.total_rating_count || 0,
          }
        }
      } catch (err) {
        console.error('Error filtrando IGDB en el backend:', err.message)
      }
    }

    // 6. RESPUESTA FINAL (mismo shape que el frontend ya espera + los campos
    //    nuevos de fecha de lanzamiento). Cuando el histórico no aplica
    //    (juego con <=30 días) las claves del panel histórico quedan en null:
    //    presentes para no romper el contrato, vacías en contenido.
    // `degraded`: true si ALGUNA columna cayó al fallback determinístico
    // (todos los proveedores de la cascada fallaron). El histórico no
    // existe (juego joven) y por eso no degrada: no hay 2ª columna que caiga.
    const degradado =
      !!resultadoRecientes.degradado ||
      !!(resultadoHistoricas && resultadoHistoricas.degradado)

    return res.json({
      metaCard,
      releaseDate: fechaLanzamiento ? fechaLanzamiento.toISOString() : null,
      daysSinceRelease,
      showHistorical,
      degraded: degradado,
      resumenTecnico: resultadoRecientes.resumen,
      resumenGeneral: resultadoHistoricas?.resumen ?? null,
      introDestacadosRecientes: resultadoRecientes.intro,
      cierreRecientes: resultadoRecientes.cierre,
      introDestacadosHistoricos: resultadoHistoricas?.intro ?? null,
      cierreHistoricos: resultadoHistoricas?.cierre ?? null,
      destacadosRecientes: resultadoRecientes.destacados,
      destacadosHistoricos: resultadoHistoricas?.destacados ?? null,
      igdb: igdbDatos,
    })
  } catch (error) {
    if (error instanceof ErrorSteamBloqueado) {
      // Steam limitó el acceso de esta IP (ver pedirSteam): el juego puede
      // estar sano, el problema es el throttle, y dura minutos/horas. 503 +
      // mensaje claro, nunca el 500 genérico.
      console.error('Steam limitando el acceso (IP bloqueada por throttle).')
      // `steamBloqueado` es un campo estable del contrato: la web lo usa para
      // armar su cooldown cliente de 6 h (no le vuelve a pegar a Steam; ver
      // App.jsx y AGENTS.md).
      return res.status(503).json({ error: MSG_STEAM_BLOQUEADO, steamBloqueado: true })
    }
    console.error('Error crítico en el analizador:', error.message)
    return res
      .status(500)
      .json({ error: 'Error general al procesar el análisis.' })
  }
})

app.listen(PORT, () => {
  console.log(
    `🚀 Backend unificado con Groq corriendo en http://localhost:${PORT}`,
  )
})
