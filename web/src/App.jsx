/**
 * ============================================================
 * CONTRATO DE DIRECCIÓN — MUSEO DE LA RESEÑA (seed 40037cb9)
 * THESIS — La interfaz es un museo: cada juego es una obra
 *   expuesta y su comunidad, el curador. Buscar es el vestíbulo,
 *   el listado es el catálogo y el análisis es una sala: la obra,
 *   la placa de sala con el puntaje y dos muros de texto (I:
 *   últimos 30 días, II: desde el lanzamiento), con los
 *   comentarios destacados como etiquetas de pared y una placa
 *   de veredicto dorada al cierre de cada panel. Se rechaza la
 *   página oscura de gaming con neón y el dashboard de IA
 *   genérico; el scoreboard ámbar y la revista ultramarina son
 *   anti-referencias.
 * OWN-WORLD — Cubo blanco cálido: carbón cálido de noche
 *   (por defecto) / papel de galería de día. Hairlines de 1px
 *   como única línea; aire, no reglas. Un solo acento, oro
 *   antiguo (gilt): placas, numerales, puntajes y acción
 *   primaria. Verde/rojo/ámbar solo para polaridad de reseña.
 *   Doble marco (fotograma + cartela) solo en placa de sala y
 *   veredictos. Archivo expanded + Schibsted Grotesk.
 * STORY — Buscar en el vestíbulo → visitar la sala del juego →
 *   la placa responde con el % en un segundo → leer el Panel I
 *   (el público hoy, 2 etiquetas) y el Panel II (lo mejor
 *   valorado siempre, 2 etiquetas) → cada panel cierra con su
 *   veredicto → decidir comprar / esperar / evitar.
 * FIRST VIEWPORT — Vestíbulo: franja de entrada (exposición
 *   permanente + fecha), masthead en dos líneas con reveal por
 *   máscara, copia de apoyo, pared animada de seis frames a la
 *   derecha (una obra resumida en oro), buscador como mesa de
 *   visitas (label arriba, hairline, botón dorado, atajos) y
 *   grilla de salas recientes leída del cache local.
 * FORM — Catálogo de museo / muros de texto de exposición
 *   (posición 7 de la lista fundamentada). Staging comprometido:
 *   el propio del museo — vestíbulo → catálogo → sala. El 2+2
 *   de etiquetas es sagrado: cada panel lleva siempre sus 2.
 * ============================================================
 */
import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Sun,
  Moon,
  TriangleAlert,
  ArrowUpRight,
  ArrowLeft,
  Check,
  Loader2,
} from 'lucide-react'
import SearchBar from './components/SearchBar'
import { traducirReview } from './i18n'
import ReviewCard from './components/ReviewCard'
import PercentScore from './components/PercentScore'
import { useTheme } from './theme'

// En dev la web pasa por el proxy de Vite (/api/* -> localhost:3001).
// En producción se puede apuntar a otra base con VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000
const EASE = [0.22, 1, 0.36, 1]

/* ---------- helpers ---------- */

function guardarEnCache(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify({ datos, timestamp: Date.now() }))
  } catch {
    // cuota llena: la app sigue funcionando sin caché
  }
}

function obtenerDeCache(clave) {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return null
    const item = JSON.parse(raw)
    if (Date.now() - item.timestamp > CACHE_TTL) {
      localStorage.removeItem(clave)
      return null
    }
    return item.datos
  } catch {
    try {
      localStorage.removeItem(clave)
    } catch {
      /* nada */
    }
    return null
  }
}

/* Visitas ya registradas en el navegador: el cache de análisis.
   Recorre las claves analisis_*, descarta vencidas (TTL) y
   devuelve las más recientes con lo justo para la ficha. */
function leerRecientes(limite = 6) {
  try {
    const visitas = []
    for (const clave of Object.keys(localStorage)) {
      if (!clave.startsWith('analisis_')) continue
      const appId = Number(clave.slice('analisis_'.length))
      if (!Number.isFinite(appId)) continue
      try {
        const item = JSON.parse(localStorage.getItem(clave))
        if (!item || Date.now() - item.timestamp > CACHE_TTL) continue
        const mc = item.datos?.metaCard
        if (!mc?.name) continue
        visitas.push({
          appId,
          nombre: mc.name,
          // La grilla de inicio usa la misma imagen que la portada
          // de la sala (header, alta calidad); la cápsula queda
          // para el dropdown de búsqueda, donde sí se ve chica.
          img: mc.header_image || mc.capsule_imagev5,
          all: mc.allReviews,
          ts: item.timestamp,
        })
      } catch {
        /* entrada corrupta: se ignora */
      }
    }
    visitas.sort((a, b) => b.ts - a.ts)
    return visitas.slice(0, limite)
  } catch {
    return []
  }
}

/* La IA a veces responde solo puntos ("…") donde debería haber texto:
   se trata como vacío, no como contenido. */
function esTexto(s) {
  return !!s && s.replace(/[\s.\u2026\u2025]/g, '').length > 0
}

/* La proporción nativa de un asset de Steam, declarada en la URL
   (capsule_616x353.jpg → "616 / 353"). Steam NO entrega siempre el
   mismo tamaño: hay headers de 1920×1080 y de 460×215, cápsulas de
   616×353 y de 184×69. Ajustar el contenedor a la proporción real es
   la única forma de que la imagen se vea siempre entera. */
function ratioDeAsset(url, porDefecto) {
  const m = /(\d+)x(\d+)\.(?:jpe?g|png)/i.exec(url || '')
  return m ? `${m[1]} / ${m[2]}` : porDefecto
}

function chipSemantica(desc) {
  if (!desc || !desc.trim()) return 'chip !text-faint'
  if (desc === 'Mixed') return 'chip chip-mix'
  if (desc.includes('Negative')) return 'chip chip-neg'
  if (desc.includes('Positive')) return 'chip chip-pos'
  return 'chip !text-faint'
}

/* ---------- UI atómica ---------- */

function Label({ children, className = '' }) {
  return <p className={`label text-faint ${className}`}>{children}</p>
}

function igdbTieneDatos(igdb) {
  return !!igdb && [igdb.criticScore, igdb.userScore, igdb.totalScore].some((v) => v !== '--')
}

/* Créditos oficiales (IGDB) como ficha técnica al pie de la placa
   de sala: siempre más pequeños que el puntaje, nunca compiten.
   Metacritic vive en su sello propio (SelloMetacritic): así la
   placa mide igual con o sin el dato, y nada se mueve. */
function CreditosOficiales({ igdb, className = '' }) {
  if (!igdbTieneDatos(igdb)) return null
  // Solo campos con dato real: un "--" no se expone
  const partes = []
  if (igdb.criticScore !== '--') partes.push(`${igdb.criticScore} prensa`)
  if (igdb.userScore !== '--') partes.push(`${igdb.userScore} usuarios`)
  const total = igdb.totalScore !== '--' ? igdb.totalScore : null
  return (
    <div className={`${className} border-t border-line pt-4`}>
      <Label>Créditos oficiales</Label>
      <dl className="mt-3 flex items-baseline justify-between gap-4 text-[13px]">
        <dt className="label shrink-0 !text-[10px]">IGDB</dt>
        {/* Sin truncate: en placas angostas (lg) el valor baja una línea
            en vez de cortarse; la placa no cambia de tamaño (la
            define la portada, no el contenido). */}
        <dd className="text-right text-ink">
          {partes.join(' · ')}
          {total !== null && (
            <>
              {partes.length > 0 && ' · '}<span className="text-accent">{total} total</span>
            </>
          )}
        </dd>
      </dl>
    </div>
  )
}

/* Sello de Metacritic: marca circular flotante en la punta de la
   placa, con el mismo gesto que el badge "metascore" oficial —
   nombre arriba, puntaje en el centro, etiqueta abajo. Flota sobre
   la placa (jamás modifica su tamaño) y el clic lleva a la ficha
   del juego en Metacritic. El anclaje es el CENTRO del círculo:
   en escritorio cae justo en la esquina superior derecha de la
   placa (a 1024-1351px la mitad derecha asoma del borde de la
   pantalla: body corta con overflow-x: clip, sin scrollbar);
   en mobile, a medio camino entre la portada y la placa — en el
   centro del gap de 20px — con el mismo derrame sobre ambas. */
function SelloMetacritic({ meta }) {
  if (!meta?.score || !meta.url) return null
  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Ver esta obra en Metacritic: ${meta.score} de 100`}
      title="Ver en Metacritic"
      className="seal group absolute -top-[16.7px] left-1/2 z-10 grid h-24 w-24 cursor-pointer place-items-center -translate-x-1/2 -translate-y-1/2 lg:top-[-1px] lg:left-auto lg:right-[-97px]"
    >
      {/* Texto pequeño: todo el bloque queda dentro del anillo interior,
          nunca encima de las líneas del doble borde. */}
      <span className="flex flex-col items-center leading-none">
        <span className="text-[8px] font-bold tracking-[0.12em] text-muted">METACRITIC</span>
        <span className="font-display text-2xl text-accent">{meta.score}</span>
        <span className="flex items-center gap-1 text-[8px] font-bold tracking-[0.12em] text-faint transition-colors group-hover:text-accent">
          METASCORE
          <ArrowUpRight size={8} strokeWidth={2.5} aria-hidden="true" />
        </span>
      </span>
    </a>
  )
}

/* Título de la placa: una sola línea que se achica a medida que el
   nombre crece, sin estirar la placa (y sin que la portada se corte
   por los lados). Se ajusta el font-size en el propio nodo: escalar
   con transform encoge la caja del elemento y el texto se cortaría
   igual; un state de React aquí no sobrevive al fast-refresh dev. */
function TituloSala({ nombre }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      el.style.fontSize = '' // siempre mide en tamaño natural
      const base = parseFloat(getComputedStyle(el).fontSize)
      const ratio = el.clientWidth / el.scrollWidth
      if (ratio < 1) el.style.fontSize = `${Math.max(base * ratio, base * 0.45)}px`
    }
    medir()
    if (document.fonts?.ready) document.fonts.ready.then(medir)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [nombre])
  return (
    <h2
      ref={ref}
      title={nombre}
      className="font-display mt-2.5 overflow-hidden whitespace-nowrap text-[clamp(1.7rem,3vw,2.5rem)] font-bold leading-[1.05] tracking-tight text-ink"
    >
      {nombre}
    </h2>
  )
}

/* La pieza del vestíbulo: una pared pequeña que respira. Seis
   frames de colección con sus marcas de reseña y una obra ya
   resumida, marcada en oro. Movimiento en CSS (muroFloat):
   cero JS por frame, y reduced-motion lo apaga. */
function MuroSala({ reduced }) {
  return (
    <div aria-hidden="true" className="hidden grid-cols-3 grid-rows-[6rem_4.25rem] gap-2.5 sm:grid sm:gap-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`muro-frame grid h-full place-items-center border border-line bg-surface/70 ${
            i === 4 ? 'border-accent/50' : ''
          }`}
          style={
            reduced
              ? undefined
              : { animationDelay: `${i * 0.6}s`, animationDuration: `${6.5 + (i % 3) * 1.4}s` }
          }
        >
          {i === 4 ? (
            <span className="grid h-9 w-9 place-items-center bg-accent text-accent-ink">
              <Check size={17} strokeWidth={3} />
            </span>
          ) : (
            <span className="grid grid-cols-4 gap-x-2 gap-y-1.5">
              {Array.from({ length: 8 }).map((_, j) => (
                <span
                  key={j}
                  className={`mark-dot h-1 w-1.5 ${j === 4 ? 'bg-accent/70' : 'bg-muted/35'}`}
                  style={{ animationDelay: reduced ? '0ms' : `${500 + (i * 8 + j) * 34}ms` }}
                />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* Muro de texto de la sala: numeral dorado + kicker + título,
   lead, etiquetas de pared y placa de veredicto.
   El 2+2 es sagrado: recibe exactamente sus 2 etiquetas; si la
   muestra no tiene (juego sin reseñas), el texto ocupa el muro. */
function MuroTexto({
  numeral,
  kicker,
  titulo,
  resumen,
  intro,
  etiquetas,
  cierre,
  nota,
  delay = 0,
  reduced = false,
}) {
  const hayEtiquetas = !!etiquetas?.length
  const resumenT = esTexto(resumen) ? resumen : null
  const introT = esTexto(intro) ? intro : null
  const cierreT = esTexto(cierre) ? cierre : null

  const texto = (
    <>
      {resumenT && <p className="max-w-[58ch] text-[16.5px] leading-relaxed text-ink">{resumenT}</p>}
      {introT && (
        <p className={`max-w-[52ch] text-sm leading-relaxed text-muted ${resumenT ? 'mt-5' : ''}`}>
          {introT}
        </p>
      )}
    </>
  )

  const veredicto = (
    <>
      {cierreT && (
        <div className="verdict-plate p-5 sm:p-6">
          <p className="label">Veredicto</p>
          <p className="mt-2.5 text-[15px] font-semibold leading-relaxed">{cierreT}</p>
        </div>
      )}
      <p className={`${cierreT ? 'mt-5' : ''}text-xs leading-relaxed text-faint`}>{nota}</p>
    </>
  )

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduced ? 0 : 0.15 + delay, ease: EASE }}
      className="border-t border-line pt-8 sm:pt-10"
    >
      <header className="flex items-start gap-4 sm:gap-5">
        <span
          className="font-display text-[40px] leading-none text-accent sm:text-[48px]"
          aria-hidden="true"
        >
          {numeral}
        </span>
        <div className="min-w-0 pt-1 sm:pt-1.5">
          <Label>{kicker}</Label>
          <h3 className="font-display mt-1 text-xl tracking-tight text-ink sm:text-2xl">{titulo}</h3>
        </div>
      </header>

      {/* Escritorio: texto (arriba-izq) + veredicto (abajo-izq); las
          etiquetas abarcan ambas filas y se reparten para que su
          primera y última línea cierren con el muro. Mobile se lee
          texto → etiquetas → veredicto. */}
      {hayEtiquetas ? (
        <div className="mt-7 grid grid-cols-1 gap-8 [grid-template-areas:'t'_'l'_'v'] lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8 lg:[grid-template-areas:'t_t_t_t_t_l_l_l_l_l_l_l'_'v_v_v_v_v_l_l_l_l_l_l_l']">
          <div className="[grid-area:t]">{texto}</div>
          <div className="flex flex-col gap-4 [grid-area:l] lg:justify-between">
            {etiquetas.map((resena) => (
              <ReviewCard key={resena.recommendationid} resena={resena} />
            ))}
          </div>
          <div className="flex flex-col justify-end [grid-area:v]">{veredicto}</div>
        </div>
      ) : (
        <div className="mt-7 flex flex-col gap-8">
          <div>{texto}</div>
          <div className="max-w-xl">{veredicto}</div>
        </div>
      )}
    </motion.section>
  )
}

/* Card de la grilla de inicio: muestra la MISMA imagen que la
   portada de la sala (header de alta calidad). Los headers de
   Steam no declaran su tamaño en la URL, así que al cargar se lee
   la proporción real y se ajusta el contenedor: la obra siempre
   entera, sin recortes. */
function RecienteCard({ j, onOpen }) {
  const [ratio, setRatio] = useState(null)
  return (
    <button
      type="button"
      onClick={() => onOpen(j.appId)}
      className="sala-card group overflow-hidden text-left"
    >
      <div className="overflow-hidden bg-raised" style={{ aspectRatio: ratio || '16 / 9' }}>
        {j.img && (
          <img
            src={j.img}
            alt=""
            loading="lazy"
            onLoad={(e) => {
              const el = e.currentTarget
              if (el.naturalWidth && el.naturalHeight) {
                setRatio(`${el.naturalWidth} / ${el.naturalHeight}`)
              }
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
            className="sala-img h-full w-full object-cover"
          />
        )}
      </div>
      <div className="px-4 py-3">
        <p className="truncate text-base font-semibold text-ink">{j.nombre}</p>
        <p className="label mt-1.5 !text-[11px] text-faint">
          {j.all?.total_reviews
            ? `${j.all.positive_percentage}% · ${j.all.total_reviews.toLocaleString('es-AR')} reseñas`
            : 'Sin reseñas aún'}
        </p>
      </div>
    </button>
  )
}

/* Salas ya visitadas: se leen del cache local (analisis_*).
   Ficha de catálogo reutilizada; abrirla es instantáneo. */
function RecientesSala({ juegos, reduced, onOpen }) {
  if (!juegos.length) return null
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduced ? 0 : 0.46, ease: EASE }}
      className="mt-10 sm:mt-12"
    >
      <div className="flex items-baseline justify-between gap-4">
        <Label>Tus salas recientes</Label>
        <span className="label text-faint">
          {juegos.length === 1 ? '1 visita' : `${juegos.length} visitas`}
        </span>
      </div>
      {/* Grilla de pocas y grandes, siempre con todas las visitas
          (mobile incluido). */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {juegos.map((j) => (
          <RecienteCard key={j.appId} j={j} onOpen={onOpen} />
        ))}
      </div>
    </motion.div>
  )
}

/* Panel de carga: spinner + cronómetro real + barra (la IA tarda 10-40s) */
function PanelCargaAnalisis() {
  const reduced = useReducedMotion()
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="plate p-8 text-center sm:p-14">
      <div className="mx-auto grid h-12 w-12 place-items-center border border-line text-accent" aria-hidden="true">
        <Loader2 size={20} className={reduced ? '' : 'animate-spin'} />
      </div>
      <p className="label mt-6 text-accent">Preparando la sala</p>
      <h2 className="font-display mt-3 text-2xl tracking-tight text-ink sm:text-3xl">
        La IA está leyendo las reseñas…
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
        Filtramos, traducimos y sintetizamos cientos de comentarios de Steam. Suele tardar de 10 a
        40 segundos.
      </p>
      <div className="mx-auto mt-9 flex max-w-xs items-center gap-4">
        <div className="gauge relative h-1.5 flex-1 overflow-hidden">
          <div className="progress-run absolute inset-y-0 w-1/3" />
        </div>
        <span className="font-display shrink-0 text-lg leading-none text-ink" aria-live="off">
          {segundos} s
        </span>
      </div>
    </div>
  )
}

function PanelError({ titulo, detalle, onRetry }) {
  return (
    <div className="plate p-8 text-center sm:p-12">
      <TriangleAlert size={24} className="mx-auto text-ink" aria-hidden="true" />
      <h2 className="font-display mt-4 text-2xl tracking-tight text-ink sm:text-3xl">{titulo}</h2>
      {detalle && <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{detalle}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary label mt-7 px-6 py-3">
          Reintentar
        </button>
      )}
    </div>
  )
}

/* ---------- App ---------- */

export default function App() {
  const { theme, toggle } = useTheme()
  const reduced = useReducedMotion()

  const [query, setQuery] = useState('')
  const [dropdownJuegos, setDropdownJuegos] = useState([])
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState('inicio') // inicio | cards | analisis
  const [juegosListado, setJuegosListado] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState(null)
  const [analisisData, setAnalisisData] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [lastAppId, setLastAppId] = useState(null)
  // Proporción nativa de la portada (se lee del image al cargar): Steam
  // no siempre entrega headers 16:9. Se resetea al abrir cada sala.
  const [ratioPortada, setRatioPortada] = useState(null)

  /* Visitas recientes del cache local: se recalculan al entrar al vestíbulo */
  const recientes = useMemo(() => (view === 'inicio' ? leerRecientes(6) : []), [view])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  /* Búsqueda en vivo (debounce 400ms, mínimo 3 caracteres) */
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    let activo = true
    const timer = setTimeout(async () => {
      setSearching(true)
      const cacheKey = `busqueda_${q.toLowerCase()}`
      let data = obtenerDeCache(cacheKey)
      if (!data) {
        try {
          const res = await fetch(`${API_BASE}/buscar?name=${encodeURIComponent(q)}`)
          if (!res.ok) throw new Error('HTTP ' + res.status)
          const json = await res.json()
          if (Array.isArray(json)) {
            data = json
            guardarEnCache(cacheKey, data)
          }
        } catch (err) {
          console.error('Error buscando:', err)
          if (activo) setDropdownJuegos([])
        }
      }
      if (!activo) return
      if (Array.isArray(data)) setDropdownJuegos(data.slice(0, 4))
      setSearching(false)
    }, 400)
    return () => {
      activo = false
      clearTimeout(timer)
    }
  }, [query])

  const cerrarDropdown = useCallback(() => {
    setDropdownJuegos([])
    setSearching(false)
  }, [])

  /* Cambia el query y, si ya no hay 3 caracteres, vacía el dropdown al momento
     (en el evento, no en un efecto). */
  const handleQueryChange = (v) => {
    setQuery(v)
    if (v.trim().length < 3) setDropdownJuegos([])
  }

  /* Buscar -> vista de catálogo (hasta 20: el tope de la fuente) */
  const handleBuscar = useCallback(async () => {
    const q = query.trim()
    if (q.length < 3) return
    cerrarDropdown()
    setView('cards')
    setListLoading(true)
    setListError(null)

    const cacheKey = `busqueda_${q.toLowerCase()}`
    let data = obtenerDeCache(cacheKey)
    if (!data) {
      try {
        const res = await fetch(`${API_BASE}/buscar?name=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const json = await res.json()
        if (Array.isArray(json)) {
          data = json
          guardarEnCache(cacheKey, data)
        }
      } catch (err) {
        console.error('Error buscando listado:', err)
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      setJuegosListado(data.slice(0, 20))
    } else {
      setJuegosListado([])
      if (!Array.isArray(data)) setListError('No se pudo conectar con la API de búsqueda. Probá de nuevo.')
    }
    setListLoading(false)
  }, [query, cerrarDropdown])

  /* Visitar la sala de un juego */
  const cargarAnalisis = useCallback(
    async (appId) => {
      cerrarDropdown()
      setQuery('')
      setAnalisisData(null)
      setAnalysisError(null)
      setRatioPortada(null)
      setLastAppId(appId)
      setView('analisis')

      const cacheKey = `analisis_${appId}`
      const data = obtenerDeCache(cacheKey)
      if (data) {
        setAnalisisData(data)
        return
      }

      setLoadingAnalysis(true)
      try {
        const res = await fetch(`${API_BASE}/analizar/${appId}`)
        const json = await res.json()
        if (!res.ok || !json || json.error) {
          throw new Error(json?.error || 'HTTP ' + res.status)
        }
        guardarEnCache(cacheKey, json)
        setAnalisisData(json)
      } catch (err) {
        console.error('Error cargando análisis:', err)
        setAnalysisError('No se pudo cargar el análisis. Puede ser un problema de conexión o de los proveedores de IA.')
      } finally {
        setLoadingAnalysis(false)
      }
    },
    [cerrarDropdown],
  )

  const volverInicio = () => {
    setView('inicio')
    setAnalisisData(null)
    setAnalysisError(null)
    setRatioPortada(null)
  }

  const meta = analisisData?.metaCard
  const allReviews = meta?.allReviews

  // Transición de vistas: abrir la siguiente sala (fade + rise, corto)
  const viewTransition = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
  const viewTransitionCfg = { duration: 0.3, ease: EASE, exit: { duration: 0.12, ease: 'easeOut' } }

  const fechaHoy = new Date().toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="relative flex min-h-screen flex-col font-body">
      {/* HEADER — entrada del museo */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={volverInicio}
            className="group flex items-center gap-2.5"
            aria-label="Ir al inicio"
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 bg-accent transition-transform group-hover:rotate-45" />
            <span className="font-display text-[13px] font-bold tracking-wide text-ink uppercase">
              Steam AI Review Analyzer
            </span>
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="grid h-9 w-9 place-items-center border border-line text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="relative z-10 flex-1">
        {/* Wash de la sala: el cover difuminado como luz de pared,
            fundiéndose hacia abajo con el fondo. */}
        {view === 'analisis' && meta?.header_image && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] overflow-hidden sm:h-[560px]"
          >
            <img
              src={meta.header_image}
              alt=""
              className="h-full w-full scale-110 object-cover object-top opacity-[0.14] blur-2xl dark:opacity-25"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/60 to-bg" />
          </div>
        )}
        <AnimatePresence mode="wait">
          {/* ============ VESTÍBULO ============ */}
          {view === 'inicio' && (
            <motion.div
              key="inicio"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeOut' } }}
              transition={{ duration: 0.3 }}
              className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-7xl flex-col px-4 pb-10 pt-5 sm:px-6 sm:pt-7"
            >
              {/* Franja de entrada */}
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="flex items-center justify-between gap-4 border-b border-line py-2.5"
              >
                <span className="label text-faint">Exposición permanente · La comunidad de Steam</span>
                <span className="label hidden text-faint sm:block">{fechaHoy}</span>
              </motion.div>

              {/* Masthead + pared que respira */}
              <div className="mt-10 grid grid-cols-1 gap-10 md:mt-14 md:grid-cols-12 md:items-end md:gap-10">
                <div className="md:col-span-8">
                  <h1 className="font-display text-[clamp(2.3rem,4.4vw,3.6rem)] font-bold leading-[1.08] tracking-tight text-ink">
                    <span className="mask-line">
                      <motion.span
                        className="block"
                        initial={reduced ? false : { y: '110%' }}
                        animate={{ y: 0 }}
                        transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
                      >
                        Cada juego, una obra.
                      </motion.span>
                    </span>
                    <span className="mask-line">
                      <motion.span
                        className="block"
                        initial={reduced ? false : { y: '110%' }}
                        animate={{ y: 0 }}
                        transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
                      >
                        Su público, <span className="text-accent">el crítico</span>.
                      </motion.span>
                    </span>
                  </h1>
                  <motion.p
                    initial={reduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
                    className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
                  >
                    Buscá un juego y visitá su sala: la IA lee miles de reseñas de su comunidad y
                    te deja lo que importa — lo que dicen hoy, lo que valoran desde el lanzamiento
                    y el veredicto.
                  </motion.p>
                </div>
                <motion.div
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: reduced ? 0 : 0.25 }}
                  className="md:col-span-4"
                >
                  <MuroSala reduced={reduced} />
                </motion.div>
              </div>

              {/* Buscador: la mesa de visitas */}
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.34 }}
                className="mt-12 sm:mt-16"
              >
                <Label>Buscar una sala</Label>
                <div className="mt-3">
                  <SearchBar
                    value={query}
                    onChange={handleQueryChange}
                    juegos={dropdownJuegos}
                    searching={searching}
                    onPick={(juego) => cargarAnalisis(juego.appId)}
                    onSubmit={handleBuscar}
                  />
                </div>
                <div className="mt-5 flex select-none flex-wrap items-center gap-x-5 gap-y-2 text-xs text-faint">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="kbd">↑</span>
                    <span className="kbd">↓</span> para elegir un juego
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="kbd">Enter</span> para ver todo el catálogo
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="kbd">Esc</span> para cerrar
                  </span>
                </div>
              </motion.div>

              {/* Salas recientes del cache local: la mesa después de buscar */}
              <RecientesSala juegos={recientes} reduced={reduced} onOpen={cargarAnalisis} />

              {/* Banda de índice: lo que trae la exposición */}
              <motion.div
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: reduced ? 0 : 0.5 }}
                className="mt-auto hidden items-center gap-6 pt-12 md:flex"
              >
                <span className="label text-faint">En esta exposición</span>
                <span className="text-xs text-faint">I · Los últimos 30 días</span>
                <span className="text-xs text-faint">II · Desde el lanzamiento</span>
                <span className="text-xs text-faint">El veredicto</span>
              </motion.div>
            </motion.div>
          )}

          {/* ============ CATÁLOGO (listado) ============ */}
          {view === 'cards' && (
            <motion.div
              key="cards"
              {...viewTransition}
              transition={viewTransitionCfg}
              className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12"
            >
              <SearchBar
                value={query}
                onChange={handleQueryChange}
                juegos={dropdownJuegos}
                searching={searching}
                onPick={(juego) => cargarAnalisis(juego.appId)}
                onSubmit={handleBuscar}
                compact
              />

              {listError ? (
                <div className="mt-12">
                  <PanelError titulo="Algo salió mal" detalle={listError} onRetry={handleBuscar} />
                </div>
              ) : (
                <>
                  <div className="mb-1 mt-10 flex items-end justify-between gap-4 border-b border-line pb-4">
                    <div>
                      <Label>Catálogo</Label>
                      <h2 className="font-display mt-1 text-3xl tracking-tight text-ink sm:text-4xl">
                        Resultados para “{query.trim()}”
                      </h2>
                    </div>
                    {!listLoading && juegosListado.length > 0 && (
                      <span className="label whitespace-nowrap text-faint">
                        {juegosListado.length} salas
                      </span>
                    )}
                  </div>

                  {listLoading ? (
                    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div key={i} className="border border-line bg-surface">
                          {/* 231×87: la cápsula real de /buscar, para que
                              el skeleton mida igual que la tarjeta cargada. */}
                          <div className="skeleton w-full" style={{ aspectRatio: '231 / 87' }} />
                          <div className="flex flex-col gap-2.5 p-4 sm:p-5">
                            <div className="skeleton h-5 w-3/4" />
                            <div className="skeleton h-4 w-1/2" />
                            <div className="skeleton mt-2 h-3 w-2/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : juegosListado.length === 0 ? (
                    <div className="plate mx-auto mt-10 max-w-xl p-10 text-center">
                      <p className="font-display text-2xl tracking-tight text-ink">Sin resultados</p>
                      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
                        No encontramos salas para “{query.trim()}”. Revisá la ortografía o probá
                        con el nombre en inglés.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                      {juegosListado.map((juego, idx) => (
                        <motion.button
                          key={juego.appId}
                          type="button"
                          onClick={() => cargarAnalisis(juego.appId)}
                          initial={reduced ? false : { opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.35,
                            delay: reduced ? 0 : Math.min(idx, 15) * 0.04,
                            ease: EASE,
                          }}
                          className="sala-card group flex h-full flex-col text-left"
                        >
                          <span className="relative block w-full overflow-hidden border-b border-line">
                            {/* Proporción nativa de la cápsula (la URL declara
                                el tamaño): la imagen entera, sin zoom. */}
                            <img
                              src={juego.capsule_image}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                              style={{ aspectRatio: ratioDeAsset(juego.capsule_image, '616 / 353') }}
                              className="sala-img w-full object-cover"
                            />
                            <span
                              aria-hidden="true"
                              className="font-display absolute left-3 top-3 border border-line bg-bg/90 px-2 py-1 text-xs leading-none text-accent"
                            >
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                          </span>
                          <span className="flex w-full flex-1 flex-col p-4 sm:p-5">
                            <span
                              className="font-display line-clamp-2 text-[15px] font-bold tracking-tight text-ink uppercase transition-colors group-hover:text-accent"
                              title={juego.name}
                            >
                              {juego.name}
                            </span>
                            <span className={`mt-3 self-start ${chipSemantica(juego.review_score_desc)}`}>
                              {traducirReview(juego.review_score_desc)}
                            </span>
                            <span className="label mt-auto pt-4 !text-[10px] text-faint">
                              {juego.total_reviews > 0
                                ? `${juego.total_reviews.toLocaleString('es-AR')} reseñas`
                                : 'Sin reseñas todavía'}
                            </span>
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ============ SALA (análisis) ============ */}
          {view === 'analisis' && (
            <motion.div
              key="analisis"
              {...viewTransition}
              transition={viewTransitionCfg}
              className="w-full"
            >
              {loadingAnalysis ? (
                <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
                  <div className="w-full max-w-2xl">
                    <PanelCargaAnalisis />
                  </div>
                </div>
              ) : analysisError ? (
                <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
                  <div className="w-full max-w-2xl">
                    <PanelError
                      titulo="No se pudo preparar la sala"
                      detalle={analysisError}
                      onRetry={() => cargarAnalisis(lastAppId)}
                    />
                  </div>
                </div>
              ) : meta ? (
                <>
                  {/* Cabecera de sala: la obra expuesta + la placa */}
                  <section className="mx-auto w-full max-w-7xl px-4 pb-10 pt-7 sm:px-6 sm:pb-14 sm:pt-10">
                    <button
                      type="button"
                      onClick={volverInicio}
                      className="group inline-flex items-center gap-2 border border-line bg-surface px-3.5 py-2 transition-colors hover:border-accent"
                    >
                      <ArrowLeft size={13} className="text-faint transition-colors group-hover:text-accent" aria-hidden="true" />
                      <span className="label !text-[10px] text-muted transition-colors group-hover:text-ink">
                        Salir de la sala
                      </span>
                    </button>

                    <div className="mt-7 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
                      {/* La obra: portada enmarcada, se asienta lentamente.
                          La proporción es la NATIVA del header (Steam no
                          siempre entrega 16:9: hay headers de 460×215). Se
                          lee del image al cargar (CSS var) para que la
                          portada nunca se corte por los lados. */}
                      <motion.div
                        initial={reduced ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
                        className="lg:col-span-8"
                      >
                        <div
                          className="exhibit-frame overflow-hidden lg:h-full"
                          style={{ '--portada-ratio': ratioPortada || '16 / 9' }}
                        >
                          <motion.img
                            src={meta.header_image}
                            alt={`Portada de ${meta.name}`}
                            initial={reduced ? false : { scale: 1.04 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.9, ease: EASE }}
                            onLoad={(e) => {
                              const el = e.currentTarget
                              if (el.naturalWidth && el.naturalHeight) {
                                setRatioPortada(`${el.naturalWidth} / ${el.naturalHeight}`)
                              }
                            }}
                            className="aspect-[var(--portada-ratio)] w-full object-contain lg:aspect-auto lg:h-full"
                          />
                        </div>
                      </motion.div>

                      {/* La placa de sala: el número (puntaje) manda.
                          lg:h-full: su altura es siempre la de la
                          portada (el contenido nunca la estira), así
                          obra y placa quedan alineadas arriba y abajo.
                          El tag y los votos viven en filas de altura
                          fija: con tag corto o largo nada se mueve. */}
                      <motion.div
                        initial={reduced ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
                        className="lg:col-span-4"
                      >
                        <div className="plate p-6 sm:p-7 lg:flex lg:h-full lg:flex-col">
                          <SelloMetacritic meta={meta?.metacritic} />
                          <Label>Ficha de sala</Label>
                          <TituloSala nombre={meta.name} />

                          {allReviews?.total_reviews > 0 ? (
                            <>
                              <div className="mt-5 lg:mt-6">
                                <PercentScore
                                  value={allReviews?.positive_percentage ?? 0}
                                  label="de su público lo recomienda"
                                />
                              </div>

                              <div className="mt-4 flex h-[30px] items-center lg:mt-5">
                                <span className={chipSemantica(allReviews?.review_score_desc)}>
                                  {traducirReview(allReviews?.review_score_desc)}
                                </span>
                              </div>
                              <p className="mt-2.5 flex h-[22px] items-center text-[13px] text-muted">
                                <span className="truncate">
                                  {allReviews.total_positive?.toLocaleString('es-AR')} positivas ·{' '}
                                  {allReviews.total_negative?.toLocaleString('es-AR')} negativas
                                </span>
                              </p>
                            </>
                          ) : (
                            <p className="mt-5 text-sm leading-relaxed text-muted lg:mt-6">
                              Sin reseñas de usuarios todavía: la sala se llena cuando su comunidad
                              comienza a reseñar.
                            </p>
                          )}

                          <CreditosOficiales igdb={analisisData?.igdb} className="mt-6 lg:mt-auto" />
                        </div>
                      </motion.div>
                    </div>
                  </section>

                  {/* Los dos muros de texto: I (30 días, sus 2 etiquetas) y
                      II (historial, sus 2 etiquetas). El 2+2 es sagrado. */}
                  <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pb-20 pt-2 sm:px-6 sm:gap-12">
                    <MuroTexto
                      numeral="I"
                      kicker="Ventana móvil · 30 días"
                      titulo="Lo que dice el público hoy"
                      resumen={analisisData.resumenTecnico}
                      intro={analisisData.introDestacadosRecientes}
                      etiquetas={analisisData.destacadosRecientes}
                      cierre={analisisData.cierreRecientes}
                      nota="Basado en las reseñas de los últimos 30 días de Steam."
                      reduced={reduced}
                    />
                    <MuroTexto
                      numeral="II"
                      kicker="Historial completo"
                      titulo="Lo mejor valorado de siempre"
                      resumen={analisisData.resumenGeneral}
                      intro={analisisData.introDestacadosHistoricos}
                      etiquetas={analisisData.destacadosHistoricos}
                      cierre={analisisData.cierreHistoricos}
                      nota="Basado en las reseñas más valoradas de toda la vida del juego."
                      delay={0.12}
                      reduced={reduced}
                    />
                  </section>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 mt-auto border-t border-line bg-bg py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <span className="label !text-[10px] text-faint">
            Steam AI Review Analyzer — la comunidad, resumida por IA.
          </span>
          <span className="label !text-[10px] text-faint">
            Hecho por JonyPlo © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  )
}
