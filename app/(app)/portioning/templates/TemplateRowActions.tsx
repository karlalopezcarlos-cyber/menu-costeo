"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTransformationTemplate } from "./actions";

export default function TemplateRowActions({
  templateId,
  name,
}: {
  templateId: string;
  name: string;
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
            `¿Borrar la plantilla "${name}"? Las transformaciones ya registradas no se tocan; solo deja de prellenarse.`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          await deleteTransformationTemplate(templateId);
          router.refresh();
        });
      }}
      className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "Borrando..." : "Borrar"}
    </button>
  );
}
