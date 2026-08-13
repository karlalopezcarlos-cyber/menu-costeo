import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { panelForPath, hasPanelAccess } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (!token) return NextResponse.next();

  const panel = panelForPath(req.nextUrl.pathname);
  if (!panel) return NextResponse.next();

  const role = String(token.role ?? "");
  const allowedPanels = (token.allowedPanels as Panel[] | undefined) ?? [];
  if (hasPanelAccess(role, allowedPanels, panel)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/dashboard", req.url));
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/products/:path*",
    "/purchases/:path*",
    "/requisitions/:path*",
    "/waste/:path*",
    "/recipes/:path*",
    "/production/:path*",
    "/inventory/:path*",
    "/audit/:path*",
    "/orders/:path*",
    "/planning/:path*",
    "/store-orders/:path*",
    "/sales/:path*",
    "/menu-engineering/:path*",
    "/payments/:path*",
    "/settings/:path*",
  ],
};
