import { ethers } from "ethers";
import fs from "node:fs";

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const net = await provider.getNetwork();
console.log("chainId:", net.chainId.toString());

const info = JSON.parse(fs.readFileSync("frontend/js/contract-address.json", "utf8"));
console.log("frontend address file:", info.address);

const code = await provider.getCode(info.address);
console.log("contract code present:", code.length > 2, `(${code.length} chars)`);

const cf = new ethers.Contract(
  info.address,
  [
    "function campaignCount() view returns (uint256)",
    "function campaigns(uint256) view returns (uint256 id, address creator, string title, string description, uint256 goal, uint256 raised, uint256 deadline, bool withdrawn, bool successful)",
    "event CampaignCreated(uint256 indexed id, address indexed creator, string title, uint256 goal, uint256 deadline)",
  ],
  provider
);

const count = await cf.campaignCount();
console.log("campaignCount on-chain:", count.toString());

const block = await provider.getBlockNumber();
console.log("current block:", block);

const logs = await cf.queryFilter(cf.filters.CampaignCreated, 0, block);
for (const l of logs) {
  console.log(`Campaign #${l.args.id} "${l.args.title}" by ${l.args.creator} (block ${l.blockNumber}, tx ${l.transactionHash})`);
}
