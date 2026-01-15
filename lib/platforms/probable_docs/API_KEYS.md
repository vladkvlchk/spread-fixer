API Keys API Reference
Complete reference documentation for API key management endpoints.

Prerequisites: API key generation requires L1 authentication. See the Getting Started Guide for the complete authentication flow.

Generate API Key
Create a new API key for a specific chain.

Endpoint: POST /public/api/v1/auth/api-key/{chainId}

Path Parameters
chainId (required, number) - Chain ID
Headers (L1 Authentication Required)
prob_address - EOA address (Externally Owned Account address)
prob_signature - EIP-712 signature signed by the EOA
prob_timestamp - Unix timestamp
prob_nonce - Nonce from nonce endpoint
Example Request
curl -X POST "https://api.probable.markets/public/api/v1/auth/api-key/56" \
  -H "prob_address: 0x1234..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_nonce: abc123xyz"
Example Response
{
  "apiKey": "pk_live_abc123xyz",
  "secret": "sk_live_def456uvw",
  "passphrase": "my-passphrase"
}
Important: Store the secret and passphrase securely. They cannot be retrieved later.

Get API Key
Retrieve existing API key information.

Endpoint: GET /public/api/v1/auth/api-key/{chainId}

Path Parameters
chainId (required, number) - Chain ID
Headers (L1 Authentication Required)
prob_address - EOA address (same as used for API key generation)
prob_signature - EIP-712 signature signed by the EOA
prob_timestamp - Unix timestamp
prob_nonce - Nonce
Example Request
curl "https://api.probable.markets/public/api/v1/auth/api-key/56" \
  -H "prob_address: 0x1234..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_nonce: abc123xyz"
Example Response
{
  "apiKey": "pk_live_abc123xyz",
  "secret": "sk_live_def456uvw",
  "passphrase": "my-passphrase"
}
Delete API Key
Delete an API key.

Endpoint: DELETE /public/api/v1/auth/api-key/{chainId}

Path Parameters
chainId (required, number) - Chain ID
Headers (L1 Authentication Required)
prob_address - EOA address (same as used for API key generation)
prob_signature - EIP-712 signature signed by the EOA
prob_timestamp - Unix timestamp
prob_api_key - API key to delete
prob_passphrase - API passphrase
Example Request
curl -X DELETE "https://api.probable.markets/public/api/v1/auth/api-key/56" \
  -H "prob_address: 0x1234..." \
  -H "prob_signature: 0xabc123..." \
  -H "prob_timestamp: 1705312200" \
  -H "prob_api_key: pk_live_abc123xyz" \
  -H "prob_passphrase: my-passphrase"
Example Response
{
  "success": true,
  "message": "API key deleted successfully"
}
Security Notes
Deleting an API key immediately invalidates it
All requests using the deleted key will fail
Generate a new key if you need to continue using the API