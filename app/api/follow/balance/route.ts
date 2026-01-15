import { NextRequest, NextResponse } from "next/server";

const DATA_API = "https://data-api.polymarket.com";

type Position = {
  size: number;
  currentValue: number;
  initialValue: number;
  cashPnl: number;
  percentPnl: number;
  outcome: string;
  title: string;
};


export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user");

  if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const posRes = await fetch(`${DATA_API}/positions?user=${user}&sizeThreshold=0`);

    if (!posRes.ok) {
      return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
    }

    const positions: Position[] = await posRes.json();

    // Calculate totals
    const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
    const totalInitial = positions.reduce((sum, p) => sum + (p.initialValue || 0), 0);
    const totalPnl = positions.reduce((sum, p) => sum + (p.cashPnl || 0), 0);
    const totalPnlPercent = totalInitial > 0 ? (totalPnl / totalInitial) * 100 : 0;

    // Sort by value descending
    const sortedPositions = positions
      .filter(p => p.currentValue > 0.01)
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 20);

    return NextResponse.json({
      positions: sortedPositions,
      totalValue,
      totalPnl,
      totalPnlPercent,
      positionCount: positions.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
