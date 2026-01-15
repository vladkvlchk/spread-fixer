import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

const CLOB_HOST = "https://clob.polymarket.com";
const DATA_API = "https://data-api.polymarket.com";
const CHAIN_ID = 137; // Polygon mainnet

const DEBUG = false;

type ApiCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

let cachedClient: ClobClient | null = null;
let cachedCreds: ApiCreds | null = null;

export async function getTradingClient(): Promise<ClobClient | null> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

  if (!privateKey || !funderAddress) {
    if (DEBUG) console.error("Missing POLYMARKET_PRIVATE_KEY or POLYMARKET_FUNDER_ADDRESS");
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  try {
    const wallet = new Wallet(privateKey);
    const walletAddress = await wallet.getAddress();

    if (DEBUG) {
      console.log("Wallet address:", walletAddress);
      console.log("Funder address:", funderAddress);
    }

    // First create client without creds to derive API key
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet);
    const creds = await tempClient.createOrDeriveApiKey();
    cachedCreds = creds;

    // Create authenticated client
    cachedClient = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      wallet,
      creds,
      2, // GNOSIS_SAFE signature type (most common for Polymarket)
      funderAddress
    );

    if (DEBUG) console.log("Trading client initialized successfully");
    return cachedClient;
  } catch (error) {
    // Clear cache on error so next attempt starts fresh
    cachedClient = null;
    cachedCreds = null;

    // Always log API key errors - they're critical
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("api key") || errMsg.includes("Could not create")) {
      console.error("❌ API Key Error - check that:");
      console.error("   1. POLYMARKET_PRIVATE_KEY is correct");
      console.error("   2. POLYMARKET_FUNDER_ADDRESS matches your Polymarket profile");
      console.error("   3. You've enabled trading on polymarket.com first");
    }
    if (DEBUG) console.error("Failed to initialize trading client:", error);
    return null;
  }
}

export type CopyTradeParams = {
  tokenId: string;
  side: "BUY" | "SELL";
  originalSize: number;
  originalPrice: number;
  copyPercent: number;
};

export type CopyTradeResult = {
  success: boolean;
  error?: string;
  orderId?: string;
  size?: number;
  price?: number;
};

export async function executeCopyTrade(params: CopyTradeParams): Promise<CopyTradeResult> {
  const { tokenId, side, originalSize, originalPrice, copyPercent } = params;

  const client = await getTradingClient();
  if (!client) {
    return { success: false, error: "API key failed - check credentials" };
  }

  // Calculate scaled size based on percentage
  // If original trade is $100 and copyPercent is 10, we trade $10 worth
  const originalValue = originalSize * originalPrice;
  const targetValue = originalValue * (copyPercent / 100);
  const targetSize = targetValue / originalPrice;

  // Round to 2 decimal places
  const finalSize = Math.round(targetSize * 100) / 100;
  const requiredUsdc = Math.round(finalSize * originalPrice * 100) / 100;

  // Polymarket limits: Market orders = min $1
  // We use FOK market orders (fill completely or cancel)
  if (requiredUsdc < 1) {
    return {
      success: false,
      error: `Market order min $1 (got $${requiredUsdc.toFixed(2)})`
    };
  }

  try {
    // Check USDC balance (skip if fails - order will fail naturally)
    try {
      const balanceData = await client.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      const rawBalance = balanceData?.balance || "0";
      // Try to parse - might be in wei (6 decimals) or already in USDC
      let usdcBalance = parseFloat(rawBalance);
      // If balance seems too large, it's probably in wei
      if (usdcBalance > 1_000_000) {
        usdcBalance = usdcBalance / 1e6;
      }

      if (usdcBalance > 0 && usdcBalance < requiredUsdc) {
        return {
          success: false,
          error: `Insufficient balance: $${usdcBalance.toFixed(2)} < $${requiredUsdc.toFixed(2)} needed`
        };
      }
    } catch {
      // Balance check failed, proceed anyway - order will fail if no funds
      if (DEBUG) console.log("Balance check failed, proceeding with order");
    }

    // Get tick size for this token
    const tickSize = await client.getTickSize(tokenId);
    const negRisk = await client.getNegRisk(tokenId);

    // Use FOK (Fill or Kill) market order - either fills completely or cancels
    // No hanging limit orders left behind
    const response = await client.createAndPostMarketOrder(
      {
        tokenID: tokenId,
        amount: requiredUsdc, // Market orders use USDC amount, not share size
        side: side === "BUY" ? Side.BUY : Side.SELL,
      },
      { tickSize, negRisk },
      OrderType.FOK
    );

    // Check if order was actually accepted
    if (response?.error || response?.errorMsg) {
      return {
        success: false,
        error: response.error || response.errorMsg || "Order rejected"
      };
    }

    if (!response?.orderID && !response?.id && !response?.success) {
      return {
        success: false,
        error: `Unexpected response: ${JSON.stringify(response)}`
      };
    }

    return {
      success: true,
      orderId: response.orderID || response.id || "unknown",
      size: finalSize,
      price: originalPrice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Parse common errors
    if (message.includes("insufficient")) {
      return { success: false, error: "Insufficient USDC balance" };
    }
    if (message.includes("allowance")) {
      return { success: false, error: "Need to approve USDC spending on Polymarket" };
    }
    return { success: false, error: message };
  }
}

// Redeemable positions check
export type RedeemablePosition = {
  title: string;
  outcome: string;
  size: number;
  currentValue: number;
  slug: string;
};

export async function getRedeemablePositions(): Promise<RedeemablePosition[]> {
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
  if (!funderAddress) return [];

  try {
    const res = await fetch(
      `${DATA_API}/positions?user=${funderAddress}&redeemable=true&sizeThreshold=0`
    );
    if (!res.ok) return [];

    const positions = await res.json();
    return positions.map((p: {
      title: string;
      outcome: string;
      size: number;
      currentValue: number;
      slug: string;
    }) => ({
      title: p.title,
      outcome: p.outcome,
      size: p.size,
      currentValue: p.currentValue,
      slug: p.slug,
    }));
  } catch {
    return [];
  }
}

export async function checkAndAlertRedeemable(): Promise<{
  hasRedeemable: boolean;
  positions: RedeemablePosition[];
  totalValue: number;
}> {
  const positions = await getRedeemablePositions();
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);

  return {
    hasRedeemable: positions.length > 0,
    positions,
    totalValue,
  };
}
