Trades API
Endpoints for retrieving trade history and information.

Get Trades
Get trade history with cursor-based pagination.

Endpoint: GET /public/api/v1/trade/{chainId}

Path Parameters
chainId (required, number) - Chain ID
Query Parameters
tokenId (required, string) - CTF token ID (symbol)
before (optional, string) - Encoded cursor for time filtering (get trades before this time)
after (optional, string) - Encoded cursor for time filtering (get trades after this time)
next_cursor (optional, string) - Encoded cursor for pagination (next page)
limit (optional, number, default: 10) - Maximum number of trades to return
Headers (L2 Authentication Required)
prob_address - EOA address (signed by EOA)
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Example Request
curl "https://api.probable.markets/public/api/v1/trade/56?tokenId=0xabc123...&limit=20" \
  -H "prob_address: 0x1234..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_api_key: pk_live_abc123xyz" \
  -H "prob_passphrase: my-passphrase"
Example Response
{
  "trades": [
    {
      "id": 12345,
      "orderId": 67890,
      "symbol": "BTC-USD",
      "price": "0.65",
      "qty": "1.0",
      "quoteQty": "0.65",
      "commission": "0.001",
      "commissionAsset": "USDC",
      "time": 1705312200000,
      "buyer": true,
      "maker": false,
      "counterpartyId": 11111
    }
  ],
  "next_cursor": "eyJ0aW1lIjoxNzA1MzEyMjAwMDAwfQ=="
}
Pagination
Use the next_cursor from the response to fetch the next page:

curl "https://api.probable.markets/public/api/v1/trade/56?tokenId=0xabc123...&next_cursor=eyJ0aW1lIjoxNzA1MzEyMjAwMDAwfQ=="
Get Public Trades
Get public trade history (no authentication required).

Endpoint: GET /public/api/v1/trades

Query Parameters
user (optional, string) - User Profile Address (0x-prefixed, 40 hex chars)
limit (optional, number, default: 100) - Maximum number of trades to return
offset (optional, number, default: 0) - Offset for pagination
takerOnly (optional, boolean, default: true) - Filter to taker trades only
filterType (optional, string) - Filter type: "CASH" or "TOKENS" (must be provided with filterAmount)
filterAmount (optional, number) - Filter amount (must be provided with filterType)
market (optional, string or array) - Comma-separated list of condition IDs. Mutually exclusive with eventId
eventId (optional, string or array) - Comma-separated list of event IDs. Mutually exclusive with market
side (optional, string) - Trade side: "BUY" or "SELL"
Example Request
curl "https://api.probable.markets/public/api/v1/trades?user=0x1234...&limit=50&side=BUY"
Example Response
[
  {
    "proxyWallet": "0x1234...",
    "side": "BUY",
    "asset": "USDC",
    "conditionId": "0xabc123...",
    "size": 1.0,
    "price": 0.65,
    "timestamp": 1705312200000,
    "title": "Will BTC exceed $100k?",
    "slug": "btc-100k",
    "icon": "https://...",
    "eventSlug": "btc-usd-2025-11",
    "outcome": "Yes",
    "outcomeIndex": 0,
    "name": "John Doe",
    "pseudonym": "trader123",
    "bio": "Crypto trader",
    "profileImage": "https://...",
    "profileImageOptimized": "https://...",
    "transactionHash": "0xdef456..."
  }
]