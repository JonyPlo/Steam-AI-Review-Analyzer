import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

const SIZES = {
  lg: { text: 'text-[52px] sm:text-[60px]', gauge: 'w-full max-w-52' },
  md: { text: 'text-[34px]', gauge: 'w-full max-w-32' },
}

/**
 * El % de reseñas positivas como número de sala: Archivo expanded
 * dorado con count-up + barra que se llena. El primer dato que se
 * lee en la placa de sala.
 */
export default function PercentScore({ value, size = 'lg', label = 'positivas' }) {
  const cfg = SIZES[size]
  const [animated, setAnimated] = useState(0)
  const [fill, setFill] = useState(0)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) return // se resuelve en el render, sin estado
    // doble rAF: el primer paint pinta la barra vacía, el siguiente
    // dispara la transición hacia el valor final
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setFill(value))
    })
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setAnimated(Math.round(v)),
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      controls.stop()
    }
  }, [value, reduced])

  // Con reduced-motion no hay animación: se muestra el valor final directo
  const display = reduced ? value : animated
  const pct = reduced ? value : fill

  return (
    <div
      className="flex items-end gap-4 sm:gap-5"
      role="img"
      aria-label={`${value}% de reseñas ${label}`}
    >
      <span className={`font-display shrink-0 leading-none text-accent ${cfg.text}`}>
        {display}
        <span className="align-super text-[0.45em]">%</span>
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <div className={`gauge h-1.5 overflow-hidden ${cfg.gauge}`}>
          <div className="gauge-fill h-full" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="label mt-2.5 !text-[10px] text-muted">{label}</p>
      </div>
    </div>
  )
}
