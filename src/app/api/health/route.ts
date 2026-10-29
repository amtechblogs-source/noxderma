import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HEALTH_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "x-noxderma-health": "ok",
};

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { status: 200, headers: HEALTH_HEADERS }
  );
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: HEALTH_HEADERS,
  });
}

