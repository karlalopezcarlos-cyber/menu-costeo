import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user?.role === "SUPERADMIN") redirect("/admin/organizations");
  if (session?.user?.organizationId) redirect("/dashboard");
  redirect("/login");
}
