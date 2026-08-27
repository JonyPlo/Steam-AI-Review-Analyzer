import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Search, X, ChevronRight, Loader2 } from 'lucide-react'
import { traducirReview } from '../i18n'

function formatearCompacto(n) {
  if (!n) return ''
  return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function chipSemantica(desc) {
  if (!desc) return { cls: 'chip !text-faint', label: 'Sin reseñas' }
  if (desc === 'Mixed') return { cls: 'chip chip-mix', label: traducirReview(desc) }
  if (desc.includes('Negative')) return { cls: 'chip chip-neg', label: traducirReview(desc) }
  if (desc.includes('Positive')) return { cls: 'chip chip-pos', label: traducirReview(desc) }
  return { cls: 'chip !text-faint', label: traducirReview(desc) }
}

/**
 * Buscador con dropdown (combobox): filtra en vivo contra la API,
 * navegación por teclado, elige un juego directamente o "Buscar"
 * para ver el listado completo.
 */
export default function SearchBar({ value, onChange, juegos, onPick, onSubmit, compact = false, searching = false }) {
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const reduced = useReducedMotion()
  const minChars = 3

  // Si llegan resultados nuevos, reinicio la selección (ajuste en render,
  // no en efecto, para evitar renders en cascada)
  const [prevJuegos, setPrevJuegos] = useState(juegos)
  if (juegos !== prevJuegos) {
    setPrevJuegos(juegos)
    setSelectedIndex(-1)
  }

  const visible = open && value.trim().length >= minChars
  const listId = 'search-listbox'

  useEffect(() => {
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!visible || (juegos.length === 0 && !searching)) {
      if (e.key === 'Enter') {
        e.preventDefault()
        onSubmit()
      }
      return
    }
    if (juegos.length === 0) return // sin resultados, no hay nada que mover
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setSelectedIndex((i) => (i + 1) % juegos.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + juegos.length) % juegos.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < juegos.length) {
        onPick(juegos[selectedIndex])
      } else {
        onSubmit()
      }
    }
  }

  const clear = () => {
    onChange('')
    setOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  const padY = compact ? 'py-2.5 sm:py-3' : 'py-3.5 sm:py-5'
  const textCls = compact ? 'text-sm sm:text-base' : 'text-base sm:text-xl'
  const btnPad = compact ? 'px-4 py-2' : 'px-5 py-2.5 sm:px-7'

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="relative"
        role="search"
      >
        <div
          className={`search-shell flex w-full items-center gap-2 pr-2 ${
            open ? 'border-accent' : ''
          } ${compact ? 'pl-3' : 'pl-4 sm:pl-5'}`}
        >
          <Search
            size={compact ? 16 : 18}
            className="shrink-0 text-faint"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder="Buscar un juego en Steam…"
            autoComplete="off"
            spellCheck="false"
            onChange={(e) => {
              onChange(e.target.value)
              if (e.target.value.trim().length >= minChars) setOpen(true)
              else {
                setOpen(false)
                setSelectedIndex(-1)
              }
            }}
            onFocus={() => value.trim().length >= minChars && setOpen(true)}
            onKeyDown={handleKey}
            role="combobox"
            aria-expanded={visible}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              visible && selectedIndex >= 0 ? `search-opt-${selectedIndex}` : undefined
            }
            className={`w-full min-w-0 bg-transparent text-ink placeholder:text-faint focus:outline-none ${padY} ${textCls}`}
          />
          {searching && visible && (
            <Loader2 size={16} className="shrink-0 animate-spin text-accent" aria-label="Buscando" />
          )}
          {value && (
            <button
              type="button"
              onClick={clear}
              aria-label="Limpiar búsqueda"
              className="shrink-0 border p-1.5 text-faint transition-colors hover:border-line hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={value.trim().length < minChars}
            className={`btn-primary label shrink-0 ${btnPad}`}
          >
            Buscar
          </button>
        </div>

        {/* Dropdown: índice compacto, pegado al recuadro */}
        {visible && (juegos.length > 0 || searching) && (
          <motion.div
            id={listId}
            role="listbox"
            aria-label="Sugerencias de juegos"
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="dropdown-panel absolute top-full z-50 max-h-[60vh] w-full overflow-y-auto"
          >
            {searching && juegos.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" />
                Buscando en Steam…
              </div>
            )}
            {juegos.map((juego, idx) => {
              const chip = chipSemantica(juego.review_score_desc)
              return (
                <button
                  key={juego.appId}
                  id={`search-opt-${idx}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={idx === selectedIndex}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => onPick(juego)}
                  className={`flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition-colors last:border-0 sm:gap-4 sm:px-4 ${
                    idx === selectedIndex ? 'bg-raised' : 'hover:bg-raised/60'
                  }`}
                >
                  <img
                    src={juego.capsule_image || juego.header_image}
                    alt=""
                    onError={(e) => {
                      // si el capsule 404, cae al header (misma proporción)
                      if (e.target.dataset.fallback !== '1' && juego.header_image) {
                        e.target.dataset.fallback = '1'
                        e.target.src = juego.header_image
                      }
                    }}
                    className="h-10 aspect-[231/87] shrink-0 border border-line object-cover sm:h-12"
                    loading="lazy"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`font-display block truncate text-sm font-bold tracking-tight sm:text-[15px] ${
                        idx === selectedIndex ? 'text-accent' : 'text-ink'
                      }`}
                    >
                      {juego.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-faint">
                      {juego.total_reviews
                        ? `${formatearCompacto(juego.total_reviews)} reseñas`
                        : 'AppID ' + juego.appId}
                    </span>
                  </span>
                  <span className={`hidden sm:inline-flex ${chip.cls} !text-[11px]`}>
                    {juego.review_score_desc && chip.label}
                  </span>
                  <ChevronRight
                    size={15}
                    className={`shrink-0 ${idx === selectedIndex ? 'text-accent' : 'text-faint'}`}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </motion.div>
        )}
      </form>
    </div>
  )
}
