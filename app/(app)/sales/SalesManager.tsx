"use client";

import { useState } from "react";
import SaleForm from "./SaleForm";
import SalesTable, { type SaleRow } from "./SalesTable";

type RecipeOption = { id: string; name: string; sellingPrice: string | null };

export default function SalesManager({
  recipes,
  rows,
}: {
  recipes: RecipeOption[];
  rows: SaleRow[];
}) {
  const [editing, setEditing] = useState<SaleRow | null>(null);

  return (
    <div className="space-y-6">
      {recipes.length > 0 && (
        <SaleForm
          key={editing?.id ?? "new"}
          recipes={recipes}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
        />
      )}
      <SalesTable rows={rows} onEdit={setEditing} />
    </div>
  );
}
