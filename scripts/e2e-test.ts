/**
 * End-to-end test on Hardhat local network.
 *
 * Steps:
 *   1. Deploy PUSC to local Hardhat node
 *   2. Patch config/tokens.ts with deployed addresses
 *   3. Mint PUSC to client wallet
 *   4. Start Facilitator (port 4022)
 *   5. Start Resource Server (port 4021)
 *   6. Run Client — expect 402 -> pay -> 200 flow
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  getAddress,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhatLocal } from "../config/chains.js";
import { spawn, ChildProcess } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Hardhat default accounts (account #0 = facilitator, #1 = server/seller, #2 = client/buyer)
const HARDHAT_ACCOUNTS = {
  facilitator: {
    key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
  },
  server: {
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`,
  },
  client: {
    key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as `0x${string}`,
  },
};

const ERC20_ABI = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnService(name: string, cmd: string, args: string[], env: Record<string, string>): ChildProcess {
  const child = spawn(cmd, args, {
    cwd: resolve(import.meta.dirname!, ".."),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  child.stdout?.on("data", (d) => console.log(`[${name}] ${d.toString().trim()}`));
  child.stderr?.on("data", (d) => console.error(`[${name}:err] ${d.toString().trim()}`));
  return child;
}

async function waitForPort(port: number, timeout = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://127.0.0.1:${port}`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok || res.status === 404 || res.status === 402) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Port ${port} did not become available within ${timeout}ms`);
}

async function deployContracts(): Promise<{ pusd: `0x${string}` }> {
  console.log("\n=== Deploying contracts to Hardhat local node ===\n");

  const account = privateKeyToAccount(HARDHAT_ACCOUNTS.facilitator.key);
  const walletClient = createWalletClient({
    account,
    chain: hardhatLocal,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: hardhatLocal,
    transport: http(),
  });

  const artifactsDir = resolve(import.meta.dirname!, "../contracts/artifacts/contracts/src");

  function loadArtifact(name: string) {
    const raw = readFileSync(resolve(artifactsDir, `${name}.sol/${name}.json`), "utf-8");
    return JSON.parse(raw);
  }

  // Deploy PUSC implementation + proxy (token address = proxy)
  const puscArtifact = loadArtifact("PUSC");
  const puscImplHash = await walletClient.deployContract({
    abi: puscArtifact.abi,
    bytecode: puscArtifact.bytecode as `0x${string}`,
  });
  const puscImplReceipt = await publicClient.waitForTransactionReceipt({ hash: puscImplHash });
  const puscImplAddr = getAddress(puscImplReceipt.contractAddress!);
  console.log(`PUSC implementation:   ${puscImplAddr}`);

  const puscProxyArtifact = loadArtifact("PUSCProxy");
  const operators = [account.address];
  const initData = encodeFunctionData({
    abi: puscArtifact.abi,
    functionName: "initialize",
    args: [operators],
  });
  const puscProxyHash = await walletClient.deployContract({
    abi: puscProxyArtifact.abi,
    bytecode: puscProxyArtifact.bytecode as `0x${string}`,
    args: [puscImplAddr, initData],
  });
  const puscProxyReceipt = await publicClient.waitForTransactionReceipt({ hash: puscProxyHash });
  const pusdAddr = getAddress(puscProxyReceipt.contractAddress!);
  console.log(`PUSC proxy (token):    ${pusdAddr}`);

  return { pusd: pusdAddr };
}

function patchTokensConfig(addrs: { pusd: string }) {
  const tokensPath = resolve(import.meta.dirname!, "../config/tokens.ts");
  let content = readFileSync(tokensPath, "utf-8");

  // Replace the hardhat local entry
  content = content.replace(
    /"eip155:31337": \{[^}]+\}/s,
    `"eip155:31337": {\n    pusd: "${addrs.pusd}",\n  }`,
  );

  writeFileSync(tokensPath, content, "utf-8");
  console.log("\nconfig/tokens.ts patched with deployed addresses");
}

async function setupClientAccount(addrs: { pusd: `0x${string}` }) {
  console.log("\n=== Setting up client account ===\n");

  const minterAccount = privateKeyToAccount(HARDHAT_ACCOUNTS.facilitator.key);
  const clientAccount = privateKeyToAccount(HARDHAT_ACCOUNTS.client.key);
  const minterWalletClient = createWalletClient({
    account: minterAccount,
    chain: hardhatLocal,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: hardhatLocal,
    transport: http(),
  });

  const tokenDecimals = Number(
    await publicClient.readContract({
      address: addrs.pusd,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  );
  const MINT_AMOUNT = parseUnits("1000", tokenDecimals);

  // Mint from owner/operator account for PUSC permission model.
  const mintHash = await minterWalletClient.writeContract({
    address: addrs.pusd,
    abi: ERC20_ABI,
    functionName: "mint",
    args: [clientAccount.address, MINT_AMOUNT],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const balance = await publicClient.readContract({
    address: addrs.pusd,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [clientAccount.address],
  });
  console.log(`Minter ${minterAccount.address}`);
  console.log(`Client ${clientAccount.address}`);
  console.log(`Balance: ${formatUnits(balance, tokenDecimals)} PUSC`);
}

async function main() {
  const children: ChildProcess[] = [];

  try {
    // Step 1: Deploy
    const addrs = await deployContracts();

    // Step 2: Patch config
    patchTokensConfig(addrs);

    // Step 3: Setup client account
    await setupClientAccount({ pusd: addrs.pusd });

    const serverAddr = privateKeyToAccount(HARDHAT_ACCOUNTS.server.key).address;

    // Step 4: Start Facilitator
    console.log("\n=== Starting Facilitator ===\n");
    const facilitator = spawnService("facilitator", "npx", ["tsx", "facilitator/index.ts"], {
      FACILITATOR_PRIVATE_KEY: HARDHAT_ACCOUNTS.facilitator.key,
    });
    children.push(facilitator);
    await waitForPort(4022);
    console.log("[e2e] Facilitator is ready on :4022");

    // Step 5: Start Server
    console.log("\n=== Starting Resource Server ===\n");
    const server = spawnService("server", "npx", ["tsx", "server/index.ts"], {
      SERVER_EVM_ADDRESS: serverAddr,
      FACILITATOR_URL: "http://localhost:4022",
    });
    children.push(server);
    await waitForPort(4021);
    console.log("[e2e] Resource Server is ready on :4021");

    // Step 6: Run Client
    console.log("\n=== Running Client ===\n");
    const clientChild = spawnService("client", "npx", ["tsx", "client/index.ts"], {
      CLIENT_PRIVATE_KEY: HARDHAT_ACCOUNTS.client.key,
      RESOURCE_SERVER_URL: "http://localhost:4021",
    });
    children.push(clientChild);

    await new Promise<void>((resolve, reject) => {
      clientChild.on("exit", (code) => {
        if (code === 0) {
          console.log("\n=== E2E TEST PASSED ===");
          resolve();
        } else {
          reject(new Error(`Client exited with code ${code}`));
        }
      });
      setTimeout(() => reject(new Error("Client timed out after 60s")), 60000);
    });
  } catch (err) {
    console.error("\n=== E2E TEST FAILED ===");
    console.error(err);
    process.exitCode = 1;
  } finally {
    for (const child of children) {
      child.kill("SIGTERM");
    }
    await sleep(1000);
    process.exit(process.exitCode ?? 0);
  }
}

main();
