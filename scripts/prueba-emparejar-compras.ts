import { resolverBorrador } from "@/lib/compras/emparejar";
import type { AsociacionGuardada, BorradorCompra, OpcionProducto } from "@/lib/compras/importar-tipos";

const tequila: OpcionProducto = {
  id: "p-tequila",
  name: "TEQUILA BLANCO",
  baseUnit: "ML",
  presentationUnitLabel: "Botella",
  presentationUnitQty: "700",
  ivaRate: "16",
  iepsRate: "0",
  bultos: [
    { id: "legacy", label: "Botella", quantity: "700", unit: "ML" },
    { id: "caja", label: "Caja", quantity: "8400", unit: "ML" },
  ],
};
const cebolla: OpcionProducto = {
  id: "p-ceb",
  name: "CEBOLLA BLANCA",
  baseUnit: "KG",
  presentationUnitLabel: null,
  presentationUnitQty: null,
  ivaRate: "0",
  iepsRate: "0",
  bultos: [],
};
const productos = [tequila, cebolla];
const proveedores = [{ id: "s1", name: "VINOS Y LICORES SA", rfc: "VLI010101AAA" }];

function borrador(lineas: { descripcion: string; cantidad: string; unidadDocumento: string }[]): BorradorCompra {
  return {
    origen: "xml",
    fecha: "2026-11-26",
    folio: "A-1",
    proveedor: { nombre: "VINOS Y LICORES SA", rfc: "VLI010101AAA" },
    subtotal: null,
    total: null,
    desglosaIva: true,
    retenciones: null,
    lineas: lineas.map((l, i) => ({
      id: `l-${i}`,
      ...l,
      precioUnitario: null,
      importe: "1000",
      ivaRate: "16",
      iepsRate: "0",
      claveProdServ: null,
    })),
    avisos: [],
  };
}

function muestra(titulo: string, compra: ReturnType<typeof resolverBorrador>) {
  console.log(`\n== ${titulo}`);
  for (const l of compra.lineas) {
    console.log(
      `  "${l.descripcion}" (${l.cantidad} ${l.unidadDocumento}) -> ${l.productoNombre ?? "?"} | ${l.cantidadCaptura} ${l.unidadCaptura || "(sin unidad)"} | ${l.coincidencia}${l.problema ? ` | PROBLEMA: ${l.problema}` : ""}`,
    );
  }
}

// 1) El papel cuenta piezas y el producto tiene botella configurada -> se captura por botella.
muestra(
  "piezas de un producto con botella",
  resolverBorrador(borrador([{ descripcion: "TEQUILA BLANCO", cantidad: "3", unidadDocumento: "H87" }]), productos, proveedores),
);

// 2) El papel nombra la caja -> gana la caja, no la botella.
muestra(
  "el papel dice CAJA",
  resolverBorrador(borrador([{ descripcion: "TEQUILA BLANCO", cantidad: "2", unidadDocumento: "CAJA" }]), productos, proveedores),
);

// 3) Unidad compatible -> se usa tal cual, sin bulto.
muestra(
  "unidad compatible",
  resolverBorrador(borrador([{ descripcion: "CEBOLLA BLANCA", cantidad: "25", unidadDocumento: "KGM" }]), productos, proveedores),
);

// 4) Unidad que no mide lo mismo y producto sin bulto -> problema, no adivina.
muestra(
  "pieza de un producto en KG sin presentacion",
  resolverBorrador(borrador([{ descripcion: "CEBOLLA BLANCA", cantidad: "4", unidadDocumento: "PZA" }]), productos, proveedores),
);

// 5) Asociacion guardada por bulto -> se vuelve a ofrecer por bulto, aunque el nombre no se parezca.
const asociaciones: AsociacionGuardada[] = [
  {
    id: "a1",
    supplierId: "s1",
    claveDescripcion: "CUERVO ESP 700",
    unidadDocumento: "H87",
    productId: "p-tequila",
    factor: "700",
    presentationUnit: "ML",
    presentationLabel: "Botella",
  },
  {
    id: "a2",
    supplierId: null,
    claveDescripcion: "CEB BCA COSTAL",
    unidadDocumento: "H87",
    productId: "p-ceb",
    factor: "25",
    presentationUnit: "KG",
    presentationLabel: null,
  },
];
muestra(
  "asociaciones guardadas",
  resolverBorrador(
    borrador([
      { descripcion: "CUERVO ESP 700", cantidad: "6", unidadDocumento: "H87" },
      { descripcion: "CEB BCA COSTAL", cantidad: "2", unidadDocumento: "H87" },
    ]),
    productos,
    proveedores,
    asociaciones,
  ),
);
