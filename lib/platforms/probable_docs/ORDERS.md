Orders API Reference
Complete reference documentation for order management endpoints.

Authentication Required: All order write operations (place, cancel) require L2 authentication. See the Getting Started Guide to learn how to set up L2 authentication.

Place Order
Create a new order.

Endpoint: POST /public/api/v1/order/{chainId}

Path Parameters
chainId (required, number) - Chain ID
Headers (L2 Authentication Required)
prob_address - User address
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Request Body
{
  "deferExec": true,
  "order": {
    "salt": "1234567890",
    "maker": "0xPROXY_WALLET...",
    "signer": "0xEOA_ADDRESS...",
    "taker": "0x0000...",
    "tokenId": "0xabc123...",
    "makerAmount": "1000000000000000000",
    "takerAmount": "500000000000000000",
    "side": "BUY",
    "expiration": "1735689600",
    "nonce": "0",
    "feeRateBps": "30",
    "signatureType": 0,
    "signature": "0xdef456..."
  },
  "owner": "0xPROXY_WALLET...",
  "orderType": "GTC"
}
Address Usage:
maker: Use your proxy wallet address
signer: Use your EOA address (signs the order)
owner: Use your proxy wallet address
Parameters
deferExec (required, boolean) - Defer execution
order (required, object) - Order details
salt (required, string) - Random salt
maker (required, string) - Proxy wallet address (the wallet that will hold the position)
signer (required, string) - EOA address (the address that signs the order)
taker (required, string) - Taker address (0x0000... for open orders)
tokenId (required, string) - CTF token ID
makerAmount (required, string) - Maker amount in wei
takerAmount (required, string) - Taker amount in wei
side (required, string) - "BUY" or "SELL"
expiration (required, string) - Expiration timestamp
nonce (required, string) - Nonce
feeRateBps (required, string) - Fee rate in basis points
signatureType (required, number) - Signature type
signature (required, string) - Order signature
owner (required, string) - Proxy wallet address (owner of the order)
orderType (required, string) - Order type: "GTC" or "IOC"
Order Types
GTC (Good Till Cancel) - Order remains active until canceled
IOC (Immediate Or Cancel) - Execute immediately or cancel
Example Request
curl -X POST "https://api.probable.markets/public/api/v1/order/56" \
  -H "Content-Type: application/json" \
  -H "prob_address: 0xEOA_ADDRESS..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_api_key: pk_live_abc123xyz" \
  -H "prob_passphrase: my-passphrase" \
  -d '{
    "deferExec": true,
    "order": {
      "salt": "1234567890",
      "maker": "0xPROXY_WALLET...",
      "signer": "0xEOA_ADDRESS...",
      "taker": "0x0000...",
      "tokenId": "0xabc123...",
      "makerAmount": "1000000000000000000",
      "takerAmount": "500000000000000000",
      "side": "BUY",
      "expiration": "1735689600",
      "nonce": "0",
      "feeRateBps": "30",
      "signatureType": 0,
      "signature": "0xdef456..."
    },
    "owner": "0xPROXY_WALLET...",
    "orderType": "GTC"
  }'
Example Response
{
  "orderId": 12345,
  "clientOrderId": "my-order-123",
  "symbol": "BTC-USD",
  "side": "BUY",
  "type": "LIMIT",
  "timeInForce": "GTC",
  "price": "0.5",
  "origQty": "1.0",
  "executedQty": "0.0",
  "cumQuote": "0.0",
  "status": "NEW",
  "time": 1705312200000,
  "updateTime": 1705312200000,
  "avgPrice": "0.0",
  "origType": "LIMIT",
  "tokenId": "0xabc123...",
  "ctfTokenId": "0xabc123...",
  "stopPrice": "0.0",
  "orderListId": -1,
  "cumQty": "0.0"
}
Get Order
Retrieve order details by order ID.

Endpoint: GET /public/api/v1/orders/{chainId}/{orderId}

Path Parameters
chainId (required, number) - Chain ID
orderId (required, string) - Order ID
Query Parameters
tokenId (required, string) - CTF token ID (symbol)
origClientOrderId (optional, string) - Client order ID
needOrigParam (optional, boolean) - Need original request parameter
Headers (L2 Authentication Required)
prob_address - EOA address (signed by EOA)
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Example Request
curl "https://api.probable.markets/public/api/v1/orders/56/12345?tokenId=0xabc123..." \
  -H "prob_address: 0xEOA_ADDRESS..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_api_key: pk_live_abc123xyz" \
  -H "prob_passphrase: my-passphrase"
Example Response
Same structure as Place Order response.

Cancel Order
Cancel an order by order ID.

Endpoint: DELETE /public/api/v1/order/{chainId}/{orderId}

Path Parameters
chainId (required, number) - Chain ID
orderId (required, string) - Order ID
Query Parameters
tokenId (required, string) - CTF token ID (symbol)
origClientOrderId (optional, string) - Client order ID
needOrigParam (optional, boolean) - Need original request parameter
Headers (L2 Authentication Required)
prob_address - EOA address (signed by EOA)
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Example Request
curl -X DELETE "https://api.probable.markets/public/api/v1/order/56/12345?tokenId=0xabc123..." \
  -H "prob_address: 0xEOA_ADDRESS..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_api_key: pk_live_abc123xyz" \
  -H "prob_passphrase: my-passphrase"
Example Response
Same structure as Place Order response, with status: "CANCELED".

Get Open Orders
Retrieve all open orders for a user.

Endpoint: GET /public/api/v1/orders/{chainId}/open

Path Parameters
chainId (required, number) - Chain ID
Query Parameters
eventId (optional, string) - Filter by event ID
token_ids (optional, array) - Filter by token IDs
page (optional, number) - Page number
limit (optional, number) - Results per page
Headers (L2 Authentication Required)
prob_address - EOA address (signed by EOA)
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Example Request
curl "https://api.probable.markets/public/api/v1/orders/56/open?page=1&limit=20" \
  -H "prob_address: 0xEOA_ADDRESS..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_api_key: pk_live_abc123xyz" \
  -H "prob_passphrase: my-passphrase"
Example Response
{
  "orders": [
    {
      "orderId": 12345,
      "symbol": "BTC-USD",
      "side": "BUY",
      "status": "NEW",
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}