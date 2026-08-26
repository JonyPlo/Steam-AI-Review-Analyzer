import { useCallback, useState } from 'react'

const KEY = 'sara-theme'

// Tema dark/light persistido. El valor inicial ya está en <html data-theme>
// (script en index.html, antes del primer paint); acá solo sincronizamos estado.
export function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'dark',
  )

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // sin persistencia (modo privado) la app igual funciona
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
