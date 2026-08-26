# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Jugadores hispanohablantes que están evaluando si comprar un juego en Steam. Están a segundos de comprar y quieren saber en 1-2 minutos qué opina la comunidad real, sin leer cientos de reseñas individuales.

## Product Purpose

Dado un juego, leer decenas de reseñas de Steam y condensar la opinión de la comunidad en algo escaneable: un resumen de los últimos 30 días, un resumen histórico, los 2 mejores comentarios de cada muestra (traducidos al español si no lo están) y un cierre con veredicto (recomendación reciente + conclusión histórica). Éxito = el usuario decide comprar/esperar/evitar sin abrir la página de reseñas de Steam.

## Positioning

No es un agregador de reseñas (Steam, Metacritic ya existen). Es un **sintetizador**: la diferencia es que la IA lee la muestra filtrada (sin basura, ASCII art ni reseñas gigantes) y devuelve la *percepción* de la comunidad, no los números crudos. Los scores oficiales (Steam/IGDB/Metacritic) se muestran como referencia, no como contenido principal.

## Operating Context

- Monorepo: `server/` (Node/Express :3001) + `web/` (React/Vite :5173, proxy `/api`).
- Flujo: búsqueda con dropdown (debounce 400ms, mínimo 3 chars) → listado de hasta 10 juegos → análisis (10-40s, dos llamadas de IA) → vista de análisis con 2 columnas.
- La UI es 100% en español (es-AR). Los nombres de juegos llegan en español (Steam `l=spanish`).
- Cache en `localStorage` (TTL 3 días) para búsquedas y análisis.
- La app funciona sin claves de IGDB (sección de scores omitida); Groq/Gemini tienen cascada de respaldo.

## Capabilities and Constraints

- Búsqueda: `storesearch` de Steam (10 resultados, orden por popularidad).
- Reseñas: paginación con cursor, `day_range` (30 días / todo el historial), filtro de basura (plantillas, ASCII art, <3 chars), tope de 400 chars en el original y 900 post-traducción para destacados.
- IA: cascada Groq (gpt-oss-120b → qwen3.6-27b → gpt-oss-20b) → Gemini 2.5 Flash. Una llamada por columna; cada una devuelve `{resumen, destacados[], cierre}` en un solo JSON. Fallback determinístico si todos fallan.
- Destacados: 2 por columna, los más valorados (votos + weighted_vote_score + reacciones); idiomas densos (chinés/japonés/coreano) solo si el original ≤50 chars.
- El frontend no tiene rutas ni login: una sola página con 3 vistas (inicio / listado / análisis).

## Brand Commitments

- Nombre: "Steam AI Review Analyzer" (el usuario lo eligió; no renombrar sin pedir).
- Créditos: "Hecho por JonyPlo" debe seguir figurando en algún lugar discreto.
- El usuario pidió explícitamente: estética moderna, premium, minimalista, que NO parezca una página típica hecha con IA; oscuro por defecto con opción de tema claro; animaciones que se sientan bien; 100% responsive.
- El usuario mantiene la esencia funcional intacta (búsqueda dropdown, dos columnas de análisis, destacados, scores): solo cambia la apariencia.

## Evidence on Hand

- Datos reales por juego: name, total_reviews, positive %, review_score_desc, header/capsule images, metacritic score, IGDB scores, reseñas con votos/reacciones/horas de juego/autor.
- No hay logo, marca registrada ni testimonios. No fabricar ninguno.

## Product Principles

1. La opinión de la comunidad es el producto; los números oficiales son contexto secundario.
2. Escaneable en segundos: el veredicto y el % deben leerse antes que cualquier párrafo.
3. Honestidad: nunca inventar temas que la comunidad no mencionó; los fallbacks usan datos reales, no texto genérico.
4. Todo el contenido que llega de la API es de terceros: se muestra tal cual (traducido solo si la IA lo hace), sin adornos que lo alteren.
5. Velocidad percibida: el análisis tarda; mientras tanto la interfaz debe comunicar progreso real, no un spinner ciego.
