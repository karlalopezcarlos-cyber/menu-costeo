"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EXPENSE_GROUP_LABELS, type ExpenseGroupKey } from "@/lib/expense-groups";

const OPCIONES: ExpenseGroupKey[] = ["ADMINISTRACION", "OPERACION", "PERSONAL", "FINANCIEROS"];

/**
 * El renglon del Estado de Resultados donde caen los gastos de este tipo. Guarda al cambiar,
 * sin boton: normalmente se acomodan varias filas seguidas y un guardar por fila seria una
 * vuelta de mas cada vez.
 */
export default function ExpenseGroupSelect({
  id,
  initialValue,
  action,
}: {
  id: string;
  initialValue: ExpenseGroupKey | null;
  action: (id: string, value: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={initialValue ?? ""}
      disabled={pending}
      onChange={(e) => {
        const valor = e.target.value;
        startTransition(async () => {
          await action(id, valor);
          router.refresh();
        });
      }}
      className={`rounded-md border px-2 py-1 text-sm disabled:text-neutral-400 ${
        initialValue ? "border-neutral-200" : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
    >
      <option value="">Sin asignar</option>
      {OPCIONES.map((key) => (
        <option key={key} value={key}>
          {EXPENSE_GROUP_LABELS[key]}
        </option>
      ))}
    </select>
  );
}
