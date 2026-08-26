# Design

<!-- impeccable:design-schema 1 -->

## Direction contract

**THESIS** — El análisis es un partido: la comunidad de un juego tiene dos marcadores, "hoy" (últimos 30 días) y "histórico" (toda la vida). La interfaz se lee como un score bug de transmisión deportiva: el % es el puntaje gigante, el veredicto es el titular. Se rechaza el arreglo por defecto de la categoría (página oscura con neón único y bordes que brillan, o cream+serif editorial): aquí el color habla el idioma semántico del veredicto (positivo/negativo) y el número manda.

**OWN-WORLD** — Base dark azul-humo (no negro puro) con un acento ámbar "LED encendido" y verdes/rojos semánticos; registro light de "gráficas de transmisión en día" (papel cálido, mismo tinta, ámbar más profundo). Tipografía: Archivo (eje ancho, mayúsculas, números atléticos) + Schibsted Grotesk para UI. Panes de esquina moderada (10-14px), reglas delgadas, overlines en mayúscula espaciada. Sin glow, sin glassmorphism, sin gradientes de arcoíris.

**STORY** — El jugador busca el juego → ve el partido → el marcador grande le dice en 1 segundo si la comunidad lo aprueba hoy y en general → lee el veredicto y los mejores comentarios → decide comprar/esperar/evitar.

**FIRST VIEWPORT** — Landing: marca compacta arriba-izquierda, buscador grande centrado como la pieza principal (estilo lower-third), fila de atajos de teclado debajo. Sin hero genérico: el buscador ES la portada. En análisis: banner de cabecera del juego a ancho completo, score bug con los dos %, y las dos columnas del partido.

**FORM** — Scoreboard / head-to-head (posición 5 en la lista ordenada por resonancia; staging: la propia estructura del producto, sin staging externo). Seed key: aebb2b0c (scope direction, mode operate).

## Tokens (provisionales, se fijan en el build)

### Dark (defecto — noche, cuarto oscuro, la pantalla es la luz)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0C0F16` | fondo base |
| `--surface` | `#121722` | paneles |
| `--raised` | `#1A2130` | hover / elementos elevados |
| `--line` | `rgba(148,163,199,.14)` | bordes |
| `--ink` | `#E8ECF4` | texto principal |
| `--muted` | `#98A2B8` | texto secundario |
| `--faint` | `#5F6B84` | texto terciario / overlines |
| `--accent` | `#FFB454` | acento "LED encendido": % grandes, focus, detalles |
| `--pos` | `#3DD68C` | reseñas positivas / 👍 |
| `--neg` | `#F45B69` | reseñas negativas / 👎 |
| `--mix` | `#FFC53D` | mixtas |

### Light (día, cuarto iluminado)

| Token | Valor |
|---|---|
| `--bg` | `#F4F3EF` |
| `--surface` | `#FFFFFF` |
| `--raised` | `#ECEAE3` |
| `--line` | `rgba(23,27,38,.12)` |
| `--ink` | `#171B26` |
| `--muted` | `#5A6478` |
| `--faint` | `#8A93A8` |
| `--accent` | `#E06A28` |
| `--pos` | `#128A54` |
| `--neg` | `#D23A4A` |
| `--mix` | `#A97510` |

## Reglas del sistema

- **El número manda.** El % positivo es el elemento más grande de la vista de análisis (Archivo Expanded, ~64-88px, color acento). Los scores de IGDB/Metacritic son chips secundarios, nunca compiten.
- **Veredicto primero.** Cada columna: overline → % gigante → veredicto (cierre) destacado → resumen → destacados. Lo que la IA concluye se ve antes de lo que la IA narra.
- **Color solo con significado.** Acento = el "LED" del puntaje y acciones primarias. Verde/rojo/ámbar solo para semántica de reseñas. Nada decorativo.
- **Dos familias, nunca tres.** Archivo (display/números/overlines en mayúscula tracking +0.08em) y Schibsted Grotesk (todo lo que se lee).
- **Panes, no vidrio.** Bordes sólidos delgados + fondo plano; el hover eleva 2px y aclara el borde, nada de glassmorphism ni glow.
- **Motion:** entradas con fade+8px (150-250ms, ease-out), stagger de 60ms entre elementos hermanados; el % hace count-up con spring al montar; transición de vistas ≤150ms; todo respeta `prefers-reduced-motion`.
- **Responsive:** el partido se apila en móvil (30 días sobre histórico) con la costura VS horizontal; el score bug mantiene sus 2 marcadores lado a lado (se reducen); nada de scroll horizontal.
- **A11y:** combobox del buscador con aria-activedescendant y keyboard nav; focus-visible en acento; contraste AA en ambos temas; iconos siempre con label.

## Prohibiciones

- Glow/blur neón en bordes, gradientes multicolor, glassmorphism, serif decorativa, emojis como iconografía (solo lucide), más de un acento cromático, animaciones que oculten contenido.
