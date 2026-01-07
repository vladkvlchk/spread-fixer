import { NextRequest, NextResponse } from "next/server";

const CLOB_HOST = "https://clob.polymarket.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get("tokenId");

  if (!tokenId) {
    return NextResponse.json({ error: "tokenId required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch orderbook" }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch orderbook" }, { status: 500 });
  }
}
