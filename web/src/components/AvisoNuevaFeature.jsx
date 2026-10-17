/* Aviso de nuevas features (toast único, no modal: no roba el foco ni
   bloquea la interacción). Informa una feature nueva la primera vez
   que entrás, si la ventana de vigencia del registro (addedAt →
   expiresAt en ../announcements.js) todavía aplica.

   Comportamiento:
   - Se monta UNA vez en App: se evalúa una vez por carga de la página,
     no en cada cambio de vista.
   - Aparece ~1,5 s después de la carga; se cierra solo a los 12 s (el
     timer se pausa con hover o foco dentro del toast); se cierra con
     la X o con Escape.
   - Se marca como visto cuando se MUESTRA, no cuando se cierra: un
     reload no lo repite. El mapa de vistos vive en localStorage
     (clave versionada, como busqueda3_/analisis2_); al cargar se
     limpian los ids que ya no están en el registro o que vencieron.
   - Si localStorage no está disponible o falla, NO se muestra (para
     no repetirlo en cada visita).

   Diseño (DESIGN.md): superficie de panel (papel de galería / carbón
   cálido según tema), un solo hairline de 1 px, sin sombra (las
   sombras con offset se reservan al dropdown y a la obra expuesta),
   un detalle dorado (la etiqueta "Novedad", el único acento). */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { ANNOUNCEMENTS } from '../announcements'
import { getActiveAnnouncement, cleanSeenIds } from '../announcementsLogic'

// Mapa { id: msVisto } de avisos ya mostrados. El versionado del
// prefijo sigue la convención de las claves de caché (busqueda3_,
// analisis2_): si el esquema del mapa cambia, se sube el número.
const VISTOS_KEY = 'avisosVistos_1'
// Delay antes de mostrar (no aparece en el medio del reveal del
// vestíbulo) y duración del auto-cierre.
const DELAY_MOSTRAR_MS = 1500
const AUTO_CLOSE_MS = 12 * 1000
const EASE = [0.22, 1, 0.36, 1]

// Lee el mapa de vistos. ok:false = sin acceso a storage (o lectura
// que falló): en ese caso no se muestra ningún aviso.
function leerVistos() {
  try {
    const raw = localStorage.getItem(VISTOS_KEY)
    if (!raw) return { ok: true, vistos: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { ok: true, vistos: {} }
    return { ok: true, vistos: parsed }
  } catch {
    return { ok: false, vistos: {} }
  }
}

function guardarVistos(vistos) {
  try {
    localStorage.setItem(VISTOS_KEY, JSON.stringify(vistos))
    return true
  } catch {
    return false
  }
}

export default function AvisoNuevaFeature() {
  const reduced = useReducedMotion()
  const [aviso, setAviso] = useState(null)
  const finRef = useRef(0) // fecha (ms) a la que vence el auto-cierre
  const restanteRef = useRef(0) // ms restantes tras pausar
  const timerRef = useRef(null)

  // Evaluación única por carga de la página: lee y limpia el mapa de
  // vistos, elige el aviso y agenda su aparición.
  useEffect(() => {
    const now = Date.now()
    const { ok, vistos } = leerVistos()
    if (!ok) return // sin storage: no mostrar (evita repetirlo siempre)
    // Limpieza: tira los ids que ya no están en el registro o que
    // vencieron (best effort: si la escritura falla, no importa).
    const limpios = cleanSeenIds(vistos, ANNOUNCEMENTS, now)
    if (Object.keys(limpios).length !== Object.keys(vistos).length)
      guardarVistos(limpios)

    const activo = getActiveAnnouncement(ANNOUNCEMENTS, Object.keys(limpios), now)
    if (!activo) return

    // Se marca visto cuando se MUESTRA (al dispararse el delay), no
    // cuando se cierra: un reload no lo vuelve a mostrar.
    const t = setTimeout(() => {
      if (guardarVistos({ ...limpios, [activo.id]: Date.now() })) setAviso(activo)
    }, DELAY_MOSTRAR_MS)
    return () => clearTimeout(t)
  }, [])

  // Auto-cierre a los 12 s + Escape.
  useEffect(() => {
    if (!aviso) return
    finRef.current = Date.now() + AUTO_CLOSE_MS
    timerRef.current = setTimeout(() => setAviso(null), AUTO_CLOSE_MS)
    const onKey = (e) => {
      if (e.key === 'Escape') setAviso(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      window.removeEventListener('keydown', onKey)
    }
  }, [aviso])

  // El timer de auto-cierre se pausa con hover o foco dentro del
  // toast (y se reanuda con el tiempo restante, sin recalcular).
  const pausarAutoCierre = () => {
    if (!aviso || !timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
    restanteRef.current = Math.max(0, finRef.current - Date.now())
  }

  const reanudarAutoCierre = () => {
    if (!aviso || timerRef.current || restanteRef.current <= 0) return
    finRef.current = Date.now() + restanteRef.current
    timerRef.current = setTimeout(() => setAviso(null), restanteRef.current)
  }

  // onBlur (equivalente a focusout en React: burbujea): solo reanuda
  // cuando el foco sale del toast (no al moverse entre sus propios
  // hijos).
  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) reanudarAutoCierre()
  }

  return (
    <AnimatePresence>
      {aviso && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
          transition={{ duration: 0.3, ease: EASE }}
          onMouseEnter={pausarAutoCierre}
          onMouseLeave={reanudarAutoCierre}
          onFocus={pausarAutoCierre}
          onBlur={handleBlur}
          // Mobile: a ancho completo en el borde inferior, respetando
          // safe-area (viewport-fit=cover). Desktop: esquina inferior
          // derecha, separada con el aire y su hairline. z-40 (bajo el
          // dropdown, que es z-50): si algún día se solapan, gana el
          // dropdown que el usuario está operando.
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 pt-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.875rem)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[24rem] sm:max-w-[calc(100vw-2.5rem)] sm:border sm:px-5 sm:py-4"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="label flex items-center gap-1.5 !text-[10px] text-accent">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-accent" />
                Novedad
              </p>
              <p className="font-display mt-1.5 text-[15px] leading-snug font-bold tracking-tight text-ink sm:text-base">
                {aviso.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{aviso.body}</p>
            </div>
            <button
              type="button"
              onClick={() => setAviso(null)}
              aria-label="Cerrar aviso"
              className="shrink-0 border border-line p-1.5 text-faint transition-colors hover:border-accent hover:text-accent"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
