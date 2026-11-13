# BlockFund — Decentralized Crowdfunding Platform

A blockchain-based, **all-or-nothing** crowdfunding DApp built as a college mini project.
Campaign creators raise funds from contributors through a Solidity smart contract that
enforces every financial rule automatically — no central platform in the middle.

## How it works

1. A creator launches a campaign with a **funding goal** and a **deadline**.
2. Contributors send ETH to the campaign's smart contract; every contribution is recorded on-chain.
3. If the goal is reached before the deadline, the campaign becomes **Successful** and only the creator can withdraw the funds — once.
4. If the deadline expires without reaching the goal, the campaign **fails** and every contributor can claim a **refund** — once.
5. The moment the goal is reached, the campaign closes to further contributions.

## Technology stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.28 |
| Blockchain | Ethereum (local Hardhat network, chainId 31338) |
| Development framework | Hardhat 3 |
| Blockchain library | Ethers.js v6 |
| Wallet | MetaMask |
| Frontend | HTML, CSS, JavaScript |

## Project structure

```
BlockFund/
├── contracts/
│   └── Crowdfunding.sol      # Campaign + funds logic (all state on-chain)
├── scripts/
│   └── deploy.js             # Deploys the contract, writes the address for the frontend
├── test/
│   └── Crowdfunding.js       # Full test suite: creation, funding, refunds, security
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js            # UI logic (dashboard, forms, modal, history)
│       ├── contract.js       # Contract access layer (ABI, address, helpers)
│       └── wallet.js         # MetaMask connect / network switching
├── hardhat.config.js
├── package.json
└── README.md
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Build the contracts

```bash
npm run build
```

### 3. Run the test suite

```bash
npm test
```

Tests cover campaign creation, contributions, automatic goal detection,
withdrawals, refunds, unauthorized actions and double-claim protection.

### 4. Start a local blockchain (terminal 1)

```bash
npm run node
```

This prints ~20 development accounts with their private keys.
Import any of them into MetaMask (Account → Import Account) to act as
different users. The default Hardhat test mnemonic is
`test test test test test test test test test test test junk`.

> **The Hardhat node keeps all state in memory.** Every time you restart it,
> the deployed contract and all campaigns are wiped — always run
> `npm run deploy:local` again after restarting the node.

### 5. Deploy the contract (terminal 2)

```bash
npm run deploy:local
```

The deploy script writes the deployed address to
`frontend/js/contract-address.json`, which the frontend picks up automatically.

### 6. Run the frontend

```bash
npx serve frontend
# or: python -m http.server 8080 --directory frontend
```

Then open the served URL (e.g. http://localhost:3000) in a browser with MetaMask
installed. Connect your wallet — the app will offer to switch to the BlockFund
local network (chainId 31338) automatically.

> MetaMask needs the page served over `http://` — opening `index.html` directly
> from the file system will not work for transactions.

## Demo script (for the project review)

With `npm run node` and `npm run deploy:local` running, this takes ~5 minutes:

1. **Failed campaign + refund:** as a contributor account, create a campaign
   with a high goal (e.g. 1000 ETH) and a short duration (e.g. 2 minutes).
   Contribute 1 ETH from another account. Wait for the deadline to pass —
   the status turns **Failed** — then claim the refund from
   **My Contributions**.
2. **Successful campaign + withdrawal:** as the creator, create a campaign
   with goal 10 ETH, contribute the full 10 ETH from a contributor account —
   the campaign becomes **Successful** and closes to further contributions —
   then **Withdraw Funds** as the creator.
3. Show **History** for the on-chain transaction hashes throughout.

Duration is entered in minutes in the UI and stored as seconds on-chain, so
short demos work without waiting days.

## Smart contract rules enforced on-chain

- Only the **campaign creator** can withdraw successful campaign funds.
- Contributions are rejected **after the deadline** and **after the goal is reached**.
- Refunds are only possible for **expired, unsuccessful** campaigns.
- Contributors can only claim **their own** refund, **once**.
- Withdrawals cannot happen **twice**.
- Direct ETH transfers to the contract are rejected (must use `contribute()`).
- ETH transfers follow the **checks-effects-interactions** pattern and a
  **reentrancy guard**.

## Known limitations

- Blockchain can prove money moved between wallets; it **cannot** verify that a
  creator actually used withdrawn funds for the stated purpose.
- No identity verification of campaign creators.
- Fiat payments, milestone-based fund release and campaign legitimacy
  verification are out of scope for this prototype.
- All campaign data (including description strings) is stored on-chain — simple
  for a mini project, but storage-heavy on a real network.
