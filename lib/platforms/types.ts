/**
 * Common types for prediction market platforms
 */

export type Platform = "polymarket" | "predictfun" | "probable" | "kalshi" | "manifold";

export type OrderSide = "BUY" | "SELL";

export type OrderType = "MARKET" | "LIMIT";

export type OrderStatus = "PENDING" | "OPEN" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED";

export interface Market {
  platform: Platform;
  id: string;
  conditionId?: string;
  slug: string;
  title: string;
  outcomes: Outcome[];
  // For matching across platforms
  externalIds?: {
    polymarket?: string;
    predictfun?: string;
    kalshi?: string;
  };
}

export interface Outcome {
  index: number;
  name: string; // "Yes", "No", "Up", "Down", etc.
  tokenId?: string;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  platform: Platform;
  marketId: string;
  outcomeIndex: number;
  bids: OrderBookLevel[]; // Buy orders (sorted high to low)
  asks: OrderBookLevel[]; // Sell orders (sorted low to high)
  timestamp: number;
}

export interface Order {
  platform: Platform;
  id: string;
  marketId: string;
  outcomeIndex: number;
  side: OrderSide;
  type: OrderType;
  price: number;
  size: number;
  filledSize: number;
  status: OrderStatus;
  createdAt: number;
}

export interface Position {
  platform: Platform;
  marketId: string;
  outcomeIndex: number;
  size: number;
  avgPrice: number;
  currentPrice?: number;
  pnl?: number;
}

export interface ArbitrageOpportunity {
  buyPlatform: Platform;
  sellPlatform: Platform;
  market: {
    title: string;
    polymarketId?: string;
    predictfunId?: string;
  };
  outcomeIndex: number;
  outcomeName: string;
  buyPrice: number;
  sellPrice: number;
  spread: number; // sellPrice - buyPrice
  spreadPercent: number; // (spread / buyPrice) * 100
  maxSize: number; // Limited by liquidity on both sides
  potentialProfit: number; // spread * maxSize
}

/**
 * Platform adapter interface - each platform implements this
 */
export interface PlatformAdapter {
  platform: Platform;

  // Authentication
  isConfigured(): boolean;

  // Market data
  getMarkets(query?: string): Promise<Market[]>;
  getOrderBook(marketId: string, outcomeIndex: number): Promise<OrderBook | null>;

  // Trading
  placeLimitOrder(params: {
    marketId: string;
    outcomeIndex: number;
    side: OrderSide;
    price: number;
    size: number;
  }): Promise<Order | null>;

  placeMarketOrder(params: {
    marketId: string;
    outcomeIndex: number;
    side: OrderSide;
    size: number;
  }): Promise<Order | null>;

  cancelOrder(orderId: string): Promise<boolean>;

  // Positions
  getPositions(): Promise<Position[]>;
  getOpenOrders(): Promise<Order[]>;
}
