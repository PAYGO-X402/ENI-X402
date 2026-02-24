# Integrating Custom Client/Server with X402 (via Official Facilitator Service)

This guide is for teams that only want to build their own `client` and `server`.  
You do not need to modify this repository and do not need to self-host a facilitator.  
Just integrate with the official facilitator service.

Target outcome (within ~30 minutes):

1. Your `client` requests a protected resource
2. Your `server` responds with `402 Payment Required`
3. The `client` automatically signs an EIP-3009 payment and retries
4. Your `server` verifies/settles through the official facilitator and returns 200

---

## 1. Fixed Integration Baseline

Current baseline (as confirmed):

- Network: `eip155:174` (ENI Testnet)
- PUSD address: `0xB0ef67401b0102E42b7B1c812701a40C4dfAE323`
- Facilitator URL: `https://<official-facilitator-host>`
- Supported payment standard: `EIP-3009`

> Replace `Facilitator URL` with the actual endpoint provided by the official service.

---

## 2. High-Level Architecture

```text
Your Client  --->  Your Server  --->  Official facilitator service  --->  ENI Chain
```

You only need to implement two components:

- A paid `server` with x402 middleware
- An auto-payment `client` using x402 fetch wrapper

---

## 3. Suggested Project Layout

Use two lightweight projects:

```text
my-x402-demo/
  server/
  client/
```

---

## 4. Build Your Server (Minimal Setup)

### 4.1 Initialize

```powershell
mkdir my-x402-demo
cd my-x402-demo
mkdir server
cd server
npm init -y
npm i express dotenv viem @x402/express @x402/core @x402/evm
npm i -D tsx typescript @types/express @types/node
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts"
  }
}
```

### 4.2 Configure Environment Variables

Create `server/.env`:

```env
PORT=4021
NETWORK_ID=eip155:174
RPC_URL=https://rpc-testnet.eniac.network

PUSD_ADDRESS=0xB0ef67401b0102E42b7B1c812701a40C4dfAE323
SERVER_EVM_ADDRESS=0xyour_server_wallet_address
FACILITATOR_URL=https://<official-facilitator-host>
PRICE_USD=0.001

EIP3009_NAME=Test USD Coin
EIP3009_VERSION=1
TOKEN_DECIMALS=18
```

### 4.3 Server Code (`server/src/index.ts`)

```ts
import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { parseUnits } from "viem";

config();

const app = express();
const port = Number(process.env.PORT || 4021);
const network = (process.env.NETWORK_ID || "eip155:174") as `${string}:${string}`;
const pusd = process.env.PUSD_ADDRESS as `0x${string}`;
const payTo = process.env.SERVER_EVM_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL || "https://<official-facilitator-host>";
const tokenDecimals = Number(process.env.TOKEN_DECIMALS || 18);

if (!pusd) throw new Error("PUSD_ADDRESS is required");
if (!payTo) throw new Error("SERVER_EVM_ADDRESS is required");

const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });

const evmScheme = new ExactEvmScheme();
evmScheme.registerMoneyParser(async (amount: number) => {
  const humanAmount = amount.toFixed(tokenDecimals);
  return {
    asset: pusd,
    amount: parseUnits(humanAmount, tokenDecimals).toString(),
    extra: {
      assetTransferMethod: "eip3009",
      name: process.env.EIP3009_NAME || "Test USD Coin",
      version: process.env.EIP3009_VERSION || "1",
      decimals: tokenDecimals,
    },
  };
});

app.use(
  paymentMiddleware(
    {
      "GET /paid-resource": {
        accepts: [
          {
            scheme: "exact",
            network,
            payTo,
            price: `$${process.env.PRICE_USD || "0.001"}`,
          },
        ],
        description: "Paid resource with x402 + EIP-3009 PUSD",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitator).register(network, evmScheme),
  ),
);

app.get("/paid-resource", (_req, res) => {
  res.json({
    ok: true,
    message: "Payment settled, here is your data",
    standard: "EIP-3009",
    ts: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log(`Facilitator: ${facilitatorUrl}`);
  console.log(`PUSD: ${pusd}`);
});
```

### 4.4 Run Server

```powershell
cd server
npm run dev
```

---

## 5. Build Your Client (Minimal Setup)

### 5.1 Initialize

```powershell
cd ..
mkdir client
cd client
npm init -y
npm i dotenv viem @x402/fetch @x402/evm @x402/core
npm i -D tsx typescript @types/node
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts"
  }
}
```

### 5.2 Configure Environment Variables

Create `client/.env`:

```env
CLIENT_PRIVATE_KEY=0xyour_client_private_key
RESOURCE_URL=http://localhost:4021/paid-resource
RPC_URL=https://rpc-testnet.eniac.network
CHAIN_ID=174
```

### 5.3 Client Code (`client/src/index.ts`)

```ts
import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

config();

const privateKey = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
const resourceUrl = process.env.RESOURCE_URL || "http://localhost:4021/paid-resource";
const chainId = Number(process.env.CHAIN_ID || 174);
const rpcUrl = process.env.RPC_URL || "https://rpc-testnet.eniac.network";

if (!privateKey) throw new Error("CLIENT_PRIVATE_KEY is required");

const chain = defineChain({
  id: chainId,
  name: `Chain-${chainId}`,
  nativeCurrency: { name: "EGAS", symbol: "EGAS", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

async function main() {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const signer = toClientEvmSigner(account, publicClient);

  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(resourceUrl);
  const body = await response.json();

  console.log("status =", response.status);
  console.log("body =", body);

  if (response.ok) {
    const payment = new x402HTTPClient(client).getPaymentSettleResponse((h) => response.headers.get(h));
    console.log("settlement =", payment);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### 5.4 Run Client

```powershell
cd client
npm run dev
```

---

## 6. Integration Order (Required)

1. Confirm official facilitator service is reachable (at least `/supported`)
2. Start your custom `server`
3. Start your custom `client`

---

## 7. Success Criteria

Integration is successful when:

- `client` prints `status = 200`
- `body.standard = "EIP-3009"` (or your own response fields)
- `server` logs show no errors
- Official facilitator logs include `/verify` and `/settle` calls (if accessible)

---

## 8. Calling `/verify` and `/settle` Directly (Optional)

In normal usage, do not call these endpoints manually.  
`@x402/express` handles this flow automatically.

Direct calls are only needed if you build a custom gateway or custom middleware.

Core payload constraints:

- `paymentRequirements.network` must match `paymentPayload.accepted.network`
- `payTo` must equal the server receiver address
- `authorization.to` must equal `payTo`
- `authorization.value` must be greater than or equal to `amount`
- `extra.assetTransferMethod` must be `eip3009`

---

## 9. Common Issues

- Always returns 402 instead of 200  
  Usually caused by wrong PUSD address, insufficient client balance, or unreachable `FACILITATOR_URL`
- `transaction_failed`  
  Settlement failed on-chain (for example: insufficient gas, mismatched payload, expired authorization)
- `invalid_exact_evm_payload_*`  
  `authorization.to/value/validBefore/validAfter/nonce/signature` is invalid or inconsistent with payment requirements

---

## 10. Pre-Production Recommendations

- Start with a very small price (for example `$0.001`) for canary rollout
- Monitor `/verify` and `/settle` failure rates
- Add `x-request-id` per request on the server for tracing and debugging
