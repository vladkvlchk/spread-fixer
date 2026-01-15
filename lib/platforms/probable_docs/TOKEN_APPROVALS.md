Token Approvals
After creating a proxy wallet, you need to approve token spending allowances to enable trading operations. This guide shows you how to approve the necessary tokens using TypeScript and Viem.

Overview
To enable trading on the orderbook, you need to approve:

USDT (ERC20) - Approve spending to:

CTF Token contract (for splitting/merging operations)
CTF Exchange contract (for trading operations)
CTF Tokens (ERC1155) - Approve spending to:

CTF Exchange contract (for trading operations)
Contract Addresses
BSC Mainnet:
USDT (ERC20): 0x364d05055614B506e2b9A287E4ac34167204cA83
CTF Token Contract (ERC1155): 0xc53a8b3bF7934fe94305Ed7f84a2ea8ce1028a12
CTF Exchange: 0xF99F5367ce708c66F0860B77B4331301A5597c86
Prerequisites
Install required dependencies:

npm install viem @safe-global/protocol-kit
Note: We'll use Safe Protocol Kit for creating Safe transactions, but all interactions will use viem. The Safe SDK can work with viem's transport adapter.

Step 1: Setup Viem Clients
import { createWalletClient, createPublicClient, http, custom } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import Safe, { MetaTransactionData, OperationType } from '@safe-global/protocol-kit';
 
// Setup account and clients
const account = privateKeyToAccount('0x...' as `0x${string}`);
const eoaAddress = account.address;
 
const publicClient = createPublicClient({
  chain: bsc,
  transport: http(),
});
 
const walletClient = createWalletClient({
  account,
  chain: bsc,
  transport: http(),
});
 
// Get proxy wallet address (from previous step)
const proxyWalletAddress = await computeProxyAddress(eoaAddress);
Step 2: Initialize Safe Protocol Kit
Since the proxy wallet is a Gnosis Safe, you need to use the Safe Protocol Kit to create and sign transactions. The Safe SDK can work with viem's transport:

// Initialize Safe Protocol Kit with viem transport
const safeProtocolKit = await Safe.init({
  provider: walletClient.transport, // Use viem's transport
  signer: eoaAddress,
  safeAddress: proxyWalletAddress,
});
Note: Safe transactions will be created and executed directly using the Safe SDK's executeTransaction method.

Step 3: Define Contract ABIs
import { parseAbi, encodeFunctionData, maxUint256 } from 'viem';
 
// ERC20 ABI for approve function
const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);
 
// ERC1155 ABI for setApprovalForAll function
const erc1155Abi = parseAbi([
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address account, address operator) external view returns (bool)',
]);
Step 4: Check Current Approvals
Before approving, check if approvals are already set:

const USDT_ADDRESS = '0x364d05055614B506e2b9A287E4ac34167204cA83' as const;
const CTF_TOKEN_ADDRESS = '0xc53a8b3bF7934fe94305Ed7f84a2ea8ce1028a12' as const;
const CTF_EXCHANGE_ADDRESS = '0xF99F5367ce708c66F0860B77B4331301A5597c86' as const;
 
async function checkApprovals(proxyWalletAddress: `0x${string}`) {
  // Check USDT approval to CTF Token contract
  const usdtToCtfAllowance = await publicClient.readContract({
    address: USDT_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [proxyWalletAddress, CTF_TOKEN_ADDRESS],
  });
 
  // Check USDT approval to CTF Exchange
  const usdtToExchangeAllowance = await publicClient.readContract({
    address: USDT_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [proxyWalletAddress, CTF_EXCHANGE_ADDRESS],
  });
 
  // Check CTF Token approval to CTF Exchange
  const ctfToExchangeApproved = await publicClient.readContract({
    address: CTF_TOKEN_ADDRESS,
    abi: erc1155Abi,
    functionName: 'isApprovedForAll',
    args: [proxyWalletAddress, CTF_EXCHANGE_ADDRESS],
  });
 
  return {
    usdtToCtf: usdtToCtfAllowance > 0n,
    usdtToExchange: usdtToExchangeAllowance > 0n,
    ctfToExchange: ctfToExchangeApproved,
  };
}
 
const approvals = await checkApprovals(proxyWalletAddress);
console.log('Current approvals:', approvals);
Step 5: Create Approval Transactions
Create Safe transactions for the approvals:

async function createApprovalTransactions(
  proxyWalletAddress: `0x${string}`
): Promise<MetaTransactionData[]> {
  const transactions: MetaTransactionData[] = [];
 
  // Approve USDT to CTF Token contract
  transactions.push({
    to: USDT_ADDRESS,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [CTF_TOKEN_ADDRESS, maxUint256],
    }),
    value: '0',
    operation: OperationType.Call,
  });
 
  // Approve USDT to CTF Exchange
  transactions.push({
    to: USDT_ADDRESS,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [CTF_EXCHANGE_ADDRESS, maxUint256],
    }),
    value: '0',
    operation: OperationType.Call,
  });
 
  // Approve CTF Tokens to CTF Exchange (setApprovalForAll)
  transactions.push({
    to: CTF_TOKEN_ADDRESS,
    data: encodeFunctionData({
      abi: erc1155Abi,
      functionName: 'setApprovalForAll',
      args: [CTF_EXCHANGE_ADDRESS, true],
    }),
    value: '0',
    operation: OperationType.Call,
  });
 
  return transactions;
}
Step 6: Execute Approvals
Create and execute the Safe transaction directly:

async function approveTokens(
  proxyWalletAddress: `0x${string}`
) {
  // Create transactions
  const transactions = await createApprovalTransactions(proxyWalletAddress);
 
  // Create Safe transaction
  const safeTransaction = await safeProtocolKit.createTransaction({
    transactions,
  });
 
  // Execute the transaction directly using the Safe SDK
  // The SDK will handle signing and execution
  const executeTxResponse = await safeProtocolKit.executeTransaction(safeTransaction);
 
  console.log('Transaction hash:', executeTxResponse.hash);
  
  // Wait for transaction confirmation using viem
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: executeTxResponse.hash as `0x${string}`,
  });
  
  console.log('Transaction confirmed:', receipt.transactionHash);
  return receipt;
}
Step 7: Verify Approvals
After execution, verify that approvals were set correctly:

async function verifyApprovals(proxyWalletAddress: `0x${string}`) {
  const approvals = await checkApprovals(proxyWalletAddress);
 
  if (!approvals.usdtToCtf) {
    throw new Error('USDT approval to CTF Token contract failed');
  }
  if (!approvals.usdtToExchange) {
    throw new Error('USDT approval to CTF Exchange failed');
  }
  if (!approvals.ctfToExchange) {
    throw new Error('CTF Token approval to CTF Exchange failed');
  }
 
  console.log('All approvals verified successfully');
}
 
await verifyApprovals(proxyWalletAddress);
Complete Example
Here's a complete example that checks, creates, and executes approvals:

import { createWalletClient, createPublicClient, http, encodeFunctionData, maxUint256, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import Safe, { MetaTransactionData, OperationType } from '@safe-global/protocol-kit';
 
// Contract addresses
const USDT_ADDRESS = '0x364d05055614B506e2b9A287E4ac34167204cA83' as const;
const CTF_TOKEN_ADDRESS = '0xc53a8b3bF7934fe94305Ed7f84a2ea8ce1028a12' as const;
const CTF_EXCHANGE_ADDRESS = '0xF99F5367ce708c66F0860B77B4331301A5597c86' as const;
 
// ABIs
const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);
 
const erc1155Abi = parseAbi([
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address account, address operator) external view returns (bool)',
]);
 
async function approveAllTokens(
  eoaAddress: `0x${string}`,
  proxyWalletAddress: `0x${string}`,
  account: ReturnType<typeof privateKeyToAccount>
) {
  // Setup clients
  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(),
  });
 
  const walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(),
  });
 
  // Initialize Safe Protocol Kit with viem transport
  const safeProtocolKit = await Safe.init({
    provider: walletClient.transport,
    signer: eoaAddress,
    safeAddress: proxyWalletAddress,
  });
 
  // Check current approvals
  const [usdtToCtfAllowance, usdtToExchangeAllowance, ctfToExchangeApproved] = await Promise.all([
    publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [proxyWalletAddress, CTF_TOKEN_ADDRESS],
    }),
    publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [proxyWalletAddress, CTF_EXCHANGE_ADDRESS],
    }),
    publicClient.readContract({
      address: CTF_TOKEN_ADDRESS,
      abi: erc1155Abi,
      functionName: 'isApprovedForAll',
      args: [proxyWalletAddress, CTF_EXCHANGE_ADDRESS],
    }),
  ]);
 
  // Build transactions for missing approvals
  const transactions: MetaTransactionData[] = [];
 
  if (usdtToCtfAllowance === 0n) {
    transactions.push({
      to: USDT_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [CTF_TOKEN_ADDRESS, maxUint256],
      }),
      value: '0',
      operation: OperationType.Call,
    });
  }
 
  if (usdtToExchangeAllowance === 0n) {
    transactions.push({
      to: USDT_ADDRESS,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [CTF_EXCHANGE_ADDRESS, maxUint256],
      }),
      value: '0',
      operation: OperationType.Call,
    });
  }
 
  if (!ctfToExchangeApproved) {
    transactions.push({
      to: CTF_TOKEN_ADDRESS,
      data: encodeFunctionData({
        abi: erc1155Abi,
        functionName: 'setApprovalForAll',
        args: [CTF_EXCHANGE_ADDRESS, true],
      }),
      value: '0',
      operation: OperationType.Call,
    });
  }
 
  // If all approvals are already set, return early
  if (transactions.length === 0) {
    console.log('All approvals already set');
    return;
  }
 
  // Create Safe transaction
  const safeTransaction = await safeProtocolKit.createTransaction({
    transactions,
  });
 
  // Execute the transaction directly using the Safe SDK
  // The SDK will handle signing and execution
  const executeTxResponse = await safeProtocolKit.executeTransaction(safeTransaction);
 
  console.log('Transaction hash:', executeTxResponse.hash);
 
  // Wait for confirmation using viem
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: executeTxResponse.hash as `0x${string}`,
  });
  
  console.log('Token approvals executed:', receipt.transactionHash);
  return receipt;
}
 
// Usage
const account = privateKeyToAccount('0x...' as `0x${string}`);
const eoaAddress = account.address;
const proxyWalletAddress = await computeProxyAddress(eoaAddress);
 
await approveAllTokens(eoaAddress, proxyWalletAddress, account);
Important Notes
Gas Fees: Executing approvals requires BNB for gas fees on BSC.

Max Approval: The example uses maxUint256 for ERC20 approvals, which allows unlimited spending. This is standard practice but be aware of the implications.

ERC1155 Approval: setApprovalForAll approves all token IDs for the operator. This is the standard approach for ERC1155 tokens.

Safe Transactions: Since the proxy wallet is a Gnosis Safe, all transactions must be created and executed through the Safe Protocol Kit using the executeTransaction method.

Idempotent: It's safe to run the approval function multiple times. The example checks existing approvals before creating new transactions.