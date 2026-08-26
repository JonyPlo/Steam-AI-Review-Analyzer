import { useEffect, useRef, useState } from 'react'
import {
  ThumbsUp,
  ThumbsDown,
  Laugh,
  MessageSquare,
  Clock,
  Pencil,
  Crosshair,
} from 'lucide-react'

function formatearFecha(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function truncarNombre(nombre, max = 12) {
  if (!nombre) return ''
  return nombre.length > max ? `${nombre.slice(0, max)}…` : nombre
}

/**
 * Un comentario destacado de la comunidad, como "tarjeta de jugador":
 * autor + meta arriba, la cita en grande, métricas abajo.
 */
export default function ReviewCard({ resena }) {
  const [tooltip, setTooltip] = useState(null)
  const tipRef = useRef(null)

  // tooltip por hover/focus en las métricas (reemplaza a los 4 badges viejos)
  useEffect(() => {
    if (!tooltip) return
    const close = (e) => {
      if (tipRef.current && !tipRef.current.contains(e.target)) setTooltip(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tooltip])

  if (!resena) return null

  const positiva = resena.voted_up

  const metrics = [
    {
      id: 'up',
      icon: ThumbsUp,
      value: resena.votes_up,
      tip: `A ${resena.votes_up?.toLocaleString('es-AR')} personas les pareció útil`,
    },
    {
      id: 'funny',
      icon: Laugh,
      value: resena.votes_funny,
      tip: `A ${resena.votes_funny?.toLocaleString('es-AR')} personas les pareció divertido`,
    },
  ]
  if (resena.reactions > 0) {
    metrics.push({
      id: 'react',
      icon: MessageSquare,
      value: resena.reactions,
      tip: `Reacciones totales de la comunidad: ${resena.reactions?.toLocaleString('es-AR')}`,
    })
  }

  return (
    <article className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-faint/40 sm:p-5">
      {/* autor + veredicto del reviewer */}
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="score-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-sm font-bold text-muted"
        >
          {(resena.autorNombre || '?').trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {resena.autorPerfilUrl ? (
              <a
                href={resena.autorPerfilUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={resena.autorNombre}
                className="truncate text-sm font-semibold text-ink hover:text-accent transition-colors"
              >
                {truncarNombre(resena.autorNombre)}
              </a>
            ) : (
              <span title={resena.autorNombre} className="truncate text-sm font-semibold text-ink">
                {truncarNombre(resena.autorNombre)}
              </span>
            )}
            <span
              className={`chip ${positiva ? 'chip-pos' : 'chip-neg'} !py-0.5 !text-[11px]`}
              title={positiva ? 'Recomendó el juego' : 'No recomendó el juego'}
            >
              {positiva ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
              {positiva ? 'Recomienda' : 'No recomienda'}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
            <span>{formatearFecha(resena.timestamp_created)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              {resena.horasJugadas?.toLocaleString('es-AR')} hs jugadas al reseñar
            </span>
            {resena.fue_modificado && (
              <span className="inline-flex items-center gap-1">
                <Pencil size={11} />
                editado el {formatearFecha(resena.timestamp_updated)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* la cita */}
      <blockquote className="relative mt-3 pl-5">
        <span
          aria-hidden="true"
          className="font-display absolute -left-1 -top-2 select-none text-4xl font-black leading-none text-accent/30"
        >
          “
        </span>
        <p className="text-[15px] leading-relaxed text-ink/90">{resena.review}</p>
      </blockquote>

      {/* métricas */}
      <footer className="relative mt-3 flex flex-wrap items-center gap-2" ref={tipRef}>
        {metrics.map(({ id, icon: Icon, value, tip }) => (
          <button
            key={id}
            type="button"
            className="chip !text-muted hover:!text-ink transition-colors cursor-help"
            onMouseEnter={() => setTooltip(tip)}
            onMouseLeave={() => setTooltip(null)}
            onFocus={() => setTooltip(tip)}
            onBlur={() => setTooltip(null)}
            aria-label={tip}
          >
            <Icon size={13} />
            {value?.toLocaleString('es-AR')}
          </button>
        ))}
        <span
          className="chip ml-auto !text-faint"
          title="Qué tan relevante resultó para otros jugadores según el algoritmo de Steam"
        >
          <Crosshair size={13} />
          {resena.weighted_vote_score}% relevancia
        </span>
        {tooltip && (
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-max max-w-[240px] rounded-lg border border-line bg-raised px-3 py-2 text-xs text-ink shadow-lg"
          >
            {tooltip}
          </span>
        )}
      </footer>
    </article>
  )
}
