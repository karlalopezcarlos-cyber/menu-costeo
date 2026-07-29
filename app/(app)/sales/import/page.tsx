import Link from "next/link";
import { createImportBatch } from "./actions";

export default function ImportSalesPage() {
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Importar ventas desde Excel</h1>
      <p className="text-sm text-neutral-500">
        Sube el reporte de ventas (por ejemplo, exportado de Soft Restaurant) con columnas de
        fecha, platillo, cantidad vendida y precio.{" "}
        <a href="/api/export/sales-template" className="underline">
          Descarga la plantilla
        </a>{" "}
        si prefieres capturar desde cero.
      </p>

      <form
        action={createImportBatch}
        className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <div className="space-y-1">
          <label htmlFor="file" className="text-sm font-medium text-neutral-700">
            Archivo .xlsx
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx"
            required
            className="w-full text-sm"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Subir y continuar
          </button>
          <Link href="/sales" className="text-sm text-neutral-500 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
