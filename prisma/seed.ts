import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const superadminPassword = await bcrypt.hash("Admin1234!", 10);
  await prisma.user.upsert({
    where: { email: "admin@menu-costeo.local" },
    update: {},
    create: {
      email: "admin@menu-costeo.local",
      hashedPassword: superadminPassword,
      name: "Super Admin",
      role: "SUPERADMIN",
    },
  });

  const org = await prisma.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: {
      id: "demo-org",
      name: "Restaurante Demo",
    },
  });

  const ownerPassword = await bcrypt.hash("Demo1234!", 10);
  await prisma.user.upsert({
    where: { email: "demo@menu-costeo.local" },
    update: {},
    create: {
      email: "demo@menu-costeo.local",
      hashedPassword: ownerPassword,
      name: "Dueno Demo",
      role: "OWNER",
      organizationId: org.id,
    },
  });

  console.log("Seed listo:");
  console.log("  SUPERADMIN -> admin@menu-costeo.local / Admin1234!");
  console.log("  OWNER (Restaurante Demo) -> demo@menu-costeo.local / Demo1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
