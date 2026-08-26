# Steam AI Review Analyzer

Buscá un juego, y la IA lee cientos de reseñas de Steam para contarte rápido qué opina la comunidad: resumen de los últimos 30 días, resumen histórico, los comentarios más valorados (traducidos al español) y un veredicto de cierre en cada columna.

## Estructura (monorepo)

| Carpeta | Qué es |
|---|---|
| `server/` | API en Node/Express: búsqueda en Steam, paginación y filtrado de reseñas, cascada de IAs (Groq → Gemini), scores de IGDB/Metacritic |
| `web/` | Frontend en React + Vite + Tailwind: buscador con dropdown, vista de resultados y análisis |

## Puesta en marcha

```bash
npm install

# 1. Copiar y completar las claves
cp server/.env.example server/.env

# 2. Levantar todo (API en :3001 + web en :5173)
npm run dev
```

La web apunta a la API vía proxy de Vite (`/api` → `localhost:3001`), no necesitás configurar URLs.

## Cómo funciona el análisis

1. `/buscar?name=...` → buscador de la tienda de Steam (dropdown).
2. `/analizar/:appId` → trae dos muestras de reseñas filtradas (últimos 30 días y todo el historial), descarta basura/ASCII art/resenas largas y arma 2 llamadas de IA (una por columna) que devuelven en un solo JSON: resumen, 2 destacados traducidos y cierre.
3. Si un proveedor de IA falla o se satura, pasa al siguiente de la cascada; si todos fallan, el frontend muestra un cierre determinístico con los porcentajes reales de Steam.

## Claves necesarias (server/.env)

- `GROQ_API_KEY` — proveedor principal (gpt-oss-120b / gpt-oss-20b / qwen3.6-27b)
- `GEMINI_API_KEY` — respaldo de otro proveedor
- `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` — scores de prensa y usuarios (opcionales: sin ellos la app sigue funcionando)
