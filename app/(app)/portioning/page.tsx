import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { monthStartDateInputValue, todayDateInputValue } from "@/lib/date-inputs";
import {
  buildTransformationWhere,
  hasAnyTransformationFilter,
  toTransformationRow,
  TRANSFORMATION_INCLUDE,
  type TransformationRow,
} from "@/lib/portioning/query";
import TransformationsTable from "./TransformationsTable";

// Tope de seguridad para no traer anios de historial de un jalon.
const ROW_LIMIT = 500;

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PortioningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSucursalContext();
  const raw = await searchParams;

  const filters = {
    search: readParam(raw.q),
    folio: readParam(raw.folio),
    dateFrom: readParam(raw.from),
    dateTo: readParam(raw.to),
  };
  const touched = readParam(raw.touched) === "1";

  // Por omision, el mes en curso: la pregunta de esta pantalla es que se transformo este mes y
  // como salio el rendimiento, no todo el historial.
  const isDefaultMonth = !touched && !hasAnyTransformationFilter(filters);
  const monthStart = monthStartDateInputValue();
  const today = todayDateInputValue();
  const effectiveFilters = isDefaultMonth
    ? { ...filters, dateFrom: monthStart, dateTo: today }
    : filters;

  const entries = await prisma.portioningEntry.findMany({
    where: buildTransformationWhere(user.sucursalId, effectiveFilters),
    orderBy: [{ date: "desc" }, { folio: "desc" }],
    take: ROW_LIMIT,
    include: TRANSFORMATION_INCLUDE,
  });

  const rows: TransformationRow[] = entries.map(toTransformationRow);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Operacion</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Transformaciones</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Limpiezas y porcionamientos: que entro, que salio y cuanto costo cada pieza. Cada una
            vale por si sola y no mueve el rendimiento del producto que entro.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portioning/templates" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Plantillas
          </Link>
          <Link href="/portioning/portions" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Productos de proceso
          </Link>
          <Link
            href="/portioning/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Nueva transformacion
          </Link>
        </div>
      </div>

      <TransformationsTable
        rows={rows}
        filters={filters}
        isDefaultMonth={isDefaultMonth}
        defaultFrom={monthStart}
        defaultTo={today}
        truncated={rows.length === ROW_LIMIT}
      />
    </div>
  );
}
