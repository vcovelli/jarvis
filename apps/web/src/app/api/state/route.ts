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
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    ETag: etag,
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json({ state, updatedAt: record?.updatedAt?.getTime() ?? null }, { headers });
}

async function saveUserState(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const state = body?.state;
  if (!state || typeof state !== "object") {
    return NextResponse.json({ error: "Invalid state payload." }, { status: 400 });
  }

  const baseEtag =
    request.headers.get("if-match") ??
    (typeof body?.baseEtag === "string" ? body.baseEtag : null);

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.userState.findUnique({
      where: { userId },
    });
    const currentEtag = createStateETag(current?.state ?? null);

    if (current && baseEtag !== currentEtag) {
      return {
        conflict: true as const,
        state: current.state,
        etag: currentEtag,
        updatedAt: current.updatedAt.getTime(),
      };
    }

    const record = await tx.userState.upsert({
      where: { userId },
      create: { userId, state },
      update: { state },
    });

    return {
      conflict: false as const,
      etag: createStateETag(state),
      updatedAt: record.updatedAt.getTime(),
    };
  });

  if (result.conflict) {
    return NextResponse.json(
      {
        error: "State changed on another device.",
        state: result.state,
        updatedAt: result.updatedAt,
      },
      {
        status: 409,
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
          ETag: result.etag,
        },
      },
    );
  }

  return NextResponse.json(
    { ok: true, updatedAt: result.updatedAt },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        ETag: result.etag,
      },
    },
  );
}

export async function PUT(request: Request) {
  return saveUserState(request);
}

export async function POST(request: Request) {
  return saveUserState(request);
}
