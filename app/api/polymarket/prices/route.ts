import { NextRequest, NextResponse } from "next/server";

const CLOB_HOST = "https://clob.polymarket.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json({ error: "tokenId required" }, { status: 400 });
  }

  const startTs = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago

  try {
    const res = await fetch(
      `${CLOB_HOST}/prices-history?market=${tokenId}&startTs=${startTs}&fidelity=720`
    );
    if (!res.ok) {
      return NextResponse.json({ history: [] });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ history: [] });
  }
}
