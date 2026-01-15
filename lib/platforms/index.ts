/**
 * Platform adapters index
 */

export * from "./types";
export { polymarketAdapter, getOrderBookByTokenId } from "./polymarket";
export { predictfunAdapter, findPredictFunMarket, KNOWN_MARKET_MAPPINGS } from "./predictfun";
export { probableAdapter, getPublicTrades, getUserActivity } from "./probable";

import { polymarketAdapter } from "./polymarket";
import { predictfunAdapter } from "./predictfun";
import { probableAdapter } from "./probable";
import type { Platform, PlatformAdapter } from "./types";

export const adapters: Record<Platform, PlatformAdapter> = {
  polymarket: polymarketAdapter,
  predictfun: predictfunAdapter,
  probable: probableAdapter,
  kalshi: predictfunAdapter, // TODO: implement kalshi adapter
  manifold: predictfunAdapter, // TODO: implement manifold adapter
};

export function getAdapter(platform: Platform): PlatformAdapter {
  return adapters[platform];
}
