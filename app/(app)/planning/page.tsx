import Link from "next/link";

export default function PlanningLandingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Proyeccion de compras y produccion</h1>
        <p className="text-sm text-neutral-500">
          Dos formas de calcular que te hace falta comprar, a partir de tu inventario teorico a hoy.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/orders/new"
          className="block space-y-2 rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
        >
          <h2 className="text-lg font-semibold text-neutral-900">Por stock objetivo</h2>
          <p className="text-sm text-neutral-500">
            Compara tu stock objetivo (par level) de cada producto contra lo que tienes ahorita, y te
            sugiere que pedir para llegar a ese nivel.
          </p>
          <span className="inline-block text-sm font-medium text-neutral-700">Ir a Pedido sugerido &rarr;</span>
        </Link>

        <Link
          href="/planning/plu"
          className="block space-y-2 rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400"
        >
          <h2 className="text-lg font-semibold text-neutral-900">Por PLU (planeacion de ventas)</h2>
          <p className="text-sm text-neutral-500">
            Elige cuanto planeas vender de cada platillo y te explota la receta (incluyendo
            subrecetas) para decirte que producir y que comprar, descontando lo que ya tienes.
          </p>
          <span className="inline-block text-sm font-medium text-neutral-700">Ir a planeacion por PLU &rarr;</span>
        </Link>
      </div>
    </div>
  );
}
