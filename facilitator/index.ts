import { config } from "dotenv";
import express from "express";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { x402Facilitator } from "@x402/core/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { activeChain, NETWORK_ID } from "../config/chains.js";

config();

const PORT = process.env.FACILITATOR_PORT || "4022";
const privateKey = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;

if (!privateKey) {
  console.error("FACILITATOR_PRIVATE_KEY is required");
  process.exit(1);
}

const evmAccount = privateKeyToAccount(privateKey);
console.log(`Facilitator account: ${evmAccount.address}`);
console.log(`Network: ${NETWORK_ID} (${activeChain.name})`);

const viemClient = createWalletClient({
  account: evmAccount,
  chain: activeChain,
  transport: http(),
}).extend(publicActions);

const evmSigner = toFacilitatorEvmSigner({
  address: evmAccount.address,
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) =>
    viemClient.readContract({
      ...args,
      args: args.args || [],
    }),
  verifyTypedData: (args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => viemClient.verifyTypedData(args as any),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) =>
    viemClient.writeContract({
      ...args,
      args: args.args || [],
    }).catch((error) => {
      console.log("[facilitator-debug] writeContract failed", {
        address: args.address,
        functionName: args.functionName,
        args: args.args,
        error,
      });
      throw error;
    }),
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
    viemClient.sendTransaction(args),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
});

const facilitator = new x402Facilitator()
  .onBeforeVerify(async (ctx) => {
    console.log("[verify:before]", ctx);
  })
  .onAfterVerify(async (ctx) => {
    console.log("[verify:after]", ctx);
  })
  .onVerifyFailure(async (ctx) => {
    console.log("[verify:fail]", ctx);
  })
  .onBeforeSettle(async (ctx) => {
    console.log("[settle:before]", ctx);
  })
  .onAfterSettle(async (ctx) => {
    console.log("[settle:after]", ctx);
  })
  .onSettleFailure(async (ctx) => {
    console.log("[settle:fail]", ctx);
  });

facilitator.register(NETWORK_ID, new ExactEvmScheme(evmSigner));

const app = express();
app.use(express.json());

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
    }
    const response: SettleResponse = await facilitator.settle(
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements,
    );
    res.json(response);
  } catch (error) {
    console.error("Settle error:", error);
    if (error instanceof Error && error.message.includes("Settlement aborted:")) {
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.network || "unknown",
      } as SettleResponse);
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/supported", async (_req, res) => {
  try {
    const response = facilitator.getSupported();
    res.json(response);
  } catch (error) {
    console.error("Supported error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.listen(parseInt(PORT), () => {
  console.log(`Facilitator listening on http://localhost:${PORT}`);
  console.log(`Registered networks: [${NETWORK_ID}]`);
});
