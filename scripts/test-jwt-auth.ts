/**
 * Test JWT authentication flow for Predict.fun
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet } from "ethers";

const API_BASE = "https://api.predict.fun/v1";

async function test() {
  const apiKey = process.env.PREDICTFUN_API_KEY;

  // Try different wallets
  const privyKey = process.env.PREDICTFUN_PRIVYWALLET_KEY;
  const evmKey = process.env.PREDICTFUN_PRIVATE_KEY;

  // Use command line arg to switch: npx tsx test-jwt-auth.ts evm
  const useEvm = process.argv[2] === "evm";
  const privateKey = useEvm ? evmKey : (privyKey || evmKey);

  console.log("API Key:", apiKey?.substring(0, 10) + "...");
  console.log("Using wallet:", useEvm ? "EVM (regular)" : "Privy");
  console.log("Private Key set:", privateKey ? "yes" : "no");

  if (!apiKey || !privateKey) {
    console.log("Missing credentials");
    return;
  }

  // Step 1: Get message
  console.log("\n1. Getting auth message...");
  const msgRes = await fetch(API_BASE + "/auth/message", {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json();
  console.log("Success:", msgData.success);
  console.log("Message:", msgData.data?.message?.substring(0, 60) + "...");

  if (!msgData.success) {
    console.log("Failed to get message:", msgData);
    return;
  }

  // Step 2: Sign
  console.log("\n2. Signing message...");
  // Normalize private key - add 0x prefix if missing, trim whitespace
  let normalizedKey = privateKey.trim();
  if (!normalizedKey.startsWith("0x")) {
    normalizedKey = "0x" + normalizedKey;
  }
  console.log("Key length:", normalizedKey.length, "(expected 66 with 0x prefix)");

  const signer = new Wallet(normalizedKey);
  const signature = await signer.signMessage(msgData.data.message);
  console.log("Signature:", signature.substring(0, 30) + "...");
  console.log("Signer address:", signer.address);

  // Step 3: Login (POST /auth with signer, message, signature)
  console.log("\n3. Logging in...");
  const authRes = await fetch(API_BASE + "/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      signer: signer.address,
      message: msgData.data.message,
      signature,
    }),
  });
  const authText = await authRes.text();
  console.log("Auth response:", authText);

  let authData;
  try {
    authData = JSON.parse(authText);
  } catch {
    console.log("Failed to parse response");
    return;
  }
  console.log("Auth success:", authData.success);

  if (!authData.success) {
    console.log("Auth failed:", authData);
    return;
  }

  const token = authData.data?.token;
  console.log("Token received:", token ? "yes (" + token.substring(0, 20) + "...)" : "no");

  if (token) {
    console.log("\n4. Testing authenticated request...");
    const marketsRes = await fetch(API_BASE + "/markets?limit=3", {
      headers: {
        "x-api-key": apiKey,
        Authorization: "Bearer " + token,
      },
    });
    const markets = await marketsRes.json();
    console.log("Markets success:", markets.success);
    console.log("Markets count:", markets.data?.length || 0);

    if (markets.data?.length > 0) {
      console.log("\nSample market:");
      console.log("  Title:", markets.data[0].title);
      console.log("  ID:", markets.data[0].id);
    } else {
      console.log("Response:", JSON.stringify(markets).substring(0, 200));
    }
  }
}

test().catch(console.error);
