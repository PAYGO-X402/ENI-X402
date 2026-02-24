import { NETWORK_ID } from "./chains.js";

interface TokenConfig {
  pusd: `0x${string}`;
}

const CONFIG: Record<string, TokenConfig> = {
  // Hardhat Local — auto-populated by e2e test script
  "eip155:31337": {
    pusd: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
  // ENI Testnet — fill in after running: npm run deploy:pusc
  "eip155:174": {
    pusd: "0x7036dcb6944e6298a9911E4894cB315D369Ca146",
  },
  // ENI Mainnet — fill in after deploying to mainnet
  "eip155:173": {
    pusd: "0x0000000000000000000000000000000000000000",
  },
};

export const tokenConfig = CONFIG[NETWORK_ID];

if (!tokenConfig) {
  throw new Error(`No token configuration found for network ${NETWORK_ID}`);
}
