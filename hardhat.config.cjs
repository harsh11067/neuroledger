require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ override: true });

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Default Hardhat key

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    og_galileo: {
      url: process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts: [PRIVATE_KEY],
    },
    og_newton: {  // alias for og_galileo
      url: process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts: [PRIVATE_KEY],
    },
    og_mainnet: {
      url: "https://evmrpc.0g.ai",
      chainId: 16661,
      accounts: [PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
