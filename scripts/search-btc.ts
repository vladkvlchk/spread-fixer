/**
 * Search for BTC markets on predict.fun
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const GRAPHQL_URL = "https://graphql.predict.fun/graphql";

async function main() {
  // Search for BTC/USD with different terms
  const searchTerms = ["BTC/USD", "BTC", "Up or Down", "15"];

  for (const term of searchTerms) {
    console.log(`\nSearching for "${term}"...\n`);

    const searchQuery = `
      query Search($query: String!) {
        search(query: $query) {
          markets {
            edges {
              node {
                id
                title
                status
              }
            }
          }
        }
      }
    `;

    const searchRes = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchQuery,
        variables: { query: term },
      }),
    });

    const searchData = await searchRes.json();
    if (searchData.errors) {
      console.log("Errors:", searchData.errors[0]?.message);
      continue;
    }

    const markets = searchData.data?.search?.markets?.edges || [];
    const activeMarkets = markets.filter((e: any) => e.node.status === "REGISTERED");
    const btcActive = activeMarkets.filter((e: any) =>
      e.node.title.includes("BTC") || e.node.title.includes("Up or Down")
    );

    console.log(`  Total: ${markets.length}, Active: ${activeMarkets.length}, BTC Active: ${btcActive.length}`);

    if (btcActive.length > 0) {
      console.log("  Active BTC markets:");
      btcActive.forEach((e: any) => {
        console.log(`    [${e.node.id}] ${e.node.title}`);
      });
    }

    // Show all active for debugging
    if (activeMarkets.length > 0 && activeMarkets.length <= 10) {
      console.log("  All active:");
      activeMarkets.forEach((e: any) => {
        console.log(`    [${e.node.id}] ${e.node.title}`);
      });
    }
  }

  // Try getting recent match events to see what's trading
  console.log("\n\n=== Recent Trades (to find active markets) ===\n");

  const matchQuery = `
    query GetMatchEventLog($pagination: ForwardPaginationInput) {
      matchEventLog(pagination: $pagination) {
        edges {
          node {
            timestamp
            market {
              id
              title
              status
            }
          }
        }
      }
    }
  `;

  const matchRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: matchQuery,
      variables: { pagination: { first: 50 } },
    }),
  });

  const matchData = await matchRes.json();
  if (!matchData.errors) {
    const events = matchData.data?.matchEventLog?.edges || [];

    // Find unique BTC markets from recent trades
    const btcTrades = events.filter((e: any) =>
      e.node.market.title.includes("BTC") ||
      e.node.market.title.includes("Up or Down")
    );

    const uniqueMarkets = new Map();
    btcTrades.forEach((e: any) => {
      if (!uniqueMarkets.has(e.node.market.id)) {
        uniqueMarkets.set(e.node.market.id, e.node.market);
      }
    });

    console.log(`Recent BTC/Up-Down trades found in ${uniqueMarkets.size} markets:`);
    uniqueMarkets.forEach((m: any) => {
      console.log(`  [${m.id}] ${m.title} (${m.status})`);
    });
  }
}

main().catch(console.error);
