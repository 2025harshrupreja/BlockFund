import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

const block = await provider.getBlockNumber();
console.log("current block:", block);

const deployer = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const nonce = await provider.getTransactionCount(deployer);
console.log("deployer (0xf39f...) tx count (nonce):", nonce);

// scan all blocks for any contract creations or transactions
for (let b = 1; b <= block; b++) {
  const blk = await provider.getBlock(b, true);
  if (blk && blk.transactions && blk.transactions.length > 0) {
    console.log(`block ${b}: ${blk.transactions.length} tx(s)`);
    for (const tx of blk.transactions) {
      console.log("   ", tx.hash, "to:", tx.to ?? "(contract creation)");
    }
  }
}
if (block === 0) console.log("chain has NO blocks yet - completely fresh state");
