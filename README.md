# 🏛️ Steam AI Review Analyzer

**Cada juego, una obra. Su público, el crítico.**

Buscá un juego en Steam y la IA lee sus reseñas para decirte, en 1–2 minutos, qué opina
la comunidad de verdad: un resumen de los últimos 30 días, un resumen histórico, los
comentarios más valorados de cada muestra (traducidos al español cuando no lo están) y
un veredicto de cierre en cada columna. No es un agregador de scores: es un
**sintetizador** — la diferencia es que la IA lee una muestra filtrada (sin basura,
ASCII art ni reseñas gigantes) y devuelve la *percepción* de la comunidad, no los
números crudos.

## ✨ Qué hace

- **Buscador con dropdown en vivo** contra la tienda de Steam (debounce 400 ms,
  mínimo 3 caracteres, navegación por teclado, hasta 20 juegos con cápsula, reseñas
  y polaridad).
- **Sala de análisis por juego** con dos muros de lectura:
  - **Panel I — Últimos 30 días**: qué dice el público hoy + 2 reseñas destacadas.
  - **Panel II — Todo el historial**: lo mejor valorado desde el lanzamiento + 2 reseñas destacadas.
  - Cada panel cierra con su **placa de veredicto** (recomendación concreta).
- **Placa de sala** con el porcentaje oficial de Steam, la clasificación traducida
  ("Extremadamente positivas", "Mixtas"…) y los votos reales, siempre en filas de
  altura fija: ningún texto largo mueve o desalinea la interfaz.
- **Sello de Metacritic** flotante (clicable, con el metascore) cuando existe; su
  presencia o ausencia nunca cambia el tamaño de la placa.
- **Ficha técnica con scores de IGDB** (prensa / usuarios / total) si hay credenciales.
- **Inicio con tus salas recientes**: grilla con las portadas en alta calidad, en su
  proporción original (sin recortes) y todas las visitas, en desktop y mobile.
- **Tema oscuro y claro** (por defecto oscuro — se decide la compra de noche),
  sin flash de tema equivocado.
- **Cache en `localStorage`** (TTL 3 días) para búsquedas y análisis.
- **100 % en español (es-AR)**; los nombres de juegos llegan en español desde Steam.

## 🏛️ La experiencia

La interfaz está pensada como un museo:

1. **Vestíbulo** — la portada con el buscador como mesa de visitas.
2. **Catálogo** — la búsqueda: hasta 20 obras en grilla, con su polaridad de reseñas.
3. **Sala** — la obra expuesta (portada completa, en marco) junto a su placa de sala,
   y los dos muros de texto con las reseñas destacadas como etiquetas de pared.

## ⚙️ Cómo funciona el análisis

1. `/buscar?name=…` parsea la página de resultados de la tienda de Steam (SSR) y
   enriquece cada juego con el resumen oficial de reseñas. Si el HTML no está
   disponible, usa el API `storesearch` como respaldo.
2. `/analizar/:appId` toma dos muestras de reseñas filtradas (últimos 30 días y todo
   el historial), descarta la basura y arma **2 llamadas de IA** (una por columna)
   que devuelven en un solo JSON: resumen, 2 destacados traducidos y cierre.
3. Si un proveedor de IA falla o se satura, pasa al siguiente de la cascada; si todos
   fallan, la app muestra un **cierre determinístico** armado con los porcentajes
   reales de Steam (nunca inventa opiniones).

### Cascada de IA

Cuatro proveedores, con órdenes distintos por columna para no pegarle las 2 veces
seguidas a la misma cuota:

| # | Proveedor | Modelo |
|---|-----------|--------|
| 1 | Groq | `openai/gpt-oss-120b` |
| 2 | Groq | `qwen/qwen3.6-27b` (preview, respaldo extra) |
| 3 | Groq | `openai/gpt-oss-20b` |
| 4 | Gemini | `gemini-2.5-flash` |

- **Panel I (recientes)**: 120B → Qwen 3.6 → 20B → Gemini.
- **Panel II (históricos)**: 20B → Gemini → 120B → Qwen 3.6.
- Las respuestas son JSON estricto (system prompt), temperatura 0.4, máx. 1800 tokens.

## 🔌 API

| Endpoint | Descripción |
|---|---|
| `GET /buscar?name=…` | Buscador de la tienda (hasta 20 juegos, enriquecidos con reseñas). |
| `GET /analizar/:appId` | Análisis completo: portada, % oficial, 2 columnas de IA, destacados, IGDB y Metacritic. |

## 🎨 Diseño

Lenguaje de galería: papel de galería cálido (claro) o carbón cálido (oscuro),
hairlines de 1 px como única separación, un solo acento — oro antiguo — que porta
placas, puntajes y la acción primaria, y verde/rojo/ámbar estrictamente para
polaridad de reseña. Tipografía Archivo (wordmark, labels, nombres de obra) +
Schibsted Grotesk (cuerpo y UI). Ver `DESIGN.md` y `PRODUCT.md` para el contrato
completo de dirección.

## 🚀 Puesta en marcha

**Requisitos:** Node.js 18+ (recomendado 20+).

```bash
# 1. Instalar (monorepo con workspaces)
npm install

# 2. Claves de API
cp server/.env.example server/.env   # y completarlas

# 3. Levantar todo (API en :3001 + web en :5173)
npm run dev
```

La web apunta a la API vía proxy de Vite (`/api` → `localhost:3001`), no hay que
configurar URLs. Abrí `http://localhost:5173`.

### Claves (`server/.env`)

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `GROQ_API_KEY` | Proveedor principal de IA (3 modelos) | Sí, o usar solo Gemini |
| `GEMINI_API_KEY` | Respaldo fuera de Groq (otra cuota) | No (la cascada se acorta) |
| `IGDB_CLIENT_ID` | Scores de prensa/usuarios | No (se omite la sección) |
| `IGDB_CLIENT_SECRET` | Idem | No |

## 📁 Estructura

```
├── server/
│   └── server.js        # API Node/Express: búsqueda, paginación y filtrado de
│                        # reseñas, cascada de IAs, scores IGDB/Metacritic
├── web/
│   ├── index.html
│   ├── public/favicon.svg
│   └── src/
│       ├── App.jsx      # Estado global, vistas (vestíbulo, catálogo, sala)
│       ├── i18n.js      # Traducción de los descriptores oficiales de Steam
│       ├── theme.js     # Temas (oscuro/claro)
│       ├── main.css     # Tokens y estilo base (Tailwind 4)
│       └── components/  # SearchBar, ReviewCard, PercentScore
├── PRODUCT.md           # Contrato de producto
└── DESIGN.md            # Contrato de dirección visual
```

## 🛠️ Scripts (raíz)

| Script | Qué hace |
|---|---|
| `npm run dev` | API + web en desarrollo (concurrently) |
| `npm run build` | Build de producción de la web (`web/dist`) |
| `npm run lint` | ESLint del frontend |
| `npm start` | Solo la API (producción) |

## 🧰 Stack

- **Frontend:** React 19 · Vite 8 · Tailwind CSS 4 · Framer Motion · lucide-react
- **Backend:** Node.js · Express 5 · axios · groq-sdk · dotenv
- **Datos:** Steam (tienda + appreviews), IGDB, Metacritic
- **IA:** Groq (GPT-OSS 120B / 20B, Qwen 3.6 27B) → Gemini 2.5 Flash
