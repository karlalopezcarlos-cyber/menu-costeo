import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { COSTEADOR_INCLUDE, costearPropuesta, nombreDe } from "@/lib/costeador";
import { deleteCosteador } from "../actions";
import AgregarIngrediente from "./AgregarIngrediente";
import TablaIngredientes from "./TablaIngredientes";
import EditarPropuesta from "./EditarPropuesta";
import TransferirButton from "./TransferirButton";

export default async function CosteadorDetailPage({
  params,
}: {
  params: Promise<{ costeadorId: string }>;
}) {
  const { costeadorId } = await params;
  const user = await requireSucursalContext();

  const propuesta = await prisma.costeador.findFirst({
    where: { id: costeadorId, sucursalId: user.sucursalId },
    include: COSTEADOR_INCLUDE,
  });
  if (!propuesta) notFound();

  const [costeo, productos, subrecetas, categorias] = await Promise.all([
    costearPropuesta(user.sucursalId, {
      yieldQty: new Decimal(propuesta.yieldQty),
      sellingPrice: propuesta.sellingPrice === null ? null : new Decimal(propuesta.sellingPrice),
      items: propuesta.items,
    }),
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null, isMenuItem: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldUnit: true },
    }),
    prisma.recipeCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const yaEsReceta = propuesta.recipe !== null;
  const rendimiento = `${Number(propuesta.yieldQty).toLocaleString("es-MX", {
    maximumFractionDigits: 4,
  })} ${UNIT_LABELS[propuesta.yieldUnit as UnitValue]}`;

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-200 pb-5">
        <Link href="/costeador" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Costeador
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
          {propuesta.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Rinde {rendimiento} · {propuesta.category?.name ?? "Sin categoria"} · propuesta por{" "}
          {nombreDe(propuesta.createdBy)}
        </p>
      </div>

      {yaEsReceta && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Esta propuesta ya se autorizo.</p>
          <p className="mt-1">
            Se creo la receta{" "}
            <Link href={`/recipes/${propuesta.recipe!.id}`} className="underline">
              {propuesta.recipe!.name}
            </Link>{" "}
            el{" "}
            {propuesta.transferredAt?.toLocaleDateString("es-MX", {
              timeZone: "America/Mexico_City",
            })}
            . Lo que edites aqui ya no la afecta: a partir de la transferencia cada una va por su
            lado. Esta pantalla se queda como el costeo con el que se tomo la decision.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Mosaico
          label="Costo por unidad"
          valor={formatMoney(costeo.costoUnitario)}
          nota={`De cada ${UNIT_LABELS[propuesta.yieldUnit as UnitValue].toLowerCase()}`}
        />
        <Mosaico
          label="Precio de venta"
          valor={costeo.precio === null ? "—" : formatMoney(costeo.precio)}
          nota={costeo.precio === null ? "Ponle precio para ver el margen" : "Lo que cobras"}
        />
        <Mosaico
          label="Costo %"
          valor={costeo.costoPct === null ? "—" : `${costeo.costoPct.toFixed(1)}%`}
          nota={
            costeo.costoPct === null
              ? "Falta el precio"
              : costeo.costoPct > 35
                ? "Arriba de 35%: caro para menu"
                : "Dentro de rango"
          }
          tono={costeo.costoPct === null ? "neutro" : costeo.costoPct > 35 ? "malo" : "bueno"}
        />
        <Mosaico
          label="Deja por unidad"
          valor={costeo.utilidad === null ? "—" : formatMoney(costeo.utilidad)}
          nota={
            costeo.margenPct === null
              ? "Falta el precio"
              : `${costeo.margenPct.toFixed(1)}% de margen`
          }
          tono={costeo.utilidad === null ? "neutro" : costeo.utilidad > 0 ? "bueno" : "malo"}
        />
      </div>

      {costeo.sinCostear > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">
            {costeo.sinCostear}{" "}
            {costeo.sinCostear === 1 ? "ingrediente no tiene costo" : "ingredientes no tienen costo"}
            , asi que el total de abajo esta incompleto.
          </p>
          <p className="mt-1">
            Casi siempre es un producto que nunca se ha comprado en esta sucursal. Captura una
            compra o ponle costo en el catalogo y el numero se completa solo.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <TablaIngredientes renglones={costeo.renglones} costoTotal={costeo.costoTotal} />
          <AgregarIngrediente
            costeadorId={propuesta.id}
            productos={productos.map((p) => ({
              id: p.id,
              name: p.name,
              baseUnit: p.baseUnit as UnitValue,
            }))}
            subrecetas={subrecetas.map((r) => ({
              id: r.id,
              name: r.name,
              yieldUnit: r.yieldUnit as UnitValue,
            }))}
          />
        </div>

        <div className="space-y-4">
          {!yaEsReceta && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-neutral-700">¿Te la autorizaron?</p>
              <p className="mt-1 mb-3 text-xs text-neutral-500">
                Pasa la propuesta al catalogo de recetas de esta sucursal, con todo y sus
                ingredientes, su rendimiento y su precio.
              </p>
              <TransferirButton
                costeadorId={propuesta.id}
                nombre={propuesta.name}
                sinIngredientes={propuesta.items.length === 0}
              />
            </div>
          )}

          <EditarPropuesta
            costeadorId={propuesta.id}
            categorias={categorias}
            valores={{
              name: propuesta.name,
              yieldQty: propuesta.yieldQty.toString(),
              yieldUnit: propuesta.yieldUnit as UnitValue,
              categoryId: propuesta.categoryId,
              isMenuItem: propuesta.isMenuItem,
              sellingPrice: propuesta.sellingPrice?.toString() ?? "",
              notes: propuesta.notes ?? "",
            }}
          />

          <form
            action={async () => {
              "use server";
              await deleteCosteador(propuesta.id);
            }}
          >
            <button
              type="submit"
              className="text-xs text-neutral-400 transition-colors hover:text-red-600"
            >
              Borrar esta propuesta
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Mosaico({
  label,
  valor,
  nota,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  nota: string;
  tono?: "neutro" | "bueno" | "malo";
}) {
  const color =
    tono === "bueno" ? "text-emerald-700" : tono === "malo" ? "text-red-600" : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${color}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-500">{nota}</p>
    </div>
  );
}
