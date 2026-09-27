# AGENTS.md

Steam AI Review Analyzer: la IA lee reseñas de Steam y devuelve un resumen (últimos 30 días + historial), 2 destacados por panel y un veredicto. Todo el contenido y código es en español (es-AR, voseo). Los contratos de producto y diseño viven en `PRODUCT.md` y `DESIGN.md`: leelos antes de decidir cualquier cosa sobre UI o contenido.

## Estructura

- Monorepo con npm workspaces: `server/` (Node/Express, :3001) + `web/` (React 19 + Vite, :5173). Node 18+ (recomendado 20+).
- Todo el backend es UN archivo: `server/server.js` (~950 líneas). Todo el frontend es UN archivo: `web/src/App.jsx` (~1160 líneas); `web/src/components/` solo tiene SearchBar, ReviewCard y PercentScore.
- No hay test suite, typecheck ni formatters. La verificación es `npm run lint` + `npm run build`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | en la raíz (instala los workspaces) |
| `npm run dev` | API (:3001) + web (:5173) en paralelo (concurrently) |
| `npm run lint` | ESLint solo de `web/` (el server no tiene lint) |
| `npm run build` | build de la web → `web/dist` |
| `npm start` | solo la API |

- **El server no tiene watcher**: su `dev` es `node server.js` plano. Tras editar `server/server.js` hay que reiniciarlo (Ctrl+C en `npm run dev` mata los dos procesos; volvé a correrlo).
- El proxy de Vite `/api → localhost:3001` está hardcodeado en `web/vite.config.js`: si cambiás `PORT` de la API, hay que sincronizarlo ahí.
- En producción la web usa `VITE_API_BASE` (default `/api`). La API **no sirve** `web/dist` (no hay middleware estático): el build se despliega aparte.
- `web/dist` y `node_modules` están gitignoreados: nunca commitear artefactos de build.

## Claves (`server/.env`)

- `GROQ_API_KEY` (IA principal), `GEMINI_API_KEY` (respaldo), `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` (opcional; sin ellos se omite la sección de scores). Funciona con cero claves, pero sin al menos Groq o Gemini no hay análisis.
- El server carga el `.env` con `dotenv/config` **desde el cwd del workspace**: solo funciona si lo arrancás con `npm run dev --workspace server` (o desde dentro de `server/`). Correr `node server/server.js` desde la raíz del repo NO carga las claves.
- En Windows el `cp` del README no funciona: `Copy-Item server/.env.example server/.env`.
- `server/.env` contiene claves reales y está gitignoreado. Nunca commitearlo ni exponer su contenido.

## Cómo funciona (las trampas)

- Dos endpoints de API: `GET /buscar?name=` (scraping del HTML SSR del store de Steam; fallback al API `storesearch`, topado en 10) y `GET /analizar/:appId`. La web los llama como `/api/buscar…` / `/api/analizar/…` (el proxy les quita el prefijo).
- **El shape de la respuesta de `/analizar` es el contrato con `App.jsx`**: `metaCard`, `resumenTecnico` (30 días), `resumenGeneral` (histórico), `cierreRecientes`/`cierreHistoricos`, `destacadosRecientes`/`destacadosHistoricos`, `introDestacados*`, `igdb`. Renombrar o quitar un campo rompe el frontend.
- Las dos columnas del `/analizar` usan dos muestras de `appreviews` de Steam. Quirk ya resuelto en el código, no lo "simplifiquen": **sin `day_range`, Steam NO devuelve todo el historial**; "todo el historial" exige `day_range=9223372036854775807` (máx. int64).
- Segundo quirk de Steam resuelto en `tomarDetailsAppdetails()` (no lo "simplifiquen" de vuelta a `res.data[appId]`): desde 2026, `/api/appdetails` para juegos recién registrados **NO responde keyeado por el appid pedido** (ej.: `appids=3764200` devuelve la clave `"4460240"`; `appids=2584270` → clave `"4711730"`). El `data.steam_appid` siempre es el id real y el helper matchea por él; los juegos viejos siguen keyeados por el id pedido. Adicional: las URLs de imagen genéricas (`apps/{id}/header.jpg`, `capsule_231x87.jpg`) dan 404 para TODOS los juegos — la única fuente confiable de imágenes es el `header_image`/`capsule_imagev5` con hash que entrega `appdetails`.
- Las reseñas se filtran de basura (plantillas, ASCII art, <3 chars) y por longitud (≤400 chars en el original; tope duro de 900 después de traducir). Cada panel toma los 2 más valorados de su muestra de 50.
- **El 2+2 es sagrado** (veto explícito del usuario, ver PRODUCT.md y DESIGN.md): Panel I y Panel II llevan siempre sus 2 destacados cada uno. No dejar un panel con 1 ni elevar un destacado a la portada.
- IA: 2 llamadas por análisis (una por panel), JSON estricto `{resumen, destacados[], cierre}`, temperatura 0.4. Cascada: Groq (`openai/gpt-oss-120b` → `qwen/qwen3.6-27b` preview → `openai/gpt-oss-20b`) → Gemini 2.5 Flash, con orden distinto por columna para repartir la cuota. Si todos fallan, el server devuelve un fallback determinístico con los porcentajes reales (nunca inventa opiniones).
- La pausa de 1.5 s entre las 2 llamadas de IA protege los límites por IP de Steam: no quitarla. El análisis tarda 10–40 s de verdad; la UI muestra cronómetro real.
- Frontend: sin router ni lib de estado — una página con 3 vistas (`inicio`/`cards`/`analisis`). Cache en `localStorage` con TTL de 3 días: `busqueda3_{query}` y `analisis_{appId}`; la grilla "Tus salas recientes" del inicio lee las claves `analisis_*` (no inventar datos: sin visitas, la sección no existe).
- Tema: se define en `<html data-theme>` con un script inline en `web/index.html` ANTES del primer paint (localStorage `sara-theme` → `prefers-color-scheme` → dark por defecto). Tokens en `web/src/main.css` (`@theme inline` → Tailwind 4).

## Convenciones

- Comentarios del código en español, tono voseo ("Buscá", "probá"): mantenerlo al editar.
- Los descriptores oficiales de Steam se traducen en **dos lugares**: `web/src/i18n.js` (chips, title case) y `traducirDescripcionValve()` en `server/server.js` (para el prompt de IA). Si agregás un valor nuevo, actualizá ambos.
- El diseño es un contrato cerrado (`DESIGN.md`, mundo "museo"): un solo acento —oro antiguo— (verde/rojo/ámbar solo para polaridad de reseña), hairlines de 1 px como única línea, esquinas 0–2 px, solo Archivo + Schibsted Grotesk. Prohibido: neón/glow, glassmorphism, gradientes de color, reglas ≥2 px, serif, acentos cromáticos nuevos, reseñas/testimonios inventados.
- El crédito "Hecho por JonyPlo" debe seguir en el footer (brand commitment, PRODUCT.md).
- El usuario hace commits "Backup:" como checkpoints antes de cambios arriesgosos (no es historia convencional): no "limpiarlos" ni asuman conventions estrictas de commits.
