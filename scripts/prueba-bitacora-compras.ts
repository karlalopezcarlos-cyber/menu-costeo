import { describirCambios, momento, reconstruirRegistro } from "@/lib/purchases/bitacora";

const gera = { name: "GERARDO", email: "gera@ejemplo.com" };
const david = { name: null, email: "davidmartinez@ejemplo.com" };

function fecha(iso: string) {
  return new Date(iso);
}

console.log("== una sola captura de varios renglones");
console.log(
  reconstruirRegistro([
    { id: "a", createdAt: fecha("2026-11-23T19:00:10Z"), createdBy: gera },
    { id: "b", createdAt: fecha("2026-11-23T19:00:41Z"), createdBy: gera },
    { id: "c", createdAt: fecha("2026-11-23T19:00:59Z"), createdBy: gera },
  ]).map((e) => `  ${e.quien}: ${e.mensaje} (${momento(e.cuando)})`),
);

console.log("\n== renglones agregados en ratos distintos y por dos personas");
console.log(
  reconstruirRegistro([
    { id: "a", createdAt: fecha("2026-11-23T19:00:10Z"), createdBy: gera },
    { id: "b", createdAt: fecha("2026-11-23T19:04:41Z"), createdBy: gera },
    { id: "c", createdAt: fecha("2026-11-24T15:20:00Z"), createdBy: david },
  ]).map((e) => `  ${e.quien}: ${e.mensaje} (${momento(e.cuando)})`),
);

console.log("\n== usuario borrado del sistema");
console.log(
  reconstruirRegistro([{ id: "a", createdAt: fecha("2026-11-23T19:00:10Z"), createdBy: null }]).map(
    (e) => `  ${e.quien}: ${e.mensaje}`,
  ),
);

console.log("\n== la hora sale en hora de Mexico, no en UTC");
console.log(`  guardado 2026-11-27T03:47:57Z -> ${momento(fecha("2026-11-27T03:47:57Z"))}`);

console.log("\n== que cambio y de que a que");
console.log(
  " ",
  describirCambios([
    { campo: "Precio", antes: "$1,667.53", despues: "$900.00" },
    { campo: "Cantidad", antes: "0.7 LT", despues: "8.4 LT" },
    { campo: "Proveedor", antes: "MERCANTIL ZAPOTLAN", despues: "MERCANTIL ZAPOTLAN" },
  ]),
);
console.log("  sin cambios ->", describirCambios([{ campo: "IVA", antes: "16%", despues: "16%" }]));
