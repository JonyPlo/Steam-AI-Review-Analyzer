# Design

<!-- impeccable:design-schema 1 -->

## Direction contract

**THESIS** — La interfaz es un museo: cada juego es una obra expuesta y su comunidad, el
curador. Buscar es la entrada (vestíbulo), el listado es el catálogo y el análisis es una
sala: la obra (portada), la placa de sala (ficha con el puntaje) y dos muros de texto
(Panel I: últimos 30 días, Panel II: desde el lanzamiento), con los comentarios
destacados como etiquetas de pared y una placa de veredicto dorada al cierre de cada
panel. Se rechaza: la página de gaming oscura con neón (rut de categoría), el broadsheet
crema + serif (opuesto predecible) y los dos mundos ya descartados (scoreboard ámbar,
revista ultramarina) como anti-referencias.

**OWN-WORLD** — Cubo blanco cálido: papel de galería cálido de día, carbón cálido de
noche (por defecto — el jugador decide la compra de noche, frente a Steam). Hairlines de
1px como única separación: sin reglas gruesas, sin halftone, sin grano, sin texturas.
Un solo acento, oro antiguo (gilt), que porta placas, puntajes, numerales y la acción
primaria; verde/rojo/ámbar estrictamente para polaridad de reseña. Esquinas 0–2px.
Doble marco (fotograma + cartela) solo en la placa de sala, la obra expuesta y las
placas del sistema (veredictos, colección, carga, error, vacío).
Archivo (expanded, caps para wordmark y labels; sentence case para nombres de obras —
el título de sala ES el nombre de la obra) + Schibsted Grotesk (cuerpo y UI).

**STORY** — El jugador entra al vestíbulo, busca un juego y visita su sala: la placa
responde con el % de puntuación en un segundo; el Panel I (el público hoy, con dos
etiquetas) y el Panel II (lo mejor valorado siempre, con dos etiquetas) completan la
lectura; cada panel cierra con su placa de veredicto. Decide: comprar, esperar o evitar.

**FIRST VIEWPORT** — Vestíbulo: franja de entrada (exposición permanente + fecha),
masthead en dos líneas con reveal por máscara ("Cada juego, una obra." / "Su público, el
crítico."), copia de apoyo, placa "Sobre la colección" a la derecha (miles de reseñas →
una lectura), y el buscador como mesa de visitas: label arriba, recuadro con hairline,
botón dorado, fila de atajos de teclado y banda de índice al pie.

**FORM** — Catálogo de museo / muros de texto de exposición (posición 7 de la lista
ordenada de direcciones fundamentadas). Seed key: 40037cb9 (mode: read). Staging
comprometido: el propio del museo — vestíbulo → catálogo → sala (ningún staging dealt
carga el flujo lineal del producto). Challenger sobreviviente como alterno nombrado:
streetwear industrial (zip-tie, hazard, caps entrecomillados) — si el usuario quiere
algo más ruidoso.

## Tokens

### Dark (museo de noche; por defecto)

> Por defecto: valor en `localStorage('sara-theme')`; si no hay, sigue
> `prefers-color-scheme`; si no se puede leer, oscuro.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#141210` | pared base (carbón cálido) |
| `--surface` | `#1B1917` | paneles, etiquetas, placas |
| `--raised` | `#232019` | track de gauge, hover, kbd |
| `--line` | `rgba(242,238,229,.13)` | hairline (la única línea) |
| `--ink` | `#F2EEE5` | texto principal (blanco cálido) |
| `--muted` | `#A69C8C` | texto secundario |
| `--faint` | `#8A8171` | labels, notas |
| `--accent` | `#C9A96A` | oro antiguo: puntajes, placas, botón |
| `--accent-ink` | `#1A150C` | texto sobre oro |
| `--pos` | `#4EC28F` | reseñas positivas |
| `--neg` | `#F07168` | reseñas negativas |
| `--mix` | `#D9A94E` | mixtas |
| `--shadow` | `rgba(0,0,0,.55)` | sombra suave con offset (dropdown, obra) |

### Light (galería de día)

| Token | Valor |
|---|---|
| `--bg` | `#F3F2EF` |
| `--surface` | `#FBFAF8` |
| `--raised` | `#E9E7E2` |
| `--line` | `rgba(26,21,14,.16)` |
| `--ink` | `#191613` |
| `--muted` | `#575149` |
| `--faint` | `#6E675C` |
| `--accent` | `#7D6128` |
| `--accent-ink` | `#FFFFFF` |
| `--pos` | `#1D7A4D` |
| `--neg` | `#B03A30` |
| `--mix` | `#8A6414` |
| `--shadow` | `rgba(26,21,14,.18)` |

## Reglas del sistema

- **El puntaje vive en la placa.** El % es el número de la sala: Archivo expanded,
  dorado, con count-up (1 s) y barra que se llena (1 s). Es el primer dato que se lee en
  la sala; los créditos oficiales (IGDB/Metacritic) van debajo como ficha técnica
  pequeña y nunca compiten en escala.
- **Hairlines, no reglas.** 1px `--line` separa todo; el aire hace el resto. El único
  doble marco (1px + cartela interior a 5px) se reserva a las placas del sistema
  (ficha de sala, veredictos y las placas `.plate` de vestíbulo/carga/error/vacío) y a
  la obra expuesta (su paspartú). Sin sombras en paneles: la única sombra con offset + blur va en el
  dropdown y bajo la obra expuesta.
- **Oro con significado solo.** Gilt = placas, numerals de panel (I/II), puntajes,
  botón primario, foco. Verde/rojo/ámbar = polaridad de reseña (chips y métricas).
  Nada decorativo: ningún otro color cromático en la página.
- **Dos familias, nunca tres.** Archivo (display: wordmark en caps, títulos de sala,
  numerales, nombres de catálogo; eje wdth 100–125) y Schibsted Grotesk (todo lo que se
  lee; labels en caps pequeñas tracking +0.16em).
- **El 2+2 es sagrado.** Panel I (últimos 30 días) lleva siempre sus 2 etiquetas y
  Panel II (historial completo) sus 2 etiquetas. Ningún destacado se eleva a la portada
  ni se deja un panel con uno solo (veto explícito del usuario sobre el rediseño #2).
- **Motion: la sala se abre; el vestíbulo respira.** Momento autoral único por vista:
  la obra se asienta (scale 1.04 → 1, 900 ms) mientras la placa cuenta el puntaje y
  llena la barra; los paneles suben con stagger de 100–150 ms; el resto entra con fade
  + rise ≤ 320 ms. En el vestíbulo, el muro de salas (6 frames con marcas de reseña,
  uno dorado) flota con `muroFloat` (translateY ±5 px, 7 s ease-in-out, delay escalonado
  por frame). Ease `cubic-bezier(0.22,1,0.36,1)`. Todo respeta `prefers-reduced-motion`
  (fade simple o estático; el muro se queda quieto).
- **Wash de sala.** Detrás del hero de la sala, el `header_image` difuminado
  (`blur-2xl`, opacidad ~.14 claro / .25 oscuro, `object-top`, `scale-110`) se funde
  hacia abajo con un gradiente hasta `--bg` en ~480–560 px. Ambiente, no banner:
  nunca compite con la placa ni con el texto.
- **La mesa después de buscar.** Bajo el buscador del vestíbulo, la grilla "Tus salas
  recientes" muestra hasta 6 visitas del cache local (`analisis_{appId}`, TTL 3 días)
  en grilla de pocas y grandes: 1 → 2 → 3 columnas (máx. 3 tarjetas en móvil). La
  cápsula se ve **completa** en su proporción nativa 616×353, sin recortes en ningún
  borde; nombre y "N % · M reseñas" a tamaño de lectura (base/label). Datos solo del
  cache real — nada inventado; sin visitas, la sección no existe. Clic abre la sala al
  instante desde el cache.
- **El título de sala no envuelve.** Una sola línea que se achica (font-size, con piso
  del 45 %) a medida que el nombre crece, sin estirar la placa ni que la portada se
  corte por los lados. Se mide en el nodo (clientWidth vs scrollWidth) al montar, al
  cargar la fuente y al redimensionar; `title` guarda el nombre completo.
- **Responsive:** la sala apila (obra → placa → paneles); en la portada, la obra
  mantiene `aspect-[2/1]` en móvil y se estira a la altura de la placa en `lg` (bordes
  inferiores alineados); dentro de cada panel la lectura es vertical (resumen → 2
  etiquetas → veredicto; el resumen y el veredicto van a ancho completo como párrafo
  corrido): en md+ las etiquetas comparten fila y la grilla les da la
  misma altura (la métrica se ancla abajo con mt-auto, una cita larga no abre huecos
  ni una corta deja el muro a medias) y el veredicto cierra como placa dorada a todo el
  ancho; en móvil todo se apila;
  el catálogo va 1 → 2 → 3 → 4 columnas; en el vestíbulo, el muro de salas se oculta en
  móvil (su lugar lo ocupa la grilla de recientes, 1 → 2 → 3 columnas, cápsula
  completa). Cero scroll horizontal. (Rediseño #3: tipografía un paso arriba en todo
  el microtexto — labels 12px, chips 13px, utilidades chicas +1–2px — para legibilidad.)
- **A11y:** combobox del buscador con aria-activedescendant y teclado; focus-visible en
  oro; contraste AA en ambos temas; iconos siempre con label; medidura de texto 65–75ch.

## Prohibiciones

Glow/blur neón, glassmorphism, gradientes de color, reglas de 2px o más, halftone,
grano de película, sombras duras con offset (imprenta), serif de ninguna clase, más de
un acento cromático, numeración decorativa de secciones sin secuencia real, citas,
reseñas o testimonios inventados, animaciones que oculten contenido.
