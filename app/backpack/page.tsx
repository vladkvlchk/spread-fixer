import React from "react";
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

async function getMarkets() {
  const res = await fetch("https://api.backpack.exchange/api/v1/markets", {
    next: { revalidate: 10 }, // ISR caching
  });

  if (!res.ok) throw new Error("Failed to fetch markets");
  return res.json();
}

async function getTickers() {
  const res = await fetch("https://api.backpack.exchange/api/v1/tickers", {
    next: { revalidate: 10 },
  });

  if (!res.ok) throw new Error("Failed to fetch tickers");
  return res.json();
}

export default async function Page() {
  const [markets, tickers] = await Promise.all([getMarkets(), getTickers()]);

  // Merge ticker data to market symbol
  const tickerMap = Object.fromEntries(
    tickers.map((t: any) => [t.symbol, t])
  );

  return (
    <main className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Backpack Exchange Markets</CardTitle>
          <CardDescription>
            Real-time market data and statistics from Backpack Exchange.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>24h Change</TableHead>
                <TableHead className="text-right">Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {markets.map((m: any) => {
                const t = tickerMap[m.symbol];
                return (
                  <TableRow key={m.symbol}>
                    <TableCell className="font-medium">
                      <Link 
                        href={`/backpack/${m.symbol}`} 
                        className="hover:underline text-primary"
                      >
                        {m.symbol}
                      </Link>
                    </TableCell>
                    <TableCell>{t ? t.lastPrice : '-'}</TableCell>
                    <TableCell className={
                        !t ? "" :
                        parseFloat(t.priceChangePercent) < 0 ? "text-red-500" : "text-green-500"
                    }>
                      {t ? `${t.priceChangePercent}%` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                        {t ? parseFloat(t.volume).toLocaleString() : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
