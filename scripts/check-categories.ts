/**
 * Check categories on predict.fun to find BTC 15-min markets
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const GRAPHQL_URL = "https://graphql.predict.fun/graphql";

async function main() {
  // Get all categories
  console.log("Getting categories...\n");

  const catQuery = `
    query GetCategories {
      categories {
        edges {
          node {
            id
            slug
            name
          }
        }
      }
    }
  `;

  const catRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: catQuery }),
  });

  const catData = await catRes.json();
  const categories = catData.data?.categories?.edges || [];

  // Find BTC-related categories
  const btcCategories = categories.filter((e: any) =>
    e.node.slug.includes("btc") ||
    e.node.name?.toLowerCase().includes("btc") ||
    e.node.slug.includes("bitcoin") ||
    e.node.slug.includes("15-min") ||
    e.node.slug.includes("up-down")
  );

  console.log(`Found ${categories.length} total categories, ${btcCategories.length} BTC-related:\n`);

  if (btcCategories.length > 0) {
    btcCategories.forEach((e: any) => {
      console.log(`  [${e.node.id}] ${e.node.slug}`);
    });
  }

  // Show all categories to find the right one
  console.log("\nAll categories:");
  categories.forEach((e: any) => {
    console.log(`  ${e.node.slug}`);
  });

  // Try to get markets from a specific category (if we find BTC)
  const btcCat = categories.find((e: any) =>
    e.node.slug.includes("btc") || e.node.slug.includes("15")
  );

  if (btcCat) {
    console.log(`\n\nGetting markets from category: ${btcCat.node.slug}\n`);

    const marketQuery = `
      query GetCategoryMarkets($slug: String!) {
        category(slug: $slug) {
          id
          slug
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

    const marketRes = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: marketQuery,
        variables: { slug: btcCat.node.slug },
      }),
    });

    const marketData = await marketRes.json();
    const markets = marketData.data?.category?.markets?.edges || [];
    console.log(`Markets in category: ${markets.length}`);
    markets.slice(0, 20).forEach((e: any) => {
      console.log(`  [${e.node.id}] ${e.node.title} (${e.node.status})`);
    });
  }
}

main().catch(console.error);
