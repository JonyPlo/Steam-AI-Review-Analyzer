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
 * Un comentario destacado como etiqueta de pared de museo:
 * marca dorada + firma + veredicto del reviewer + meta arriba,
 * la cita en grande, métricas abajo.
 */
export default function ReviewCard({ resena }) {
  const [tooltip, setTooltip] = useState(null)
  const tipRef = useRef(null)

  // tooltip por hover/focus en las métricas
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

  // Solo métricas con valor: un chip "0" no comunica nada
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
  ].filter((m) => (m.value ?? 0) > 0)
  if (resena.reactions > 0) {
    metrics.push({
      id: 'react',
      icon: MessageSquare,
      value: resena.reactions,
      tip: `Reacciones totales de la comunidad: ${resena.reactions?.toLocaleString('es-AR')}`,
    })
  }

  return (
    <article className="label-card flex h-full flex-col p-4 sm:p-5">
      {/* firma: marca dorada + autor + veredicto del reviewer + meta */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-accent" />
        {resena.autorPerfilUrl ? (
          <a
            href={resena.autorPerfilUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={resena.autorNombre}
            className="max-w-[180px] truncate text-sm font-bold text-ink transition-colors hover:text-accent"
          >
            {truncarNombre(resena.autorNombre)}
          </a>
        ) : (
          <span title={resena.autorNombre} className="max-w-[180px] truncate text-sm font-bold text-ink">
            {truncarNombre(resena.autorNombre)}
          </span>
        )}
        <span
          className={`chip !py-0.5 !text-[10px] ${positiva ? 'chip-pos' : 'chip-neg'}`}
          title={positiva ? 'Recomendó el juego' : 'No recomendó el juego'}
        >
          {positiva ? <ThumbsUp size={11} /> : <ThumbsDown size={11} />}
          {positiva ? 'Recomienda' : 'No recomienda'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-faint">
          <span>{formatearFecha(resena.timestamp_created)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={10} aria-hidden="true" />
            {resena.horasJugadas?.toLocaleString('es-AR')} hs jugadas al reseñar
          </span>
          {resena.fue_modificado && (
            <span className="inline-flex items-center gap-1">
              <Pencil size={10} aria-hidden="true" />
              editado el {formatearFecha(resena.timestamp_updated)}
            </span>
          )}
        </span>
      </header>

      {/* la cita, como texto de la etiqueta */}
      <blockquote className="mt-3.5">
        <p className="text-[15px] leading-relaxed text-ink">{resena.review}</p>
      </blockquote>

      {/* métricas */}
      <footer className="relative mt-auto flex flex-wrap items-center gap-2 pt-4" ref={tipRef}>
        {metrics.map(({ id, icon: Icon, value, tip }) => (
          <button
            key={id}
            type="button"
            className="chip !text-[11px] !text-muted transition-colors hover:!text-ink"
            onMouseEnter={() => setTooltip(tip)}
            onMouseLeave={() => setTooltip(null)}
            onFocus={() => setTooltip(tip)}
            onBlur={() => setTooltip(null)}
            aria-label={tip}
          >
            <Icon size={13} aria-hidden="true" />
            {value?.toLocaleString('es-AR')}
          </button>
        ))}
        <span
          className="chip !text-[11px] !text-faint"
          title="Qué tan relevante resultó para otros jugadores según el algoritmo de Steam"
        >
          <Crosshair size={13} aria-hidden="true" />
          {resena.weighted_vote_score}% relevancia
        </span>
        {tooltip && (
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-max max-w-[240px] border border-line bg-raised px-3 py-2 text-xs text-ink shadow-lg"
          >
            {tooltip}
          </span>
        )}
      </footer>
    </article>
  )
}
