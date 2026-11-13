import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardhat 3: ethers is exposed on the network connection.
const connection = await network.getOrCreate();
const { ethers } = connection;

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Network:", connection.networkName);
  console.log("Deployer:", deployer.address);

  const contract = await ethers.deployContract("Crowdfunding");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nCrowdfunding deployed to:", address);

  // Write the deployed address where the frontend can find it.
  const frontendDir = path.join(__dirname, "..", "frontend", "js");
  const outFile = path.join(frontendDir, "contract-address.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: connection.networkName,
        address: address,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Frontend address written to:", outFile);

  console.log(
    "\nNext steps:\n" +
      "1. Open MetaMask and add the 'BlockFund Local' network (RPC http://127.0.0.1:8545, chainId 31338).\n" +
      "2. Import a development account (private keys are printed by `npm run node`).\n" +
      "3. Serve the frontend with any static file server, e.g. `npx serve frontend`."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
