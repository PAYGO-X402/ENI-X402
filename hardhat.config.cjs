require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const DEPLOYER_KEY = process.env.FACILITATOR_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
      {
        version: "0.8.30",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
  paths: {
    sources: "./contracts/src",
    tests: "./contracts/test",
    cache: "./contracts/cache",
    artifacts: "./contracts/artifacts",
  },
  networks: {
    eniTestnet: {
      url: "https://rpc-testnet.eniac.network",
      chainId: 174,
      accounts: [DEPLOYER_KEY],
    },
    eniMainnet: {
      url: "https://rpc.eniac.network",
      chainId: 173,
      accounts: [DEPLOYER_KEY],
    },
  },
};
