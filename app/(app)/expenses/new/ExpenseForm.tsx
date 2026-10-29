"use client";

import { useActionState } from "react";
import Link from "next/link";
import { blockEnterSubmit } from "@/lib/ui/block-enter-submit";
import { createExpense, type ExpenseState } from "../actions";

const initialState: ExpenseState = {};

export default function ExpenseForm({
  categories,
  suppliers,
  conceptos,
}: {
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  /** Productos de categorias marcadas como gasto: lo unico que se puede pagar aqui. */
  conceptos: { id: string; name: string; categoryName: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(createExpense, initialState);

  return (
    <form
      action={formAction}
      onKeyDown={blockEnterSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      {conceptos.length === 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No hay conceptos de gasto en tu catalogo. Se dan de alta como productos (LUZ, RENTA,
          NOMINA) en una categoria marcada como <b>gasto</b>:{" "}
          <Link href="/products/new" className="font-medium underline">
            crea el producto
          </Link>{" "}
          y marca su categoria en{" "}
          <Link href="/settings/categories" className="font-medium underline">
            Configuracion &gt; Categorias
          </Link>
          .
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1">
          <label htmlFor="date" className="text-sm font-medium text-neutral-700">
            Fecha
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="productId" className="text-sm font-medium text-neutral-700">
            Concepto
          </label>
          <select
            id="productId"
            name="productId"
            required
            defaultValue=""
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Elige que se pago</option>
            {conceptos.map((concepto) => (
              <option key={concepto.id} value={concepto.id}>
                {concepto.name}
                {concepto.categoryName ? ` · ${concepto.categoryName}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="categoryId" className="text-sm font-medium text-neutral-700">
            Tipo de gasto
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue=""
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Sin tipo</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="amount" className="text-sm font-medium text-neutral-700">
            Monto
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="invoiceFolio" className="text-sm font-medium text-neutral-700">
            Folio de factura (opcional)
          </label>
          <input
            id="invoiceFolio"
            name="invoiceFolio"
            placeholder="A-1234"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="supplierId" className="text-sm font-medium text-neutral-700">
          Proveedor (opcional)
        </label>
        <select
          id="supplierId"
          name="supplierId"
          defaultValue=""
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Sin proveedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Un gasto no genera cuenta por pagar: se registra lo que se pago, no lo que se debe. El
          proveedor es solo para saber a quien se le pago.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
          Comentario (opcional)
        </label>
        <input
          id="comment"
          name="comment"
          placeholder="Ej. incluye recargo por pago tardio"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>

      <p className="text-xs text-neutral-500">
        El concepto sale del catalogo, no se escribe: asi &quot;LUZ&quot;, &quot;Luz&quot; y
        &quot;CFE&quot; no terminan siendo tres cosas distintas. ¿Falta uno?{" "}
        <Link href="/products/new" className="text-brand-600 underline-offset-2 hover:underline">
          Dalo de alta
        </Link>{" "}
        en una categoria marcada como gasto.
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar gasto"}
        </button>
        <Link href="/expenses" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
