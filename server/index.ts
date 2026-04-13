import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { AssetAmount } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createPublicClient, http } from "viem";
import { NETWORK_ID, activeChain } from "../config/chains.js";
import {
  type DecimalString,
  decimalToUnitAmount,
  parseDecimalString,
} from "../config/decimal.js";
import { tokenConfig } from "../config/tokens.js";

config();

const evmAddress = process.env.SERVER_EVM_ADDRESS as `0x${string}`;
if (!evmAddress) {
  console.error("SERVER_EVM_ADDRESS is required");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL || "http://localhost:4022";
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const PORT = process.env.SERVER_PORT || 4021;
const app = express();
const TOKEN_METADATA_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "eip712Domain",
    outputs: [
      { name: "fields", type: "bytes1" },
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "extensions", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

type TokenMetadata = {
  decimals: number;
  eip3009DomainName: string;
  eip3009DomainVersion: string;
};

async function readTokenMetadata(): Promise<TokenMetadata> {
  const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(),
  });

  const decimals = await publicClient.readContract({
    address: tokenConfig.pusd,
    abi: TOKEN_METADATA_ABI,
    functionName: "decimals",
  });

  const [, name, version] = await publicClient.readContract({
    address: tokenConfig.pusd,
    abi: TOKEN_METADATA_ABI,
    functionName: "eip712Domain",
  });

  return {
    decimals: Number(decimals),
    eip3009DomainName: name,
    eip3009DomainVersion: version,
  };
}

function createPriceAssetAmount(
  price: DecimalString,
  metadata: TokenMetadata,
): AssetAmount {
  return {
    amount: decimalToUnitAmount(price, metadata.decimals),
    asset: tokenConfig.pusd,
    extra: {
      assetTransferMethod: "eip3009",
      name: metadata.eip3009DomainName,
      version: metadata.eip3009DomainVersion,
      decimals: metadata.decimals,
    },
  };
}

async function main() {
  const metadata = await readTokenMetadata();
  const resourcePrice = parseDecimalString(
    process.env.PRICE_USD || "0.001",
    "PRICE_USD",
  );
  const priceAssetAmount = createPriceAssetAmount(resourcePrice, metadata);
  const eip3009Scheme = new ExactEvmScheme();

  app.use(
    paymentMiddleware(
      {
        "GET /secret-data": {
          accepts: [
            {
              scheme: "exact",
              price: priceAssetAmount,
              network: NETWORK_ID,
              payTo: evmAddress,
            },
          ],
          description: "Premium secret data on ENI chain (EIP-3009)",
          mimeType: "application/json",
        },
      },
      new x402ResourceServer(facilitatorClient).register(
        NETWORK_ID,
        eip3009Scheme,
      ),
    ),
  );

  app.get("/secret-data", (_req, res) => {
    res.json({
      secret: "X402 on ENI is live!",
      chain: activeChain.name,
      network: NETWORK_ID,
      paymentMethod: "eip3009",
      timestamp: new Date().toISOString(),
      priceUsd: resourcePrice,
      eip3009DomainName: metadata.eip3009DomainName,
      eip3009DomainVersion: metadata.eip3009DomainVersion,
      decimals: metadata.decimals,
    });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "X402 ENI Resource Server",
      chain: activeChain.name,
      network: NETWORK_ID,
      endpoints: {
        "/secret-data": `GET - $${resourcePrice} per request (x402 + EIP-3009)`,
      },
    });
  });

  app.listen(Number(PORT), () => {
    console.log(`Resource server listening on http://localhost:${PORT}`);
    console.log(`Chain: ${activeChain.name} (${NETWORK_ID})`);
    console.log(`Pay-to address: ${evmAddress}`);
    console.log(`Facilitator: ${facilitatorUrl}`);
    console.log(`Price (USD decimal): ${resourcePrice}`);
    console.log(
      `Token metadata from chain: decimals=${metadata.decimals}, eip3009 name="${metadata.eip3009DomainName}", version="${metadata.eip3009DomainVersion}"`,
    );
  });
}

main().catch((error) => {
  console.error("Failed to start resource server:", error);
  process.exit(1);
});
