Step 3: L2 Authentication (HMAC Signing)
L2 authentication uses HMAC-SHA256 to sign requests with your API key and secret.

3.1 Create HMAC Signature
The signature is created by hashing a combination of:

Timestamp
HTTP method (GET, POST, etc.)
Request path
Request body (if any)
Example (JavaScript):
import crypto from 'crypto';

function createL2Signature(timestamp, method, path, body, secret, passphrase) {
const message = `${timestamp}${method}${path}${body ? JSON.stringify(body) : ''}`;
const hmac = crypto.createHmac('sha256', secret);
hmac.update(message);
return hmac.digest('hex');
}

const timestamp = Math.floor(Date.now() / 1000).toString();
const method = 'POST';
const path = '/public/api/v1/order/56';
const body = { /_ your order data _/ };

const signature = createL2Signature(
timestamp,
method,
path,
body,
apiSecret,
passphrase
);
3.2 Prepare L2 Headers
For L2-authenticated requests, include these headers:

prob_address - Your EOA address (same as L1)
prob_signature - HMAC signature (from step 3.1)
prob_timestamp - Current Unix timestamp
prob_api_key - Your API key
prob_passphrase - Your passphrase
Step 4: Submit an Order
Now you can use L2 credentials to place orders.

4.1 Prepare Order Data
{
"deferExec": false,
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
4.2 Create HMAC Signature
const timestamp = Math.floor(Date.now() / 1000).toString();
const method = 'POST';
const path = '/public/api/v1/order/56';
const body = JSON.stringify(orderData);

const signature = createL2Signature(
timestamp,
method,
path,
body,
apiSecret,
passphrase
);
4.3 Submit Order
curl -X POST "https://api.probable.markets/public/api/v1/order/56" \
 -H "Content-Type: application/json" \
 -H "prob_address: 0xEOA_ADDRESS..." \
 -H "prob_signature: 0xhmac_signature..." \
 -H "prob_timestamp: 1705312200" \
 -H "prob_api_key: pk_live_abc123xyz" \
 -H "prob_passphrase: my-passphrase" \
 -d '{
"deferExec": false,
"order": {
"maker": "0xPROXY_WALLET...",
"signer": "0xEOA_ADDRESS...",
...
},
"owner": "0xPROXY_WALLET...",
"orderType": "GTC"
}'
Note:
prob_address header: Use your EOA address
Order maker field: Use your proxy wallet address
Order signer field: Use your EOA address
Order owner field: Use your proxy wallet address
Response:
{
"orderId": 12345,
"symbol": "BTC-USD",
"side": "BUY",
"status": "NEW",
...
}
Complete Example
Here's a complete example in JavaScript:

import crypto from 'crypto';
import axios from 'axios';

const BASE_URL = 'https://api.probable.markets';
const eoaAddress = '0x...'; // Your EOA address
const proxyWalletAddress = await getOrCreateProxyWallet(eoaAddress); // Get or create proxy wallet
const chainId = 56;

// Step 1: Get nonce
const { data: nonceData } = await axios.get(`${BASE_URL}/public/api/v1/auth/nonce`);
const nonce = nonceData.nonce;

// Step 2: Sign with wallet (using ethers.js)
const signature = await signer.\_signTypedData(domain, types, message);

// Step 3: Login (use EOA address for authentication)
await axios.post(`${BASE_URL}/public/api/v1/auth/login`, {
identity: { account: eoaAddress, namespace: 'default', chainId: '56', address: eoaAddress },
message: 'Sign in to Prob...',
signature,
nonce,
issuedAt: new Date().toISOString(),
domain: 'prob.vbgf.cc'
});

// Step 4: Generate API key (with L1 headers)
const timestamp = Math.floor(Date.now() / 1000).toString();
const { data: apiKeyData } = await axios.post(
`${BASE_URL}/public/api/v1/auth/api-key/${chainId}`,
{},
{
headers: {
prob_address: eoaAddress, // Use EOA address for authentication
prob_signature: signature,
prob_timestamp: timestamp,
prob_nonce: nonce
}
}
);

const { apiKey, secret, passphrase } = apiKeyData;

// Step 5: Create L2 signature function
function createL2Signature(timestamp, method, path, body, secret, passphrase) {
const message = `${timestamp}${method}${path}${body ? JSON.stringify(body) : ''}`;
return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

// Step 6: Place order (with L2 headers)
const orderData = {
deferExec: false,
order: {
/_ order details _/
maker: proxyWalletAddress, // Use proxy wallet address
signer: eoaAddress, // Use EOA address (signs the order)
// ... other order fields
},
owner: proxyWalletAddress, // Use proxy wallet address
orderType: 'GTC'
};

const orderTimestamp = Math.floor(Date.now() / 1000).toString();
const orderPath = `/public/api/v1/order/${chainId}`;
const orderSignature = createL2Signature(
orderTimestamp,
'POST',
orderPath,
orderData,
secret,
passphrase
);

const { data: orderResponse } = await axios.post(
`${BASE_URL}${orderPath}`,
orderData,
{
headers: {
'Content-Type': 'application/json',
prob_address: eoaAddress, // Use EOA address for authentication
prob_signature: orderSignature,
prob_timestamp: orderTimestamp,
prob_api_key: apiKey,
prob_passphrase: passphrase
}
}
);

console.log('Order placed:', orderResponse);
Next Steps
Proxy Wallet Guide - Detailed proxy wallet creation guide
Authentication Reference - Detailed authentication API specs
API Keys Reference - API key management endpoints
Orders Reference - Complete order management API
