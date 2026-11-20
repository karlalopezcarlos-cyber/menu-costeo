/**
 * Genera el favicon, el icono de iOS y la portada de WhatsApp/redes a partir de la marca.
 *
 * Se escriben como archivos, no con ImageResponse en tiempo de ejecucion: son tres imagenes
 * que no cambian nunca y no tiene caso rasterizarlas en cada peticion.
 *
 * Uso: node iconos.mjs <carpeta-del-proyecto>
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const raiz = process.argv[2];
if (!raiz) throw new Error("Falta la carpeta del proyecto");

const NEGRO = "#0d0c0b";
const ORO = "#d4af37";
const ORO_OSCURO = "#b8942a";
const ORO_CLARO = "#e5c566";
const CREMA = "#f0ede8";

/**
 * La olla con el fajo de billetes, dibujada en el lienzo de 200x200 de la marca.
 * `simple` quita el signo de porcentaje y el marco interior del billete: a 16 pixeles esos
 * trazos se vuelven lodo y ensucian mas de lo que aportan.
 */
function marca({ simple }) {
  const detalle = simple
    ? ""
    : `
    <rect x="77" y="29" width="42" height="18" rx="1.5" fill="none" stroke="${ORO_OSCURO}" stroke-width="1.1"/>
    <ellipse cx="98" cy="38" rx="7.5" ry="7.5" fill="none" stroke="${ORO_OSCURO}" stroke-width="1.3"/>
    <g fill="none" stroke="${ORO_OSCURO}" stroke-width="1.6" stroke-linecap="round">
      <circle cx="95" cy="35" r="1.5"/>
      <circle cx="101" cy="41" r="1.5"/>
      <path d="M102 33.5 L94 42.5"/>
    </g>`;
  return `
  <g transform="translate(100,46) scale(0.68) translate(-100,-46)">
    <g transform="rotate(-9 100 42)">
      <rect x="78" y="34" width="48" height="24" rx="2.5" fill="${ORO_OSCURO}"/>
      <rect x="76" y="30" width="48" height="24" rx="2.5" fill="${ORO_CLARO}"/>
      <rect x="74" y="26" width="48" height="24" rx="2.5" fill="${CREMA}"/>
      ${detalle}
    </g>
  </g>
  <path d="M76 68 h-6 a5 5 0 0 0 0 10 h6 M124 68 h6 a5 5 0 0 1 0 10 h-6"
        fill="none" stroke="${CREMA}" stroke-width="${simple ? 4.2 : 3.4}"/>
  <path d="M77 66 h46 v14 a14 14 0 0 1 -14 14 H91 a14 14 0 0 1 -14 -14 Z" fill="${ORO}"/>
  <path d="M72 63.5 h56" stroke="${CREMA}" stroke-width="${simple ? 4.8 : 4}" stroke-linecap="round"/>`;
}

/** El sello cuadrado: fondo negro, aro dorado y la marca adentro. */
function sello({ simple, lado = 200 }) {
  const esquina = Math.round(lado * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${lado}" height="${lado}">
  <rect width="200" height="200" rx="${(esquina / lado) * 200}" fill="${NEGRO}"/>
  <rect x="13" y="13" width="174" height="174" rx="${(esquina / lado) * 200 - 7}"
        fill="none" stroke="${ORO}" stroke-width="${simple ? 7 : 5}"/>
  <g transform="translate(100,100) scale(${simple ? 1.62 : 1.5}) translate(-100,-63)">
    ${marca({ simple })}
  </g>
</svg>`;
}

// --- 1. Favicon -----------------------------------------------------------------
// SVG, no PNG: el navegador lo escala a 16, 32 o 64 sin que se despeine.
const favicon = sello({ simple: true });
await writeFile(path.join(raiz, "app/icon.svg"), favicon);

// --- 2. Icono de iOS ------------------------------------------------------------
// Safari lo pide en PNG de 180 y le pone la esquina redonda el sistema, no nosotros.
await sharp(Buffer.from(sello({ simple: false, lado: 180 })))
  .resize(180, 180)
  .png()
  .toFile(path.join(raiz, "app/apple-icon.png"));

// --- 3. Portada de WhatsApp y redes ---------------------------------------------
// 1200x630 es la medida que piden WhatsApp, Facebook y LinkedIn.
const PORTADA = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="luz1" cx="50%" cy="0%" r="62%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="luz2" cx="100%" cy="100%" r="58%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="filo" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ORO}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${ORO}" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="${ORO}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="${NEGRO}"/>
  <rect width="1200" height="630" fill="url(#luz1)"/>
  <rect width="1200" height="630" fill="url(#luz2)"/>

  <g transform="translate(600,196) scale(0.78) translate(-100,-100)">
    ${sello({ simple: false }).replace(/<\/?svg[^>]*>/g, "")}
  </g>

  <text x="587" y="400" text-anchor="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="92"
        font-weight="300" letter-spacing="26" fill="${CREMA}">FONDO</text>

  <rect x="470" y="430" width="260" height="2" fill="url(#filo)"/>

  <text x="596" y="476" text-anchor="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="21"
        font-weight="500" letter-spacing="7.5" fill="#a9a296">CONTROL <tspan fill="${ORO_OSCURO}">·</tspan> RENTABILIDAD <tspan fill="${ORO_OSCURO}">·</tspan> ESTRATEGIA</text>

  <text x="600" y="540" text-anchor="middle"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30"
        fill="#a9a296">Soluciones integrales para <tspan fill="${CREMA}">negocios de alimentos</tspan></text>
</svg>`;

await sharp(Buffer.from(PORTADA)).png().toFile(path.join(raiz, "app/opengraph-image.png"));

console.log("escritos: app/icon.svg, app/apple-icon.png, app/opengraph-image.png");
