import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

const SIZES = {
  lg: { ring: 128, stroke: 10, text: 'text-4xl sm:text-5xl' },
  md: { ring: 84, stroke: 8, text: 'text-2xl sm:text-3xl' },
}

/**
 * El % de reseñas positivas como marcador: anillo que se dibuja +
 * número con count-up. Es el momento "authored" de la vista de análisis.
 */
export default function PercentScore({ value, size = 'lg', label = 'positivas' }) {
  const cfg = SIZES[size]
  const [animated, setAnimated] = useState(0)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const r = (cfg.ring - cfg.stroke) / 2
  const circ = 2 * Math.PI * r
  const targetOffset = circ * (1 - value / 100)
  const [dashOffset, setDashOffset] = useState(circ)

  useEffect(() => {
    if (reduced) return
    // doble rAF: el primer paint pinta el anillo vacío, el siguiente
    // dispara la transición hacia el valor final
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setDashOffset(targetOffset))
    })
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setAnimated(Math.round(v)),
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      controls.stop()
    }
  }, [value, targetOffset, reduced])

  // Con reduced-motion no hay animación: se muestra el valor final directo
  const display = reduced ? value : animated
  const dash = reduced ? targetOffset : dashOffset

  return (
    <div
      className="relative shrink-0"
      style={{ width: cfg.ring, height: cfg.ring }}
      role="img"
      aria-label={`${value}% de reseñas ${label}`}
    >
      <svg
        width={cfg.ring}
        height={cfg.ring}
        viewBox={`0 0 ${cfg.ring} ${cfg.ring}`}
        className="-rotate-90"
      >
        <circle
          cx={cfg.ring / 2}
          cy={cfg.ring / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={cfg.stroke}
        />
        <circle
          cx={cfg.ring / 2}
          cy={cfg.ring / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dash}
          style={
            reduced
              ? undefined
              : { transition: 'stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)' }
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`score-num font-black leading-none text-ink ${cfg.text}`}>
          {display}
          <span className="text-[0.55em] font-bold align-super text-accent">%</span>
        </span>
      </div>
    </div>
  )
}
