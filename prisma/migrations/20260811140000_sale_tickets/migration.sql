-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "nextSaleFolio" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "sale_tickets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_ticket_items" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_ticket_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_tickets_organizationId_folio_idx" ON "sale_tickets"("organizationId", "folio");

-- CreateIndex
CREATE INDEX "sale_tickets_sucursalId_date_idx" ON "sale_tickets"("sucursalId", "date");

-- CreateIndex
CREATE INDEX "sale_ticket_items_ticketId_idx" ON "sale_ticket_items"("ticketId");

-- CreateIndex
CREATE INDEX "sale_ticket_items_recipeId_idx" ON "sale_ticket_items"("recipeId");

-- AddForeignKey
ALTER TABLE "sale_tickets" ADD CONSTRAINT "sale_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tickets" ADD CONSTRAINT "sale_tickets_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tickets" ADD CONSTRAINT "sale_tickets_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_ticket_items" ADD CONSTRAINT "sale_ticket_items_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "sale_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_ticket_items" ADD CONSTRAINT "sale_ticket_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
