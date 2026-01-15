/**
 * Test predict.fun GraphQL API
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const GRAPHQL_URL = "https://graphql.predict.fun/graphql";

async function main() {
  // First, get schema info
  console.log("1. Checking schema...\n");

  const schemaQuery = `{
    __schema {
      queryType {
        fields {
          name
        }
      }
    }
  }`;

  const schemaRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: schemaQuery }),
  });
  const schemaData = await schemaRes.json();
  console.log("Available queries:", schemaData.data?.__schema?.queryType?.fields?.map((f: any) => f.name));

  // Try the match event log query from the user
  console.log("\n2. Testing MatchEventLog query...\n");

  const matchQuery = `
    query GetMatchEventLog($filter: MatchEventLogFilterInput, $pagination: ForwardPaginationInput) {
      matchEventLog(filter: $filter, pagination: $pagination) {
        pageInfo {
          hasNextPage
          startCursor
          endCursor
        }
        edges {
          cursor
          node {
            quoteType
            timestamp
            transactionHash
            amountFilled
            priceExecuted
            market {
              id
              title
            }
            outcome {
              id
              index
              name
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
      variables: {
        pagination: { first: 5 },
      },
      operationName: "GetMatchEventLog",
    }),
  });
  const matchData = await matchRes.json();
  console.log("Match events:");
  console.log(JSON.stringify(matchData, null, 2));

  // Try getting markets with correct type
  console.log("\n3. Testing markets query...\n");

  const marketsQuery = `
    query GetMarkets($sort: MarketSortInput, $pagination: ForwardPaginationInput) {
      markets(sort: $sort, pagination: $pagination) {
        edges {
          node {
            id
            title
            status
            category {
              slug
            }
            outcomes {
              edges {
                node {
                  id
                  name
                  index
                }
              }
            }
          }
        }
      }
    }
  `;

  const marketsRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: marketsQuery,
      variables: {
        pagination: { first: 10 },
      },
      operationName: "GetMarkets",
    }),
  });
  const marketsData = await marketsRes.json();
  console.log("Markets:");
  if (marketsData.data?.markets?.edges) {
    marketsData.data.markets.edges.forEach((e: any) => {
      console.log(`  ${e.node.id}: ${e.node.title} (${e.node.status})`);
    });
  } else {
    console.log(JSON.stringify(marketsData, null, 2));
  }

  // Try getting a specific market with orderbook
  console.log("\n4. Getting market 785 details...\n");

  const marketQuery = `
    query GetMarket($id: ID!) {
      market(id: $id) {
        id
        title
        status
        conditionId
        category {
          slug
        }
        outcomes {
          edges {
            node {
              id
              name
              index
              onChainId
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
      variables: { id: "785" },
      operationName: "GetMarket",
    }),
  });
  const marketData = await marketRes.json();
  console.log("Market 785:");
  console.log(JSON.stringify(marketData, null, 2));

  // Introspect Statistics type
  console.log("\n5. Introspecting Statistics type...\n");

  const introspectQuery = `
    query IntrospectStats {
      __type(name: "Statistics") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  `;

  const introspectRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: introspectQuery }),
  });
  const introspectData = await introspectRes.json();
  console.log("Statistics fields:");
  console.log(JSON.stringify(introspectData, null, 2));

  // Introspect Order type
  console.log("\n6. Introspecting Order type...\n");

  const orderTypeQuery = `
    query IntrospectOrder {
      __type(name: "Order") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  `;

  const orderTypeRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: orderTypeQuery }),
  });
  const orderTypeData = await orderTypeRes.json();
  console.log("Order fields:");
  const orderFields = orderTypeData.data?.__type?.fields || [];
  orderFields.forEach((f: any) => {
    console.log(`  ${f.name}: ${f.type?.name || f.type?.kind}`);
  });

  // Introspect MarketStatistics type
  console.log("\n7. Introspecting MarketStatistics type...\n");

  const marketStatsQuery = `
    query IntrospectMarketStats {
      __type(name: "MarketStatistics") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  `;

  const marketStatsRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: marketStatsQuery }),
  });
  const marketStatsData = await marketStatsRes.json();
  console.log("MarketStatistics fields:");
  console.log(JSON.stringify(marketStatsData.data?.__type?.fields?.map((f: any) => f.name), null, 2));

  // Get market with orders (orderbook)
  console.log("\n8. Getting market 785 with orders...\n");

  const marketOrdersQuery = `
    query GetMarketWithOrders($id: ID!) {
      market(id: $id) {
        id
        title
        statistics {
          totalLiquidityUsd
          volumeTotalUsd
          volume24hUsd
        }
        orders(pagination: { first: 20 }) {
          edges {
            node {
              id
              quoteType
              priceInCurrency
              status
              amount
              amountFilled
              outcome {
                id
                name
                index
              }
            }
          }
        }
      }
    }
  `;

  const marketOrdersRes = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: marketOrdersQuery,
      variables: { id: "785" },
    }),
  });
  const marketOrdersData = await marketOrdersRes.json();
  console.log("Market 785 with orders:");
  console.log(JSON.stringify(marketOrdersData, null, 2));

  // Check REST API with auth for orderbook
  console.log("\n9. Trying REST API orderbook for market 785 (with auth)...\n");

  // Auth
  const apiKey = process.env.PREDICTFUN_API_KEY;
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY;
  const { Wallet } = await import("ethers");

  if (!apiKey || !privateKey) {
    console.log("Missing API key or private key");
    return;
  }

  const API_BASE = "https://api.predict.fun/v1";
  const normalizedKey = privateKey.trim().startsWith("0x") ? privateKey.trim() : "0x" + privateKey.trim();

  // Get JWT
  const msgRes = await fetch(`${API_BASE}/auth/message`, {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json();
  const message = msgData.data?.message;

  const signer = new Wallet(normalizedKey);
  const signature = await signer.signMessage(message);

  const authRes = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ signer: signer.address, message, signature }),
  });
  const authData = await authRes.json();
  const token = authData.data?.token;

  if (!token) {
    console.log("Failed to get JWT token");
    return;
  }

  console.log("Got JWT token, fetching orderbook...");

  // Fetch orderbook
  const restOrderbookRes = await fetch(`${API_BASE}/markets/785/orderbook`, {
    headers: { "x-api-key": apiKey, Authorization: `Bearer ${token}` },
  });
  const restOrderbook = await restOrderbookRes.json();
  console.log("REST orderbook response:");
  console.log(JSON.stringify(restOrderbook, null, 2));

  // Also try market details from REST API
  console.log("\n10. Trying REST API market details for market 785...\n");
  const restMarketRes = await fetch(`${API_BASE}/markets/785`, {
    headers: { "x-api-key": apiKey, Authorization: `Bearer ${token}` },
  });
  const restMarket = await restMarketRes.json();
  console.log("REST market response:");
  console.log(JSON.stringify(restMarket, null, 2));
}

main().catch(console.error);
