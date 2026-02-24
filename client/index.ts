import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { NETWORK_ID, activeChain } from "../config/chains.js";

config();

const evmPrivateKey = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
if (!evmPrivateKey) {
  console.error("CLIENT_PRIVATE_KEY is required");
  process.exit(1);
}

const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.RESOURCE_PATH || "/secret-data";
const url = `${baseURL}${endpointPath}`;

async function main() {
  const account = privateKeyToAccount(evmPrivateKey);
  const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(),
  });
  const evmSigner = toClientEvmSigner(account, publicClient);

  console.log(`Client wallet: ${account.address}`);
  console.log(`Chain: ${activeChain.name} (${NETWORK_ID})`);
  console.log(`Target: ${url}\n`);

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(evmSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log("Making request (will auto-handle 402 payment)...\n");
  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();
  console.log("Response status:", response.status);
  console.log("Response body:", JSON.stringify(body, null, 2));

  if (response.ok) {
    const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
      (name) => response.headers.get(name),
    );
    console.log("\nPayment settlement:", JSON.stringify(paymentResponse, null, 2));
  } else {
    console.log(`\nNo payment settled (status: ${response.status})`);
  }
}

main().catch((error) => {
  console.error("Client error:", error?.response?.data?.error ?? error);
  process.exit(1);
});
