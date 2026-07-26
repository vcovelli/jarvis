import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured for server transcription." },
      { status: 501 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large." }, { status: 413 });
  }

  const upstreamBody = new FormData();
  upstreamBody.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe");
  upstreamBody.append("file", audio, audio instanceof File ? audio.name : "jarvis-voice.webm");
  upstreamBody.append("response_format", "json");

  const upstream = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: upstreamBody,
  });
  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? `OpenAI transcription failed with ${upstream.status}` },
      { status: upstream.status },
    );
  }

  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "No transcript was returned." }, { status: 502 });
  }

  return NextResponse.json({ text });
}
