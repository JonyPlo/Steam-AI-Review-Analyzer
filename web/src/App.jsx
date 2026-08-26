import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Gamepad2, Sun, Moon, TriangleAlert, Star } from 'lucide-react'
import SearchBar from './components/SearchBar'
import ReviewCard from './components/ReviewCard'
import PercentScore from './components/PercentScore'
import { useTheme } from './theme'

// En dev la web pasa por el proxy de Vite (/api/* -> localhost:3001).
// En producción se puede apuntar a otra base con VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const CACHE_TTL = 3 * 24 * 60 * 60 * 1000

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

function traducirReview(desc) {
  if (!desc) return 'Sin reseñas'
  const traducciones = {
    'Overwhelmingly Positive': 'Extremadamente positivas',
    'Very Positive': 'Muy positivas',
    'Mostly Positive': 'Mayormente positivas',
    Positive: 'Positivas',
    Mixed: 'Mixtas',
    'Mostly Negative': 'Mayormente negativas',
    Negative: 'Negativas',
    'Very Negative': 'Muy negativas',
    'Overwhelmingly Negative': 'Extremadamente negativas',
    'No user reviews': 'Sin reseñas de usuarios',
  }
  return traducciones[desc] || desc
}

function chipSemantica(desc) {
  if (!desc || !desc.trim()) return 'chip !text-faint'
  if (desc === 'Mixed') return 'chip chip-mix'
  if (desc.includes('Negative')) return 'chip chip-neg'
  if (desc.includes('Positive')) return 'chip chip-pos'
  return 'chip !text-faint'
}

/* ---------- UI atómica ---------- */

function Overline({ children, className = '' }) {
  return <p className={`overline text-faint ${className}`}>{children}</p>
}

function Veredicto({ texto }) {
  if (!texto) return null
  return (
    <div className="mt-5 rounded-lg bg-raised p-4">
      <p className="overline text-accent">Veredicto</p>
      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-ink">{texto}</p>
    </div>
  )
}

function TileIGDB({ igdb }) {
  if (!igdb) return null
  const hayDatos = [igdb.criticScore, igdb.userScore, igdb.totalScore].some((v) => v !== '--')
  if (!hayDatos) return null
  return (
    <div className="rounded-lg border border-line bg-surface/80 p-3.5">
      <Overline>IGDB</Overline>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-faint">Prensa</p>
          <p className="score-num text-xl font-black text-ink">{igdb.criticScore}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-faint">Usuarios</p>
          <p className="score-num text-xl font-black text-pos">{igdb.userScore}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-faint">Total</p>
          <p className="score-num text-xl font-black text-accent">{igdb.totalScore}</p>
        </div>
      </div>
    </div>
  )
}

function TileMetacritic({ meta }) {
  if (!meta?.score) return null
  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between rounded-lg border border-line bg-surface/80 p-3.5 transition-colors hover:border-accent/50"
    >
      <div>
        <Overline>Metacritic</Overline>
        <p className="score-num mt-1 text-3xl font-black text-ink group-hover:text-accent transition-colors">
          {meta.score}
        </p>
      </div>
      <Star size={20} className="text-faint group-hover:text-accent transition-colors" aria-hidden="true" />
    </a>
  )
}

/* Columna de análisis: título + resumen + destacados + veredicto */
function ColumnaAnalisis({ kicker, titulo, resumen, intro, destacados, cierre, nota }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 sm:p-7"
    >
      <header>
        <Overline className="text-accent">{kicker}</Overline>
        <h3 className="font-display mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {titulo}
        </h3>
      </header>

      <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink/90">{resumen}</p>

      {destacados?.length > 0 && (
        <>
          {intro && <p className="mt-6 text-sm italic leading-relaxed text-muted">{intro}</p>}
          <div className="mt-4 flex flex-col gap-4">
            {destacados.map((resena) => (
              <ReviewCard key={resena.recommendationid} resena={resena} />
            ))}
          </div>
        </>
      )}

      <Veredicto texto={cierre} />

      <p className="mt-5 text-xs leading-relaxed text-faint">{nota}</p>
    </motion.section>
  )
}

/* Panel de carga: "pre-match" */
function PanelCargaAnalisis() {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center sm:p-14">
      <p className="overline text-accent">Preparando el análisis</p>
      <h2 className="font-display mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl">
        La IA está leyendo las reseñas…
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
        Filtramos, traducimos y sintetizamos cientos de comentarios de Steam. Puede tardar unos
        segundos.
      </p>
      <div className="relative mx-auto mt-8 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-raised">
        <div className="progress-run absolute inset-y-0 w-1/3 rounded-full bg-accent" />
      </div>
    </div>
  )
}

function PanelError({ titulo, detalle, onRetry }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center sm:p-14">
      <TriangleAlert size={28} className="mx-auto text-neg" aria-hidden="true" />
      <h2 className="font-display mt-4 text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {titulo}
      </h2>
      {detalle && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{detalle}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="score-num mt-6 rounded-lg bg-accent px-6 py-3 text-sm font-bold uppercase tracking-wide text-bg transition-all hover:brightness-110 active:scale-[0.98]"
        >
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

  /* Buscar -> vista de listado (hasta 10) */
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
      setJuegosListado(data.slice(0, 10))
    } else {
      setJuegosListado([])
      if (!Array.isArray(data)) setListError('No se pudo conectar con la API de búsqueda. Probá de nuevo.')
    }
    setListLoading(false)
  }, [query, cerrarDropdown])

  /* Abrir análisis de un juego */
  const cargarAnalisis = useCallback(
    async (appId) => {
      cerrarDropdown()
      setQuery('')
      setAnalisisData(null)
      setAnalysisError(null)
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
  }

  const meta = analisisData?.metaCard
  const allReviews = meta?.allReviews
  const viewTransition = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }

  return (
    <div className="relative flex min-h-screen flex-col font-body">
      {/* Fondo del análisis: portada difuminada */}
      {view === 'analisis' && meta?.header_image && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url('${meta.header_image}')`, filter: 'blur(48px)' }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, color-mix(in oklab, var(--bg) 55%, transparent), var(--bg) 65%)' }}
          />
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-line" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <button
            type="button"
            onClick={volverInicio}
            className="group flex items-center gap-2.5"
            aria-label="Ir al inicio"
          >
            <Gamepad2 size={19} className="text-accent transition-transform group-hover:-rotate-12" aria-hidden="true" />
            <span className="score-num text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
              Steam AI Review Analyzer
            </span>
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-accent/50 hover:text-ink"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="relative z-10 flex-1">
        <AnimatePresence mode="wait">
          {/* ============ INICIO ============ */}
          {view === 'inicio' && (
            <motion.div
              key="inicio"
              {...viewTransition}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-20 sm:pt-28"
            >
              <p className="overline text-accent">Comunidad Steam × IA</p>
              <h1 className="font-display mt-4 text-center text-[clamp(2.6rem,7vw,4.5rem)] font-black leading-[1.02] tracking-tight text-ink text-balance">
                Steam AI Review <span className="text-accent">Analyzer</span>
              </h1>
              <p className="mt-5 max-w-xl text-center text-base leading-relaxed text-muted sm:text-lg">
                Buscá un juego y dejá que la IA lea la comunidad: qué opinan ahora, qué valoraron
                desde el lanzamiento y si realmente vale la pena.
              </p>

              <div className="mt-9 w-full max-w-2xl">
                <SearchBar
                  value={query}
                  onChange={handleQueryChange}
                  juegos={dropdownJuegos}
                  searching={searching}
                  onPick={(juego) => cargarAnalisis(juego.appId)}
                  onSubmit={handleBuscar}
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-faint">
                <span className="inline-flex items-center gap-1.5">
                  <span className="kbd">↑</span>
                  <span className="kbd">↓</span> para elegir un juego
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="kbd">Enter</span> para ver todos los resultados
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="kbd">Esc</span> para cerrar
                </span>
              </div>
            </motion.div>
          )}

          {/* ============ LISTADO ============ */}
          {view === 'cards' && (
            <motion.div
              key="cards"
              {...viewTransition}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 sm:pt-10"
            >
              <div className="mb-8 max-w-2xl">
                <SearchBar
                  value={query}
                  onChange={handleQueryChange}
                  juegos={dropdownJuegos}
                  searching={searching}
                  onPick={(juego) => cargarAnalisis(juego.appId)}
                  onSubmit={handleBuscar}
                  compact
                />
              </div>

              {listError ? (
                <PanelError
                  titulo="Algo salió mal"
                  detalle={listError}
                  onRetry={handleBuscar}
                />
              ) : (
                <>
                  <div className="mb-5 flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
                      Resultados para “{query.trim()}”
                    </h2>
                    {!listLoading && juegosListado.length > 0 && (
                      <span className="score-num text-sm font-bold text-faint">
                        {juegosListado.length} juegos
                      </span>
                    )}
                  </div>

                  {listLoading ? (
                    <div className="flex flex-col gap-4">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 md:flex-row">
                          <div className="skeleton h-40 w-full rounded-lg md:w-72" />
                          <div className="flex flex-1 flex-col justify-center gap-3">
                            <div className="skeleton h-6 w-2/3 rounded" />
                            <div className="skeleton h-4 w-1/3 rounded-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : juegosListado.length === 0 ? (
                    <div className="rounded-xl border border-line bg-surface p-10 text-center">
                      <p className="font-display text-lg font-bold text-ink">Sin resultados</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        No encontramos juegos para “{query.trim()}”. Revisá la ortografía o probá
                        con el nombre en inglés.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {juegosListado.map((juego, idx) => (
                        <motion.button
                          key={juego.appId}
                          type="button"
                          onClick={() => cargarAnalisis(juego.appId)}
                          initial={reduced ? false : { opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: reduced ? 0 : idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
                          className="group flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition-colors hover:border-accent/50 md:flex-row"
                        >
                          <div className="h-44 w-full shrink-0 overflow-hidden md:h-auto md:w-72">
                            <img
                              src={juego.header_image}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 p-4 sm:p-6">
                            <h3 className="font-display line-clamp-1 text-lg font-bold tracking-tight text-ink group-hover:text-accent transition-colors sm:text-2xl">
                              {juego.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                              <span className={chipSemantica(juego.review_score_desc)}>
                                {traducirReview(juego.review_score_desc)}
                              </span>
                              {juego.total_reviews > 0 && (
                                <span className="score-num text-sm font-semibold text-muted">
                                  {juego.total_reviews.toLocaleString('es-AR')} reseñas
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ============ ANÁLISIS ============ */}
          {view === 'analisis' && (
            <motion.div
              key="analisis"
              {...viewTransition}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-6xl px-4 pb-16"
            >
              {loadingAnalysis ? (
                <div className="pt-10 sm:pt-16">
                  <PanelCargaAnalisis />
                </div>
              ) : analysisError ? (
                <div className="pt-10 sm:pt-16">
                  <PanelError titulo="No se pudo analizar" detalle={analysisError} onRetry={() => cargarAnalisis(lastAppId)} />
                </div>
              ) : meta ? (
                <>
                  {/* Banner: portada + número principal + tiles */}
                  <section className="grid grid-cols-1 items-center gap-6 pt-8 sm:pt-10 md:grid-cols-2 md:gap-10">
                    <div className="overflow-hidden rounded-xl border border-line shadow-2xl">
                      <img src={meta.header_image} alt={`Portada de ${meta.name}`} className="w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <Overline>
                        Ficha del juego
                        {allReviews?.total_reviews
                          ? ` · ${allReviews.total_reviews.toLocaleString('es-AR')} reseñas`
                          : ''}
                      </Overline>
                      <h2 className="font-display mt-2 break-words text-[clamp(1.9rem,4vw,3.2rem)] font-black leading-[1.04] tracking-tight text-ink">
                        {meta.name}
                      </h2>

                      <div className="mt-6 flex items-center gap-5">
                        <PercentScore
                          value={allReviews?.positive_percentage ?? 0}
                          label="de reseñas positivas en todo el historial"
                        />
                        <div className="min-w-0">
                          <span className={chipSemantica(allReviews?.review_score_desc)}>
                            {traducirReview(allReviews?.review_score_desc)}
                          </span>
                          {allReviews?.total_reviews > 0 && (
                            <p className="mt-2 text-sm leading-relaxed text-muted">
                              {allReviews.total_positive?.toLocaleString('es-AR')} positivas ·{' '}
                              {allReviews.total_negative?.toLocaleString('es-AR')} negativas
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TileIGDB igdb={analisisData.igdb} />
                        <TileMetacritic meta={meta.metacritic} />
                      </div>
                    </div>
                  </section>

                  {/* Dos columnas: 30 días vs histórico */}
                  <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
                    <ColumnaAnalisis
                      kicker="Ventana móvil · 30 días"
                      titulo="La comunidad, hoy"
                      resumen={analisisData.resumenTecnico}
                      intro={analisisData.introDestacadosRecientes}
                      destacados={analisisData.destacadosRecientes}
                      cierre={analisisData.cierreRecientes}
                      nota="Basado en las reseñas de los últimos 30 días de Steam."
                    />
                    <ColumnaAnalisis
                      kicker="Historial completo"
                      titulo="Lo mejor valorado de siempre"
                      resumen={analisisData.resumenGeneral}
                      intro={analisisData.introDestacadosHistoricos}
                      destacados={analisisData.destacadosHistoricos}
                      cierre={analisisData.cierreHistoricos}
                      nota="Basado en las reseñas más valoradas de toda la vida del juego."
                    />
                  </section>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 mt-auto border-t border-line py-6" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-faint sm:flex-row">
          <span>Steam AI Review Analyzer — reseñas de la comunidad, leídas por IA.</span>
          <span>Hecho por JonyPlo © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
