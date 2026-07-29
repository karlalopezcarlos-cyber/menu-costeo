-- CreateEnum
CREATE TYPE "RecipeActivityType" AS ENUM ('CREATED', 'ITEM_ADDED', 'ITEM_REMOVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "recipe_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "type" "RecipeActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_activities_recipeId_createdAt_idx" ON "recipe_activities"("recipeId", "createdAt");

-- AddForeignKey
ALTER TABLE "recipe_activities" ADD CONSTRAINT "recipe_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_activities" ADD CONSTRAINT "recipe_activities_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_activities" ADD CONSTRAINT "recipe_activities_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

