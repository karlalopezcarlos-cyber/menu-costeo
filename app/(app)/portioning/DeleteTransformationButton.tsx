"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTransformation } from "./actions";

export default function DeleteTransformationButton({
  entryId,
  folioLabel,
  resumen,
}: {
  entryId: string;
  folioLabel: string;
  resumen: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Vas a borrar la transformacion ${folioLabel}: ${resumen}.\n\n` +
              "Lo que entro regresa al inventario y lo que salio se va. Los productos que salieron " +
              "vuelven al costo que tenian en su transformacion anterior.\n\nEsto no se puede deshacer. ¿La borro?",
          )
        ) {
          return;
        }
        startTransition(async () => {
          await deleteTransformation(entryId);
          router.refresh();
        });
      }}
      className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "Borrando..." : "Borrar"}
    </button>
  );
}
