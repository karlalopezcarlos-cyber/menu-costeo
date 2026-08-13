import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Panel, Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      organizationId: string | null;
      allowedPanels: Panel[];
      /// Sucursales a las que este STAFF tiene acceso (puede cambiar entre ellas). Ignorado para
      /// OWNER/SUPERADMIN, que siempre ven todas las de su organizacion sin importar esta lista.
      sucursalIds: string[];
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    role: Role;
    organizationId: string | null;
    allowedPanels: Panel[];
    sucursalIds: string[];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contrasena", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { sucursales: { select: { sucursalId: true } } },
        });
        if (!user || !user.isActive) return null;

        if (user.organizationId) {
          const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
          if (!org || !org.isActive) return null;
        }

        const passwordMatches = await bcrypt.compare(password, user.hashedPassword);
        if (!passwordMatches) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          allowedPanels: user.allowedPanels,
          sucursalIds: user.sucursales.map((s) => s.sucursalId),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string;
        token.role = (user as { role: Role }).role;
        token.organizationId = (user as { organizationId: string | null }).organizationId;
        token.allowedPanels = (user as { allowedPanels: Panel[] }).allowedPanels;
        token.sucursalIds = (user as { sucursalIds: string[] }).sucursalIds;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.organizationId = token.organizationId;
      session.user.allowedPanels = token.allowedPanels ?? [];
      session.user.sucursalIds = token.sucursalIds ?? [];
      return session;
    },
  },
});
