import { ClobClient, Side } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon mainnet

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
    console.error("Missing POLYMARKET_PRIVATE_KEY or POLYMARKET_FUNDER_ADDRESS");
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  try {
    const wallet = new Wallet(privateKey);

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

    console.log("Trading client initialized successfully");
    return cachedClient;
  } catch (error) {
    console.error("Failed to initialize trading client:", error);
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
    return { success: false, error: "Trading client not configured" };
  }

  // Calculate scaled size based on percentage
  // If original trade is $100 and copyPercent is 10, we trade $10 worth
  const originalValue = originalSize * originalPrice;
  const targetValue = originalValue * (copyPercent / 100);
  const targetSize = targetValue / originalPrice;

  // Minimum order size is usually 5 shares
  if (targetSize < 5) {
    return {
      success: false,
      error: `Size too small (${targetSize.toFixed(2)} < 5 minimum)`
    };
  }

  try {
    // Get tick size for this token
    const tickSize = await client.getTickSize(tokenId);
    const negRisk = await client.getNegRisk(tokenId);

    const order = await client.createAndPostOrder(
      {
        tokenID: tokenId,
        price: originalPrice,
        size: Math.floor(targetSize), // Round down to whole shares
        side: side === "BUY" ? Side.BUY : Side.SELL,
      },
      { tickSize, negRisk }
    );

    return {
      success: true,
      orderId: order.orderID || order.id,
      size: Math.floor(targetSize),
      price: originalPrice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
