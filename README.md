# Mosaico · FADETA Tajo-Tajuña

> Demo comercial de **Mosaico** — plataforma de seguimiento territorial LEADER para Grupos de Acción Local — aterrizada sobre la comarca **Tajo-Tajuña** de FADETA (Guadalajara, Castilla-La Mancha).

Producto de **[Darwin Geospatial](https://darwingeospatial.com)**. Hermano visual de OpenPAS (Interreg SUDOE) y CONFOR-CCAD.

## Qué es

Un micro-SaaS estático para presentar a Grupos de Acción Local que gestionan ayudas LEADER del PEPAC 2023-2027:

- **Landing** — propuesta de valor, problema, producto, precios.
- **Visor** — mapa interactivo con los 41 municipios de FADETA, 65 proyectos LEADER de demo, filtros por sector/estado/línea, dashboard de cobertura, ficha por proyecto, exportación a CSV.
- **Memoria** — informe anual auto-generado, imprimible a PDF, con mapas, tablas y evidencias de cumplimiento de la EDLP.

## Páginas

| URL | Qué hace |
|---|---|
| `/` (index.html) | Landing comercial |
| `/visor.html` | Visor interactivo (mapa + filtros + dashboard) |
| `/memoria.html` | Memoria anual auto-generada |

## Stack

- HTML + CSS + JavaScript vanilla — **sin build, sin npm, sin servidor**.
- **MapLibre GL JS 2.4** (mismo motor que OpenPAS HDH).
- Tipografía **Inter** (Google Fonts) — alineado con la familia visual Darwin.
- Basemap: CartoDB Positron (raster, sin API key).
- Datos como JSON en `/data/` cargados con `fetch()`.

## Estructura

```
.
├── index.html              # Landing
├── visor.html              # Visor interactivo
├── memoria.html            # Memoria anual auto-generada
├── data/
│   ├── municipios.json     # 41 municipios FADETA (coords, pob, área)
│   ├── edlp.json           # EDLP 23-27: retos, líneas, sectores, estados
│   └── proyectos.json      # 65 proyectos LEADER de demo
├── assets/
│   ├── css/
│   │   ├── main.css        # tokens + reset + componentes
│   │   ├── landing.css     # estilos de la landing
│   │   └── visor.css       # estilos del visor
│   └── js/
│       └── visor.js        # lógica del visor (MapLibre + filtros + KPIs)
└── .nojekyll               # evita procesado Jekyll en GitHub Pages
```

## Datos

Los datos son una mezcla de:

- **Reales** — los 41 municipios (RECAMDER, fadeta.es), los retos priorizados de la EDLP (con sus pesos del diagnóstico participativo), el marco financiero (3,8 M€), la ejecución 2024 (99 promotores, 1,5 M€, 38,8 %, 90 empleos), las cabeceras comarcales (Brihuega, Cifuentes, Sacedón, Trillo) con sus poblaciones del padrón INE.
- **Simulados pero plausibles** — los 65 proyectos LEADER concretos (nombres de promotor, importes individuales, descripciones). Diseñados para que la cartera total y los promedios encajen con las cifras públicas reportadas por FADETA, y para que la composición sectorial refleje el perfil productivo real de la comarca (lavanda Brihuega, miel de la Alcarria, Mar de Castilla, balneario Trillo, etc.).

> Antes de demo final con FADETA, sustituir `data/proyectos.json` por el listado real anonimizado y `data/municipios.json` por geometrías oficiales descargadas del CNIG (líneas límite municipales de Guadalajara filtradas por los 41 códigos INE).

## Despliegue en GitHub Pages

1. **Crear repo y push** del contenido al `main`.
2. En GitHub: **Settings → Pages → Source → Deploy from a branch → `main` / `(root)` → Save**.
3. La URL queda activa en `https://<usuario>.github.io/<repo>/` al cabo de 1–2 minutos.

No hay paso de build, ni workflow, ni token. Cada `git push` actualiza la demo.

## Desarrollo local

Cualquier servidor estático sirve. Las opciones más simples:

```bash
# Python 3
python -m http.server 8000

# Node
npx serve .

# VS Code
# Instala "Live Server" y abre index.html con "Open with Live Server"
```

Luego abre `http://localhost:8000` en el navegador.

> **No** abras los `.html` con `file://` directamente: el `fetch('data/...')` falla en local sin servidor.

## Sustitución por otro GAL

El producto está pensado para revender a cualquiera de los ~250 GAL de España. Para clonar la demo a otro GAL:

1. Reemplazar `data/municipios.json` con la lista del nuevo ámbito.
2. Reemplazar `data/proyectos.json` con su cartera real (o simulada para la demo de venta).
3. Ajustar el centroide y bbox en `_meta` para el nuevo ámbito.
4. Cambiar referencias a "FADETA Tajo-Tajuña" en `index.html`, `visor.html` y `memoria.html`.

Todo lo demás (sectores, retos, líneas, EDLP) es replanteable por configuración en `data/edlp.json`.

## Fuentes

- [fadeta.es](https://fadeta.es) · ámbito, EDLP, ayudas
- [RECAMDER](https://www.recamder.es) · ficha oficial GAL FADETA
- [INE](https://www.ine.es) · padrón municipal Guadalajara
- [IGN / CNIG](https://centrodedescargas.cnig.es/CentroDescargas/) · líneas límite municipales
- [JCCM Datos Abiertos](https://datosabiertos.castillalamancha.es) · GAL CLM
- [MITECO](https://miteco-map.gob.es) · Red Natura 2000

## Contacto

Mario García Peces · [mario.peces@darwingeospatial.com](mailto:mario.peces@darwingeospatial.com) · +34 633 232 735
