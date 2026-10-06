# TETRIS 3D · Paper Quest

Tetris 3D jugable en el navegador con **TypeScript + three.js**: bloques voxel con aspecto de
papel recortado, diorama de cartón y papel, partículas de confeti, cámara con deriva sutil, HUD
como fichas de papel y efectos de sonido sintetizados con WebAudio.

## Requisitos

- Node.js 22.12+ y npm (Vite 8 y Vitest 5 exigen Node moderno).

## Instalación y ejecución

```bash
npm install
npm run dev      # local: http://localhost:5173 · LAN: http://<tu-IP>:5173
```

```bash
npm test         # tests de lógica (vitest 5, 64 tests)
npm run build    # type-check (tsc 7 nativo) + bundle Rolldown/Oxc
npm run preview  # sirve dist/ (también en LAN: http://<tu-IP>:4173)
npm run curate   # (opcional) regenera las semillas curadas de la música
```

## Controles

| Tecla | Acción |
|---|---|
| ← / → | Mover pieza (con auto-repetición DAS/ARR) |
| ↓ | Caída suave (+1 pto/fila) |
| ↑ / X | Rotar horario (SRS con wall-kicks) |
| Z | Rotar antihorario |
| Espacio | Caída instantánea (+2 ptos/fila, con fantasma) |
| C | Reserva (hold, un uso por pieza) |
| E | Efectos del fondo on/off (clima, personajes, temas) |
| M | Música procedural on/off |
| H | Ayuda (bloques y ayudas del juego) |
| P / Esc | Pausa |
| R | Reinicio |
| Enter | Confirmar (jugar / continuar / reintentar) |

### Controles táctiles (móvil / tableta)

En modo táctil aparecen controles superpuestos al canvas (botones ←/→ a la
izquierda y botones de acción a la derecha), con multitáctil real (botón de
movimiento + acción a la vez):

| Control táctil | Acción |
|---|---|
| ◀ / ▶ | Mover pieza (con auto-repetición DAS/ARR) |
| ↺ / ↻ | Rotar antihorario / horario |
| ⇊ | Caída instantánea |
| HOLD | Reserva |
| ❓ · ⏸ (arriba) | Ayuda · Pausa (Reiniciar vive en el overlay de pausa) |

El modo se elige automáticamente por detección de dispositivo; si la detección
es ambigua aparece una pantalla de selección al arrancar y la elección persiste
en `localStorage` (se puede cambiar con **⚙️ Controles**).

## Reglas

- Tablero 10×20, 7 piezas clásicas con aleatorio 7-bag.
- Gravedad progresiva por nivel: 100/300/500/800 × nivel, bonus de combo
  +50×combo×nivel, Tetris destacado.
- **Subida de nivel híbrida**: 10 líneas **o 45 s** de juego (lo que llegue
  antes), con tope en el nivel 20. Al subir por líneas el reloj del nivel se
  reinicia y viceversa.
- **Gauge de dificultad** en el HUD: se llena hacia el siguiente nivel y su
  color/leyenda indican la regla que va ganando (líneas en verde, reloj en azul).
- **Selector de nivel inicial (1–20)** en la pantalla de inicio; el nivel
  elegido también fija el escenario de arranque.
- **Escenarios y clima**: un tema cada 2 niveles (Pradera, Brisa, Atardecer,
  Lluvia, Tormenta con rayos y trueno, Noche, Nieve, Aurora, Amanecer, Cosmos)
  con transición suave de cielo, niebla, colinas, luces y clima (hojas, lluvia,
  nieve, estrellas, luciérnagas, fugaces), más personajes de papel de fondo
  (globo, pájaros, conejo, pingüino y OVNI).
- **Toggle de efectos** (botón o tecla E): apaga clima, personajes, confeti y
  cambios de tema, dejando el fondo clásico congelado. La preferencia se guarda
  en `localStorage` y arranca apagada si el sistema pide movimiento reducido.
- **Música procedural adaptativa** (botón o tecla M): generada en vivo con la
  Web Audio API, sin ficheros. Escala dórica de La; cada semilla fija una
  canción con variación (3 progresiones × 6 grooves × 4 rotaciones = 72
  combinaciones, con swing opcional) y el arpegio se mueve en pentatónica. Un
  único parámetro `intensity` (0–1) controla capas (pad siempre, bajo ≥ 0.2,
  arpegio ≥ 0.4, percusión ≥ 0.6), tempo (70→100 BPM) y brillo. Las partidas
  usan semillas de una **lista curada** (`npm run curate`, 50 semillas con
  cobertura de los 18 estilos); la semilla de cada partida se loguea en
  consola para reproducirla. Scheduler lookahead determinista (misma semilla ⇒
  misma canción). Pausa con el juego y con la pestaña oculta; preferencia
  guardada en `localStorage`.
- Lock delay de 0.5 s con hasta 15 reseteos al mover/rotar.
- Pieza fantasma, vista previa de las 3 piezas siguientes y reserva.
- **Pantalla de ayuda** (tecla `H`, visible al inicio): explica los 7 bloques y
  todas las ayudas del juego. Abrirla durante la partida pausa el juego.
- Pausa, reinicio y pantalla de fin de juego con puntuación.

## Arquitectura

```
src/
  game/       Lógica pura sin DOM (testeable con vitest)
    types.ts      Tipos, constantes (líneas/segundos por nivel, tope), colores, puntos
    pieces.ts     Formas, rotación, kicks SRS, 7-bag
    board.ts      Grid, colisiones, fusión, limpieza
    engine.ts     Estado, gravedad, lock delay, niveles híbridos, gauge, hold
  render/     Three.js (sin reglas de juego)
    scene.ts        Diorama base: cielo repintable, colinas, nubes, sol/luna, luces, confeti
    themes.ts       Los 10 escenarios: paletas, luces, clima y viento por nivel
    stage.ts        Controlador: transiciones de tema, rayos, toggle de efectos
    weather.ts      Clima procedural (lluvia, tormenta, nieve, hojas, estrellas, aurora, fugaces)
    characters.ts   Personajes de papel (globo, pájaros, conejo, pingüino, OVNI)
    boardRenderer.ts Cubos con pool, fantasma, marco de cartón y washi tape
    particles.ts    Confeti de papel (ráfagas + ambiente) con shader propio y alpha global
    effects.ts      Vibración de cámara, destello de línea
    materials.ts    Texturas procedurales (papel, cartón, cuadrícula, cinta) + toon + tinta
  ui/         Entrada con DAS/ARR, HUD, previews 2D canvas, preferencias (localStorage)
  platform/   Detección de dispositivo (escritorio/móvil/tableta) y ViewportManager
              (resize/orientation/visualViewport, pixel ratio limitado)
  audio/      Efectos sintetizados WebAudio (sin assets), incluido el trueno
    musicConstants.ts  Tonalidad, BPM, umbrales de capas, semillas curadas
    musicRng.ts        RNG determinista (mulberry32) + RNG por compás
    musicPatterns.ts   Progresiones/grooves, arpegio pentatónico, mapeo intensity (puro)
    musicEngine.ts     Grafo WebAudio + scheduler lookahead + voces
    musicDirector.ts   Fachada: start/stop/setIntensity + toggle on/off
    intensityTracker.ts Señales del juego → intensity suavizada (puro)
  tools/     fuera del bundle: curate-seeds.ts (npm run curate) puntúa semillas
  main.ts     Bucle, cámara con deriva, gauge/selector, toggle de efectos, eventos→efectos
```

La lógica (`src/game`) no importa three.js ni el DOM: se prueba sin navegador.

## Decisiones técnicas

- **Stack**: Vite 8 con **Rolldown + Oxc** (ya sin esbuild/Rollup), **TypeScript 7** nativo (tsc en Go,
  ~10× más rápido que el compilador JS), three.js **r186** y Vitest **5**. Target ES2023.
- **TS estricto y borrable**: `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`,
  `verbatimModuleSyntax` y `erasableSyntaxOnly` (sin enums ni *parameter properties*): el código
  también es válido para el *type stripping* nativo de Node. Tipado sin `any`.
- **three.js en su propio chunk** con `build.rolldownOptions.output.codeSplitting` (API de Rolldown
  que sustituye a `manualChunks`): la caché del navegador sobrevive a cambios de la app.
- **APIs modernas de three**: `Timer` (core desde r179) + Page Visibility API en lugar de `Clock`
  (deprecado en r183), y `PCF ShadowMap` (ya suave desde r182; `PCFSoftShadowMap` quedó deprecado).
- **SRS con wall-kicks** simplificado (tablas JLSTZ e I) para rotaciones correctas junto a paredes.
- **Render con pooling**: una `BoxGeometry` + `EdgesGeometry` compartidas y materiales por
  pieza cacheados; los meshes se reciclan para no generar basura por frame.
- **Eventos del motor → efectos**: el engine emite `lock/clear/levelup/harddrop…` y `main.ts`
  los traduce a partículas, destellos, vibración y sonido. Separación lógica/vista total.
- **Progresión híbrida y testeable**: `LINES_PER_LEVEL`/`SECONDS_PER_LEVEL`/`MAX_LEVEL`
  viven en `game/types.ts`; `levelProgress()` es puro y devuelve ratio + regla líder,
  y el reloj del nivel solo acumula en `update()` (nunca en pausa).
- **Escenarios desacoplados**: `themes.ts` es solo datos (paletas, luces, clima,
  viento); `stage.ts` los interpola (~1,6 s) y `weather.ts`/`characters.ts` usan
  pools fijos con `visible = false` cuando están inactivos: coste cero en reposo.
- **Toggle de efectos**: apagarlo congela el diorama en la paleta clásica y corta la
  simulación de clima, personajes, confeti, nubes y cubos flotantes (no solo los
  oculta), dejando el coste por frame como antes de la feature; se recuerda en
  `localStorage` y arranca apagado si el sistema pide movimiento reducido.
- **Audio 100 % sintetizado**: osciladores WebAudio, cero ficheros. La música
  procedural se programa con scheduler lookahead (tipo *tale of two clocks*) y
  cambios de intensidad cuantizados al compás; incluye limitador (compresor) y
  libera nodos/fuentes al terminar cada nota.
- **Analítica en Vercel**: `@vercel/analytics` + `@vercel/speed-insights` inyectados
  desde `src/analytics.ts` (`mode: 'auto'`: solo envía datos en producción; en local
  loguea en consola).

## Decisiones visuales

- Estética **papercraft + voxel** inspirada en *Paper Mario: Color Splash* y los tableros de
  Mario: cubos como fichas de papel con textura procedural (marco claro, trama de semitono,
  fibras), sombreado **toon** de 4 pasos y **contorno de tinta** por inverted hull.
- **Diorama de papel**: fondo con degradado de cielo, colinas y nubes recortadas, sol de cartón
  con rayos, confeti de papel cayendo y cubos "?" voxel flotando (giran y se mecen).
- **Tablero**: marco de cartón con **washi tape** en las esquinas, hoja de papel cuadriculado
  como fondo (recibe sombras) y micro-rotación aleatoria por bloque fijado (colocados a mano).
- **HUD en papel**: fichas crema con borde de tinta, sombras en capas, cinta adhesiva, leves
  rotaciones y tipografía redondeada (Fredoka con fallback del sistema). Gauge de progreso con
  relleno verde (líneas) o azul (reloj) y banner de nivel en papel amarillo.
- **Viaje visual de 10 etapas**: cada 2 niveles cambia el escenario con transición suave
  (~1,6 s) de cielo (canvas repintado), niebla, colinas, sol/luna, luces y suelo; tormenta
  con rayos (destello aditivo + trueno sintetizado), aurora aditiva, estrellas con parpadeo,
  luciérnagas y estrellas fugaces; personajes de papel animados según el tema (globo, bandada,
  conejo, pingüino y OVNI).
- Cámara en perspectiva con **deriva sinusoidal sutil** + trauma/shake en drops, clears y niveles.
- Feedback en cada acción: rebote al fijar, fichas que vuelan + destello al limpiar,
  lluvia de confeti en hard drop, toasts de Tetris/combo/nivel y overlay cartón con cinta.

## Despliegue (Vercel)

- **Framework preset**: Vite (auto-detectado). Build `npm run build`, output `dist/`.
- **Node 22.x** en el proyecto (ver `engines` en `package.json`).
- No hace falta `vercel.json`; si despliegas por CLI, basta `vercel` desde la raíz.
- **Web Analytics + Speed Insights** se inyectan automáticamente al cargar la app.
  Actívalos en el dashboard del proyecto en Vercel (Analytics → *Enable*) para
  empezar a ver tráfico y Web Vitals; en local solo se loguean en consola.

## Licencia

Distribuido bajo la licencia [MIT](LICENSE). Úsalo, modifícalo y compártelo libremente.
