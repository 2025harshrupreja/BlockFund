import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Chain ID 31338: deliberately avoids 31337, which is publicly registered
    // by GoChain Testnet and triggers MetaMask's currency-symbol validation.
    hardhat: {
      type: "edr-simulated",
      chainId: 31338,
    },
    // `npm run node` reads this entry (not `hardhat`) for its chain id.
    node: {
      type: "edr-simulated",
      chainId: 31338,
    },
    // `npm run deploy:local` targets this HTTP connection to the running node.
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31338,
    },
  },
});
