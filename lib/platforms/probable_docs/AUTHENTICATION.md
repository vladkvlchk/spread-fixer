Authentication API Reference
Complete reference documentation for authentication endpoints.

New to authentication? Start with the Getting Started Guide for a step-by-step walkthrough.

Authentication Levels
L1 Authentication (EIP-712)
Used for initial authentication and API key generation. Requires wallet signature.

Headers Required:
prob_address - EOA address (Externally Owned Account address)
prob_signature - EIP-712 signature signed by the EOA
prob_timestamp - Unix timestamp
prob_nonce - Nonce from /public/api/v1/auth/nonce
Important: prob_address must be your EOA address, and the signature must be signed by that EOA.

L2 Authentication (HMAC)
Used for authenticated API requests, including all orderbook write operations. Requires API key and secret.

Headers Required:
prob_address - EOA address (same as used in L1 authentication)
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Important: prob_address must be your EOA address (not proxy wallet address).

Generate Nonce
Get a nonce for L1 authentication.

Endpoint: GET /public/api/v1/auth/nonce

Example Request
curl "https://api.probable.markets/public/api/v1/auth/nonce"
Example Response
{
"nonce": "abc123xyz",
"issuedAt": "2025-01-15T10:30:00Z"
}
Login
Authenticate a user with wallet signature.

Endpoint: POST /public/api/v1/auth/login

Request Body
{
"identity": {
"account": "0x1234...",
"namespace": "default",
"chainId": "56",
"address": "0x1234..."
},
"message": "Sign in to Prob...",
"signature": "0xabc123...",
"nonce": "abc123xyz",
"issuedAt": "2025-01-15T10:30:00Z",
"domain": "prob.vbgf.cc"
}
Parameters
identity (required, object) - User identity information
account (required, string) - Account address
namespace (required, string) - Namespace
chainId (required, string) - Chain ID
address (required, string) - Wallet address
message (required, string) - Login message
signature (required, string) - Wallet signature (0x-prefixed hex)
nonce (required, string) - Nonce from nonce endpoint
issuedAt (required, string) - ISO timestamp
domain (required, string) - Domain name
Example Request
curl -X POST "https://api.probable.markets/public/api/v1/auth/login" \
 -H "Content-Type: application/json" \
 -d '{
"identity": {
"account": "0x1234...",
"namespace": "default",
"chainId": "56",
"address": "0x1234..."
},
"message": "Sign in to Prob...",
"signature": "0xabc123...",
"nonce": "abc123xyz",
"issuedAt": "2025-01-15T10:30:00Z",
"domain": "prob.vbgf.cc"
}'
Logout
Log out the current user.

Endpoint: POST /public/api/v1/auth/logout

Example Request
curl -X POST "https://api.probable.markets/public/api/v1/auth/logout"
Example Response
{
"success": true
}
Verify L1 Headers
Verify L1 authentication headers (EIP-712 signature).

Endpoint: POST /public/api/v1/auth/verify/l1

Request Body
{
"chainId": 56
}
Headers
prob_address - User address
prob_signature - EIP-712 signature
prob_timestamp - Unix timestamp
prob_nonce - Nonce
Example Response
{
"valid": true,
"address": "0x1234...",
"chainId": 56,
"message": "Verification successful"
}
Verify L2 Headers
Verify L2 authentication headers (HMAC signature with API key).

Endpoint: POST /public/api/v1/auth/verify/l2

Request Body
{
"chainId": 56,
"method": "POST",
"path": "/public/api/v1/order/56",
"body": {}
}
Headers
prob_address - User address
prob_signature - HMAC signature
prob_timestamp - Unix timestamp
prob_api_key - API key
prob_passphrase - API passphrase
Example Response
{
"valid": true,
"address": "0x1234...",
"chainId": 56,
"message": "Verification successful"
}
