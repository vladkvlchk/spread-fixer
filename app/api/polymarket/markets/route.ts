import { NextRequest, NextResponse } from "next/server";

const GAMMA_HOST = "https://gamma-api.polymarket.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const offset = searchParams.get("offset") || "0";
  const limit = searchParams.get("limit") || "50";
  const q = searchParams.get("q");

  try {
    if (q) {
      // Search
      const url = new URL(`${GAMMA_HOST}/public-search`);
      url.searchParams.set("q", q);
      url.searchParams.set("type", "events");
      url.searchParams.set("limit_per_type", "50");

      const res = await fetch(url.toString());
      if (!res.ok) {
        return NextResponse.json({ events: [] });
      }
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      // List
      const url = new URL(`${GAMMA_HOST}/events/pagination`);
      url.searchParams.set("active", "true");
      url.searchParams.set("archived", "false");
      url.searchParams.set("closed", "false");
      url.searchParams.set("order", "volume24hr");
      url.searchParams.set("ascending", "false");
      url.searchParams.set("limit", limit);
      url.searchParams.set("offset", offset);

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error("Failed to fetch");
      }
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
