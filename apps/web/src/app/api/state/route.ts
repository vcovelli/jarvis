import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await prisma.userState.findUnique({
    where: { userId },
  });

  return NextResponse.json({ state: record?.state ?? null });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const state = body?.state;
  if (!state || typeof state !== "object") {
    return NextResponse.json({ error: "Invalid state payload." }, { status: 400 });
  }

  await prisma.userState.upsert({
    where: { userId },
    create: { userId, state },
    update: { state },
  });

  return NextResponse.json({ ok: true });
}
