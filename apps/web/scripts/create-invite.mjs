import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "./load-env.mjs";

loadLocalEnv();

const prisma = new PrismaClient();
const emailArg = process.argv.find((value) => value.startsWith("--email="));
const daysArg = process.argv.find((value) => value.startsWith("--days="));
const email = emailArg?.slice("--email=".length).trim().toLowerCase() || null;
const days = Number(daysArg?.slice("--days=".length) ?? 7);
if (!Number.isFinite(days) || days <= 0 || days > 90) throw new Error("--days must be between 1 and 90");
const code = randomBytes(24).toString("base64url");
const codeHash = createHash("sha256").update(code).digest("hex");
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60_000);
try {
  await prisma.registrationInvite.create({ data: { codeHash, email, expiresAt } });
  console.log(`Invite code (shown once): ${code}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  if (email) console.log(`Restricted to: ${email}`);
} finally {
  await prisma.$disconnect();
}
