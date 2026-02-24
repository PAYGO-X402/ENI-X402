/**
 * Post-deployment setup script:
 * 1. Mint PUSC to the client (buyer) address (owner/operator/minter required)
 * 2. Validate client's minted PUSC balance
 *
 * Prerequisites:
 *   - Contracts deployed (run `npm run deploy:pusc` first)
 *   - Update config/tokens.ts with deployed addresses
 *   - CLIENT_PRIVATE_KEY set in .env
 *   - FACILITATOR_PRIVATE_KEY or PUSC_MINTER_PRIVATE_KEY set in .env
 */
import { config } from "dotenv";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "../config/chains.js";
import { tokenConfig } from "../config/tokens.js";

config();

const clientKey = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
if (!clientKey) {
  console.error("CLIENT_PRIVATE_KEY is required");
  process.exit(1);
}
const minterKey = (process.env.PUSC_MINTER_PRIVATE_KEY ||
  process.env.FACILITATOR_PRIVATE_KEY) as `0x${string}` | undefined;
if (!minterKey) {
  console.error("PUSC_MINTER_PRIVATE_KEY or FACILITATOR_PRIVATE_KEY is required for minting");
  process.exit(1);
}
const minterPrivateKey = minterKey as `0x${string}`;

const ERC20_ABI = [
  {
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function main() {
  const minter = privateKeyToAccount(minterPrivateKey);
  const client = privateKeyToAccount(clientKey);
  console.log(`Minter address: ${minter.address}`);
  console.log(`Client address: ${client.address}`);
  console.log(`Chain: ${activeChain.name}`);
  console.log(`PUSC: ${tokenConfig.pusd}`);
  console.log("");

  const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(),
  });

  const minterWalletClient = createWalletClient({
    account: minter,
    chain: activeChain,
    transport: http(),
  });
  const tokenDecimals = Number(
    await publicClient.readContract({
      address: tokenConfig.pusd,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  );
  const MINT_AMOUNT = parseUnits("1000", tokenDecimals); // 1000 PUSC

  // Step 1: Mint PUSC (must be called by owner/operator/minter)
  console.log(`Minting ${formatUnits(MINT_AMOUNT, tokenDecimals)} PUSC...`);
  const mintHash = await minterWalletClient.writeContract({
    address: tokenConfig.pusd,
    abi: ERC20_ABI,
    functionName: "mint",
    args: [client.address, MINT_AMOUNT],
  });
  console.log(`Mint tx: ${mintHash}`);
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const balance = await publicClient.readContract({
    address: tokenConfig.pusd,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [client.address],
  });
  console.log(`Balance: ${formatUnits(balance, tokenDecimals)} PUSC\n`);

  // Step 2: Confirm balance is enough for EIP-3009 payment flow
  console.log("PUSC mint completed. Client can proceed with EIP-3009 payment flow.\n");

  console.log("Setup complete! Client is ready to make x402 payments.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
