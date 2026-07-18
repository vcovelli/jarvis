import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStateETag } from "@/lib/stateHash";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await prisma.userState.findUnique({
    where: { userId },
  });

  const state = record?.state ?? null;
  const etag = createStateETag(state);
  const headers = {
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json({ state }, { headers });
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

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        ETag: createStateETag(state),
      },
    },
  );
}
