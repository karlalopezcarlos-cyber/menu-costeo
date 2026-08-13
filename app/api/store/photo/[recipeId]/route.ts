import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params;

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, isMenuItem: true, archivedAt: null, sucursal: { storeEnabled: true } },
    select: { photo: true, photoMimeType: true },
  });
  if (!recipe?.photo || !recipe.photoMimeType) {
    return new NextResponse("No encontrada", { status: 404 });
  }

  return new NextResponse(new Uint8Array(recipe.photo), {
    headers: {
      "Content-Type": recipe.photoMimeType,
      "Cache-Control": "public, max-age=300",
    },
  });
}
