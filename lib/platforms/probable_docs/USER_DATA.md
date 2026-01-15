User Data
Endpoints for retrieving user activity, positions, and profit/loss data.

User Activity
Get user activity feed with comprehensive filtering options.

Endpoint: GET /public/api/v1/activity

Query Parameters
user (required, string) - User address
limit (optional, number) - Maximum number of results
offset (optional, number) - Offset for pagination
market (optional, string or array) - Comma-separated list of condition IDs. Mutually exclusive with eventId
eventId (optional, number or array) - Comma-separated list of event IDs. Mutually exclusive with market
type (optional, array) - Activity types: "TRADE", "SPLIT", "MERGE", "REDEEM", "REWARD", "CONVERSION"
start (optional, number) - Start timestamp
end (optional, number) - End timestamp
sortBy (optional, string) - Sort by: "TIMESTAMP", "TOKENS", "CASH"
sortDirection (optional, string) - Sort direction: "ASC" or "DESC"
side (optional, string) - Trade side: "BUY" or "SELL"
Example Request
curl "https://api.probable.markets/public/api/v1/activity?user=0x1234...&limit=100&offset=0&sortBy=TIMESTAMP&sortDirection=DESC"
Example Response
[
  {
    "proxyWallet": "0x1234...",
    "timestamp": 1766021317660,
    "conditionId": "0x2019c8f7a5614febc00d175f1774ff9d9ffb0c5a6476fb277d64af3e2a90f9f6",
    "type": "TRADE",
    "size": 4.34,
    "usdcSize": 2.9946,
    "transactionHash": "0xfdb33dbfbe3dc88b43bfec4c18e484bd3a4bbd5602ef14bb5811a1ea82bfc0c0",
    "price": 0.69,
    "asset": "11800194545320447162805717721654917296903656967731164403423073642765210545273",
    "side": "BUY",
    "outcomeIndex": 1,
    "title": "Will the Grizzlies win against the Timberwolves?",
    "slug": "will-grizzlies-win-vs-timberwolves-2025-12-17",
    "icon": "",
    "eventSlug": "nba-grizzlies-vs-timberwolves-dec-17-2025",
    "outcome": "MIN",
    "name": "",
    "pseudonym": "",
    "bio": "",
    "profileImage": "",
    "profileImageOptimized": ""
  }
]
Current Position
Get user's current positions.

Endpoint: GET /public/api/v1/position/current

Query Parameters
user (required, string) - User address
limit (optional, number) - Maximum number of results
eventId (optional, number) - Filter by event ID
Example Request
curl "https://api.probable.markets/public/api/v1/position/current?user=0x1234...&limit=100"
Or filter by event ID:

curl "https://api.probable.markets/public/api/v1/position/current?eventId=115&user=0x1234..."
Example Response
[
  {
    "asset": "11800194545320447162805717721654917296903656967731164403423073642765210545273",
    "conditionId": "0xd25e8f124e6b6577bd6a5731f33c2d327a0e5c320f2d22a5f6f5196688de88ed",
    "size": 4.34,
    "avgPrice": 0.69,
    "initialValue": 3.9744,
    "currentValue": 0,
    "cashPnl": -2.9946,
    "percentPnl": -100,
    "totalBought": 5.76,
    "realizedPnl": -2.4261999999999997,
    "percentRealizedPnl": -61.045692431561996,
    "curPrice": 0,
    "redeemable": true,
    "mergeable": false,
    "title": "Will the Grizzlies win against the Timberwolves?",
    "slug": "will-grizzlies-win-vs-timberwolves-2025-12-17",
    "icon": "",
    "eventSlug": "nba-grizzlies-vs-timberwolves-dec-17-2025",
    "outcome": "MIN",
    "outcomeIndex": 1,
    "oppositeOutcome": "MEM",
    "oppositeAsset": "106808096526227578757866083311477692286787530503432408976144301670100489402587",
    "endDate": "2025-12-17 21:00:00+00",
    "negativeRisk": false
  }
]
Profit and Loss (P&L)
Get profit and loss data for a user.

Endpoint: GET /public/api/v1/pnl

Query Parameters
user_address (required, string) - User address
Example Request
curl "https://api.probable.markets/public/api/v1/pnl?user_address=0x1234..."
Example Response
[
  {
    "t": 1766407351099,
    "p": -2.1762
  },
  {
    "t": 1766410951099,
    "p": -2.1762
  },
  {
    "t": 1766414551099,
    "p": -2.1762
  }
]