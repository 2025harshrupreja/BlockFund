import { ethers } from "ethers";
import fs from "node:fs";

// ABI exactly as the frontend defines it
const src = fs.readFileSync("frontend/js/contract.js", "utf8");
const m = src.match(/const CONTRACT_ABI = \[([\s\S]*?)\];/);
const entries = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const iface = new ethers.Interface(entries);

// ABI of the deployed artifact
const artifact = JSON.parse(fs.readFileSync("artifacts/contracts/Crowdfunding.sol/Crowdfunding.json", "utf8"));
const contractSelectors = new Set(
  artifact.abi
    .filter((a) => a.type === "function")
    .map((a) => ethers.id(`${a.name}(${a.inputs.map((i) => i.type).join(",")})`).slice(0, 10))
);

console.log("--- frontend functions vs deployed contract ---");
for (const f of iface.fragments.filter((f) => f.type === "function")) {
  const sig = f.format("sighash");
  const sel = ethers.id(sig).slice(0, 10);
  console.log(sel, sig, contractSelectors.has(sel) ? "OK" : "*** NOT IN CONTRACT ***");
}

console.log("--- live eth_call for each read function ---");
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const info = JSON.parse(fs.readFileSync("frontend/js/contract-address.json", "utf8"));
const cf = new ethers.Contract(info.address, iface, provider);
const signer = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const checks = [
  ["campaignCount", []],
  ["campaigns", [0]],
  ["getContribution", [0, signer]],
  ["getStatus", [0]],
];
for (const [name, args] of checks) {
  try {
    const res = await cf[name](...args);
    console.log(`${name}(${args.join(",")}) ->`, Array.isArray(res) ? `tuple[${res.length}]` : res.toString());
  } catch (e) {
    console.log(`${name}(${args.join(",")}) FAILED:`, (e.shortMessage || e.message).slice(0, 100));
  }
}
