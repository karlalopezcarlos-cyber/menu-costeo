import { asociacionDeRenglon, convertirCaptura } from "@/lib/compras/captura";
import { leerAsociaciones } from "@/lib/compras/extras-de-compra";
import type { OpcionProducto } from "@/lib/compras/importar-tipos";

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
    { id: "galon", label: "Galon", quantity: "3785", unit: "ML" },
  ],
};

function caso(
  titulo: string,
  renglon: {
    descripcion: string;
    unidadDocumento: string;
    cantidadDocumento: string;
    cantidad: string;
    productId: string;
    unidad: Parameters<typeof convertirCaptura>[1];
  },
) {
  const convertido = convertirCaptura(renglon.cantidad, renglon.unidad, tequila);
  console.log(`\n== ${titulo}`);
  if (!convertido) {
    console.log("  no se pudo convertir");
    return;
  }
  console.log(
    `  guarda: ${convertido.presentationQty} ${convertido.presentationUnit} · etiqueta "${convertido.presentationLabel}"`,
  );
  const asociacion = asociacionDeRenglon(renglon, convertido);
  console.log(
    asociacion
      ? `  recuerda: 1 ${asociacion.unidadDocumento} = ${asociacion.factor} ${asociacion.presentationUnit}${asociacion.presentationLabel ? ` (bulto "${asociacion.presentationLabel}")` : ""}`
      : "  no se recuerda nada",
  );
}

const base = { descripcion: "CUERVO ESP 700", productId: "p-tequila" };

caso("3 botellas, el papel decia 3 piezas", {
  ...base,
  unidadDocumento: "H87",
  cantidadDocumento: "3",
  cantidad: "3",
  unidad: "PRES:legacy",
});

caso("1 botella (singular, sin plural de mas)", {
  ...base,
  unidadDocumento: "H87",
  cantidadDocumento: "1",
  cantidad: "1",
  unidad: "PRES:legacy",
});

caso("2 galones (plural en -es)", {
  ...base,
  unidadDocumento: "H87",
  cantidadDocumento: "2",
  cantidad: "2",
  unidad: "PRES:galon",
});

caso("el papel decia 3 y se capturaron 2 botellas: manda el factor", {
  ...base,
  unidadDocumento: "H87",
  cantidadDocumento: "3",
  cantidad: "2",
  unidad: "PRES:legacy",
});

caso("unidad de medida directa", {
  ...base,
  unidadDocumento: "LTR",
  cantidadDocumento: "2",
  cantidad: "2000",
  unidad: "ML",
});

caso("sin cantidad en el papel: no se recuerda", {
  ...base,
  unidadDocumento: "",
  cantidadDocumento: "",
  cantidad: "5",
  unidad: "PRES:legacy",
});

caso("bulto que ya no existe en el producto", {
  ...base,
  unidadDocumento: "H87",
  cantidadDocumento: "1",
  cantidad: "1",
  unidad: "PRES:borrado",
});

console.log("\n== lo que el servidor acepta del payload");
const payload = JSON.stringify([
  // buena
  { descripcion: "CUERVO ESP 700", unidadDocumento: "H87", productId: "p-tequila", factor: "700", presentationUnit: "ML", presentationLabel: "Botella" },
  // producto que no venia en los renglones
  { descripcion: "OTRA COSA", unidadDocumento: "H87", productId: "p-fantasma", factor: "1", presentationUnit: "ML", presentationLabel: null },
  // factor invalido
  { descripcion: "CUERVO ESP 700", unidadDocumento: "KGM", productId: "p-tequila", factor: "0", presentationUnit: "ML", presentationLabel: null },
  // unidad invalida
  { descripcion: "CUERVO ESP 700", unidadDocumento: "XXX", productId: "p-tequila", factor: "2", presentationUnit: "CAJAS", presentationLabel: null },
  // repetida: debe quedar una sola, la ultima
  { descripcion: "cuervo  esp. 700", unidadDocumento: "h87", productId: "p-tequila", factor: "750", presentationUnit: "ML", presentationLabel: null },
]);
console.log(leerAsociaciones(payload, new Set(["p-tequila"])));
console.log("basura:", leerAsociaciones("{no es json", new Set(["p-tequila"])));
