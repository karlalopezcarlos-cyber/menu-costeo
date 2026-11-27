import { armarBorrador, type NotaLeida } from "@/lib/compras/foto-ia";
import { problemaDeCuadre } from "@/lib/compras/cuadre";

function nota(extra: Partial<NotaLeida>): NotaLeida {
  return {
    proveedor: "ABARROTES EL SOL",
    rfc: null,
    fecha: "2026-11-23",
    folio: "A-1",
    subtotalEscrito: null,
    ivaEscrito: null,
    iepsEscrito: null,
    totalEscrito: null,
    lineas: [],
    avisos: [],
    ...extra,
  };
}

function linea(descripcion: string, cantidad: string, importe: string) {
  return { descripcion, cantidad, unidad: "PZA", precioUnitario: null, importe, ilegible: null };
}

function muestra(titulo: string, leida: NotaLeida) {
  const b = armarBorrador(leida);
  console.log(`\n== ${titulo}`);
  console.log(`  desglosa IVA: ${b.desglosaIva} · subtotal ${b.subtotal} · total ${b.total}`);
  for (const l of b.lineas) {
    console.log(`  "${l.descripcion}" importe ${l.importe} · IVA ${l.ivaRate} · IEPS ${l.iepsRate}`);
  }
  for (const a of b.avisos) console.log(`  aviso: ${a}`);
}

// La nota trae el pie completo: la tasa sale de ahi, nadie la escoge.
muestra(
  "nota con subtotal, IVA y total",
  nota({
    subtotalEscrito: "1000.00",
    ivaEscrito: "160.00",
    totalEscrito: "1160.00",
    lineas: [linea("CEBOLLA", "10", "400.00"), linea("JITOMATE", "20", "600.00")],
  }),
);

// Con IEPS el IVA se calcula sobre subtotal + IEPS, como en la ley.
muestra(
  "nota con IEPS",
  nota({
    subtotalEscrito: "1000.00",
    iepsEscrito: "265.00",
    ivaEscrito: "202.40",
    totalEscrito: "1467.40",
    lineas: [linea("CERVEZA", "24", "1000.00")],
  }),
);

// Nota de mercado: no hay nada que leer, no se adivina y la pantalla pregunta.
muestra(
  "nota sin desglose",
  nota({ totalEscrito: "348.00", lineas: [linea("CILANTRO", "4", "348.00")] }),
);

// Sin total no hay contra que cuadrar: tiene que decirlo.
muestra("nota sin total legible", nota({ lineas: [linea("LIMON", "3", "90.00")] }));

console.log("\n== el cuadre contra el papel");
const casos: [string, { subtotal: string; rates: { ivaRate: number; iepsRate: number } }[], string][] = [
  ["cuadra exacto", [{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], "1160.00"],
  ["un centavo de redondeo", [{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], "1160.03"],
  ["falta un renglon", [{ subtotal: "600", rates: { ivaRate: 16, iepsRate: 0 } }], "1160.00"],
  ["IVA de mas", [{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], "1000.00"],
  ["sin documento: no se exige", [{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], ""],
  ["total en cero", [{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], "0"],
];
for (const [titulo, renglones, total] of casos) {
  console.log(`  ${titulo}: ${problemaDeCuadre(renglones, total) ?? "OK"}`);
}

console.log("\n== cuadre con retenciones (factura de fletes)");
// Subtotal 1000, IVA 160, IVA retenido 40 -> el papel dice 1120.
console.log(
  "  con retencion:",
  problemaDeCuadre([{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], "1120.00", "40.00") ?? "OK",
);
console.log(
  "  sin tomarla en cuenta:",
  problemaDeCuadre([{ subtotal: "1000", rates: { ivaRate: 16, iepsRate: 0 } }], "1120.00") ?? "OK",
);
