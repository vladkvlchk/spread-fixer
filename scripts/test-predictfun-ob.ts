/**
 * Test multiple orderbooks from predict.fun
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.PREDICTFUN_USE_MAINNET = "true";

async function main() {
  const { predictfunAdapter } = await import("../lib/platforms/predictfun");

  console.log("Testing orderbooks for multiple markets...\n");

  // Get first 10 markets
  const markets = await predictfunAdapter.getMarkets();
  console.log(`Total markets: ${markets.length}\n`);

  // Check orderbooks for first 5 active markets
  for (const market of markets.slice(0, 5)) {
    console.log(`\n--- ${market.title} (ID: ${market.id}) ---`);
    console.log(`Outcomes: ${market.outcomes?.map(o => o.name).join(', ')}`);

    const ob = await predictfunAdapter.getOrderBook(market.id, 0);
    if (ob && ob.bids.length > 0 && ob.asks.length > 0) {
      const bestBid = ob.bids[0];
      const bestAsk = ob.asks[0];
      const spread = bestAsk.price - bestBid.price;
      console.log(`Best Bid: ${bestBid.price.toFixed(3)} (${bestBid.size.toFixed(2)} shares)`);
      console.log(`Best Ask: ${bestAsk.price.toFixed(3)} (${bestAsk.size.toFixed(2)} shares)`);
      console.log(`Spread: ${(spread * 100).toFixed(2)}%`);
    } else {
      console.log(`No orderbook data or empty`);
    }
  }
}

main().catch(console.error);
