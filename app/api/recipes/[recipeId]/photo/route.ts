import { NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const user = await requireSucursalContext();
  const { recipeId } = await params;

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, sucursalId: user.sucursalId },
    select: { photo: true, photoMimeType: true },
  });
  if (!recipe?.photo || !recipe.photoMimeType) {
    return new NextResponse("No encontrada", { status: 404 });
  }

  return new NextResponse(new Uint8Array(recipe.photo), {
    headers: {
      "Content-Type": recipe.photoMimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
