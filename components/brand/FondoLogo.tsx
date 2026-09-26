/**
 * Marca Fondo.
 *
 * Un solo dibujo (la olla con el fajo de billetes) en tres presentaciones:
 *   - FondoMark   el dibujo solo, sin recuadro
 *   - FondoBadge  el dibujo dentro del sello cuadrado, sin texto (para espacios chicos)
 *   - FondoSeal   el sello completo con la palabra FONDO (para portadas y el acceso)
 *
 * `tone` indica sobre que fondo se dibuja: "dark" para fondos oscuros, "light" para claros.
 * Las coordenadas viven en un lienzo de 200x200; el dibujo se apoya alrededor de (100, 63).
 */

export type BrandTone = "dark" | "light";

type Palette = {
  stroke: string;
  body: string;
  bill: string;
  billEdge: string | null;
  detail: string;
  text: string;
  ring: string;
  hair: string;
};

const PALETTES: Record<BrandTone, Palette> = {
  dark: {
    stroke: "#f0ede8",
    body: "#b08f5b",
    bill: "#f0ede8",
    billEdge: null,
    detail: "#8a6a3e",
    text: "#f0ede8",
    ring: "#b08f5b",
    hair: "#46423a",
  },
  light: {
    stroke: "#1c1b19",
    body: "#8a6a3e",
    bill: "#ffffff",
    billEdge: "#1c1b19",
    detail: "#8a6a3e",
    text: "#1c1b19",
    ring: "#8a6a3e",
    hair: "#e5e1da",
  },
};

/** El dibujo: fajo de billetes al 68% sobre la olla. */
function MarkPaths({ c }: { c: Palette }) {
  return (
    <>
      <g transform="translate(100,46) scale(0.68) translate(-100,-46)">
        <g transform="rotate(-9 100 42)">
          <rect x="78" y="34" width="48" height="24" rx="2.5" fill="#8a6a3e" />
          <rect x="76" y="30" width="48" height="24" rx="2.5" fill="#cdb183" />
          <rect
            x="74"
            y="26"
            width="48"
            height="24"
            rx="2.5"
            fill={c.bill}
            stroke={c.billEdge ?? undefined}
            strokeWidth={c.billEdge ? 1.4 : undefined}
          />
          <rect x="77" y="29" width="42" height="18" rx="1.5" fill="none" stroke={c.detail} strokeWidth="1.1" />
          <ellipse cx="98" cy="38" rx="7.5" ry="7.5" fill="none" stroke={c.detail} strokeWidth="1.3" />
          <g fill="none" stroke={c.detail} strokeWidth="1.6" strokeLinecap="round">
            <circle cx="95" cy="35" r="1.5" />
            <circle cx="101" cy="41" r="1.5" />
            <path d="M102 33.5 L94 42.5" />
          </g>
        </g>
      </g>
      <path
        d="M76 68 h-6 a5 5 0 0 0 0 10 h6 M124 68 h6 a5 5 0 0 1 0 10 h-6"
        fill="none"
        stroke={c.stroke}
        strokeWidth="3.4"
      />
      <path d="M77 66 h46 v14 a14 14 0 0 1 -14 14 H91 a14 14 0 0 1 -14 -14 Z" fill={c.body} />
      <path d="M72 63.5 h56" stroke={c.stroke} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

export function FondoMark({
  size = 32,
  tone = "dark",
  className,
}: {
  size?: number;
  tone?: BrandTone;
  className?: string;
}) {
  const c = PALETTES[tone];
  return (
    <svg
      viewBox="66 28 68 70"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Fondo"
    >
      <MarkPaths c={c} />
    </svg>
  );
}

export function FondoBadge({
  size = 32,
  tone = "dark",
  className,
}: {
  size?: number;
  tone?: BrandTone;
  className?: string;
}) {
  const c = PALETTES[tone];
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} role="img" aria-label="Fondo">
      <rect x="6" y="6" width="188" height="188" rx="42" fill="none" stroke={c.hair} strokeWidth="1.2" />
      <rect x="14" y="14" width="172" height="172" rx="36" fill="none" stroke={c.ring} strokeWidth="5" />
      <g transform="translate(100,100) scale(1.5) translate(-100,-63)">
        <MarkPaths c={c} />
      </g>
    </svg>
  );
}

export function FondoSeal({
  size = 150,
  tone = "dark",
  className,
}: {
  size?: number;
  tone?: BrandTone;
  className?: string;
}) {
  const c = PALETTES[tone];
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} role="img" aria-label="Fondo">
      <rect x="6" y="6" width="188" height="188" rx="42" fill="none" stroke={c.hair} strokeWidth="1.2" />
      <rect x="14" y="14" width="172" height="172" rx="36" fill="none" stroke={c.ring} strokeWidth="2.4" />
      <g transform="translate(100,74) scale(0.88) translate(-100,-63)">
        <MarkPaths c={c} />
      </g>
      <text
        x="100"
        y="150"
        textAnchor="middle"
        fontFamily="var(--font-geist-sans), Helvetica, Arial, sans-serif"
        fontSize="20"
        fontWeight="600"
        letterSpacing="6"
        fill={c.text}
      >
        FONDO
      </text>
    </svg>
  );
}
