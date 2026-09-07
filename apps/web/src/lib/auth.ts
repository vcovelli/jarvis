import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function verificationRequired() {
  return process.env.EMAIL_VERIFICATION_REQUIRED?.trim().toLowerCase() === "true";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  useSecureCookies: process.env.NODE_ENV === "production",
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) {
          await writeAuditLog({ action: "auth.login", outcome: "failure", request, metadata: { reason: "missing_credentials" } });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          await writeAuditLog({ action: "auth.login", outcome: "failure", request, metadata: { reason: "invalid_credentials" } });
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          await writeAuditLog({ action: "auth.login", outcome: "failure", userId: user.id, request, metadata: { reason: "invalid_credentials" } });
          return null;
        }
        if (verificationRequired() && !user.emailVerified) {
          await writeAuditLog({ action: "auth.login", outcome: "denied", userId: user.id, request, metadata: { reason: "email_unverified" } });
          return null;
        }

        await writeAuditLog({ action: "auth.login", userId: user.id, request });
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          sessionVersion: user.sessionVersion,
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
        token.emailVerified = user.emailVerified ?? null;
        token.invalidated = false;
        return token;
      }
      if (!token.id || token.invalidated) return token;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { sessionVersion: true, emailVerified: true },
      });
      if (!current || current.sessionVersion !== token.sessionVersion || (verificationRequired() && !current.emailVerified)) {
        token.invalidated = true;
        delete token.id;
        return token;
      }
      token.emailVerified = current.emailVerified;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && !token.invalidated) {
        session.user.id = token.id;
        session.user.emailVerified = token.emailVerified ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
