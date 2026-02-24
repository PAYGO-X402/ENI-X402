import { defineChain } from "viem";

export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

export const eniTestnet = defineChain({
  id: 174,
  name: "ENI Testnet",
  nativeCurrency: { name: "EGAS", symbol: "EGAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-testnet.eniac.network"] },
  },
  blockExplorers: {
    default: { name: "ENI Scan", url: "https://scan-testnet.eniac.network" },
  },
  testnet: true,
});

export const eniMainnet = defineChain({
  id: 173,
  name: "ENI Mainnet",
  nativeCurrency: { name: "EGAS", symbol: "EGAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.eniac.network"] },
  },
  blockExplorers: {
    default: { name: "ENI Scan", url: "https://scan.eniac.network" },
  },
});

// ============================================================
// Toggle this single line to switch networks.
// All other files read from this export — no other changes needed.
//
// Options:  hardhatLocal  |  eniTestnet  |  eniMainnet
// ============================================================
export const activeChain = eniTestnet;

export const NETWORK_ID = `eip155:${activeChain.id}` as const;
