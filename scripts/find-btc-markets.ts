/**
 * Find BTC markets on predict.fun
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.PREDICTFUN_USE_MAINNET = "true";

async function main() {
  const { predictfunAdapter } = await import("../lib/platforms/predictfun");

  const markets = await predictfunAdapter.getMarkets();

  // Search for BTC/Bitcoin related markets
  const btcMarkets = markets.filter(m =>
    m.title.toLowerCase().includes('btc') ||
    m.title.toLowerCase().includes('bitcoin') ||
    m.slug.toLowerCase().includes('btc') ||
    m.slug.toLowerCase().includes('bitcoin')
  );

  console.log('BTC-related markets:');
  btcMarkets.forEach(m => {
    console.log(`  [${m.id}] ${m.title}`);
    console.log(`      Slug: ${m.slug}`);
  });
  console.log(`\nTotal: ${btcMarkets.length} BTC markets`);

  // Also search for "15 min" or "15min" markets
  console.log('\n\n15-minute markets:');
  const min15Markets = markets.filter(m =>
    m.title.toLowerCase().includes('15') ||
    m.title.toLowerCase().includes('minute') ||
    m.title.toLowerCase().includes('min')
  );
  min15Markets.forEach(m => {
    console.log(`  [${m.id}] ${m.title}`);
  });
  console.log(`\nTotal: ${min15Markets.length} 15-min markets`);

  // Search for "up" or "down" markets (binary price prediction)
  console.log('\n\nUp/Down markets:');
  const upDownMarkets = markets.filter(m =>
    (m.title.toLowerCase().includes('up') && m.title.toLowerCase().includes('down')) ||
    m.outcomes?.some(o => o.name.toLowerCase() === 'up' || o.name.toLowerCase() === 'down')
  );
  upDownMarkets.forEach(m => {
    console.log(`  [${m.id}] ${m.title}`);
    console.log(`      Outcomes: ${m.outcomes?.map(o => o.name).join(', ')}`);
  });
  console.log(`\nTotal: ${upDownMarkets.length} up/down markets`);
}

main().catch(console.error);
