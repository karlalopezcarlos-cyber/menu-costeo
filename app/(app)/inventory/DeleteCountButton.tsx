"use client";

import { useRouter } from "next/navigation";
import { deleteInventoryCount } from "./actions";

export default function DeleteCountButton({
  countId,
  redirectAfter,
}: {
  countId: string;
  /** Si se pasa (ej. desde la pagina de detalle del propio conteo), navega ahi despues de borrar. */
  redirectAfter?: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (
      !confirm(
        "¿Eliminar este conteo de inventario? Se borra junto con su bitacora y comentarios de auditoria. Esta accion no se puede deshacer.",
      )
    ) {
      return;
    }
    await deleteInventoryCount(countId);
    if (redirectAfter) router.push(redirectAfter);
  }

  return (
    <button type="button" onClick={handleDelete} className="text-neutral-400 hover:text-red-600">
      Eliminar
    </button>
  );
}
