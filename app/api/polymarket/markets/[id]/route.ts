import { NextRequest, NextResponse } from "next/server";

const GAMMA_HOST = "https://gamma-api.polymarket.com";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const res = await fetch(`${GAMMA_HOST}/markets/${id}`);
    if (!res.ok) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch market" }, { status: 500 });
  }
}
