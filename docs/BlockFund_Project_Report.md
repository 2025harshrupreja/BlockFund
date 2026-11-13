# LAB / Mini Project Report

| Field | Details |
|---|---|
| **Name of Student** | Harsh Rupreja |
| **Roll Number** | 52 |
| **Assignment Number** | *[fill in]* |
| **Title of Assignment** | BlockFund – A Decentralized Crowdfunding Platform Using Blockchain |
| **DOP** | 12–11–2026 |
| **DOS** | *[fill in]* |
| **CO Mapped** | *[fill in, e.g. CO1, CO2]* |
| **PO Mapped** | PO1, PO2, PO3, PO4, PO7, PO8, PSO1, PSO2 |
| **Faculty Signature** | |
| **Marks** | |

---

## 1. Introduction

Crowdfunding is a method of raising small amounts of money from a large number of
people, usually through an online platform. A person or organization with an idea
creates a fundraising campaign, sets a funding target and a deadline, and
contributors send money if they support the idea. Traditional crowdfunding
platforms such as Kickstarter and Indiegogo manage this process on centralized
servers owned by a single company.

A blockchain is a distributed, append-only ledger that is maintained by many
computers instead of one central authority. Once a transaction is recorded on a
blockchain, it cannot be modified or deleted. A smart contract is a program
stored on the blockchain that automatically executes agreed rules — for example,
releasing funds only when certain conditions are met — without requiring a
trusted intermediary.

**BlockFund** combines these two ideas. It is a decentralized crowdfunding
application in which campaigns, contributions, fund release and refunds are all
managed by a smart contract deployed on an Ethereum-compatible blockchain. The
platform follows an **all-or-nothing funding model**: the campaign creator
receives the collected funds only if the funding target is reached before the
deadline; otherwise, every contributor can reclaim their money.

The objective of this project is to understand how blockchain technology can
improve transparency and trust in crowdfunding, and to implement a working
prototype using Solidity smart contracts.

## 2. Existing Problem

Traditional crowdfunding platforms have several potential limitations:

1. **Lack of transparency** — contributors do not have direct visibility into
   how the collected money is managed; the platform's internal accounting is a
   black box.
2. **Dependence on intermediaries** — a central company controls the funds,
   decides when money is released, and usually charges service fees.
3. **Trust issues** — contributors must trust both the campaign organizer and
   the platform operator, because the rules are enforced by a private system
   they cannot inspect.
4. **Fund misuse** — money may be used for purposes other than those promised
   in the campaign, and the platform has limited control after releasing funds.
5. **Refund complications** — if a campaign fails, contributors may face
   delays, manual processing or platform-dependent policies to get their money
   back.

It should be noted that these are *potential* limitations of centralized
crowdfunding systems in general — not claims that every existing platform
suffers from all of them at all times.

## 3. Solution

The proposed solution is a blockchain-based crowdfunding platform in which the
financial rules are encoded in a smart contract and enforced automatically.
Every contribution is recorded as a transaction on the blockchain, where it can
be publicly verified by anyone.

| Existing problem | Proposed solution |
|---|---|
| Limited transparency | Public blockchain transaction records |
| Dependence on intermediaries | Smart contract-based fund management |
| Trust issues | Predefined and verifiable campaign rules |
| Fund misuse | Conditional fund release (all-or-nothing model) |
| Refund complications | Automated refund mechanism |

### Working of the platform

1. A campaign creator creates a campaign with a **funding goal** and a
   **deadline**.
2. Contributors send cryptocurrency (ETH) to the campaign through the smart
   contract. Every contribution is recorded on-chain.
3. The moment the funding goal is reached, the campaign becomes **successful**
   and closes to further contributions.
4. If the goal is reached before the deadline, the creator can **withdraw** the
   collected funds — once, and only the creator can do this.
5. If the deadline expires without reaching the goal, the campaign **fails**,
   and each contributor can individually **claim a refund** — once.

### Technology stack

| Component | Technology |
|---|---|
| Smart contracts | Solidity 0.8.28 |
| Blockchain | Ethereum-compatible local network (Hardhat) |
| Development framework | Hardhat 3 |
| Blockchain library | Ethers.js v6 |
| Wallet | MetaMask |
| Frontend | HTML, CSS, JavaScript |

All campaign data (title, description, goal, raised amount, deadline, status)
is stored **on-chain** (design decision: Option A), so the prototype requires no
external database and demonstrates blockchain storage directly.

## 4. Process of Implementing the Solution

### 4.1 System architecture

The application has four major components:

- **Frontend** — displays campaigns, accepts forms for campaign creation and
  contributions, shows transaction results.
- **Wallet (MetaMask)** — connects user accounts, signs and authorizes every
  transaction.
- **Smart contract (Crowdfunding.sol)** — the core of the system. Handles
  campaign creation, contribution recording, goal verification, withdrawal and
  refunds.
- **Blockchain (Hardhat local network)** — stores the contract state and the
  transaction history; makes contributions publicly verifiable.

### 4.2 Smart contract design

**Campaign data structure**

| Field | Type | Purpose |
|---|---|---|
| `id` | uint256 | Campaign identifier |
| `creator` | address payable | Campaign owner's wallet |
| `title` | string | Campaign title |
| `description` | string | Campaign description |
| `goal` | uint256 | Required funding (in wei) |
| `raised` | uint256 | Amount collected (in wei) |
| `deadline` | uint256 | Campaign deadline (unix timestamp) |
| `withdrawn` | bool | Whether funds were withdrawn |
| `successful` | bool | Whether the goal was reached |

A nested mapping `contributions[campaignId][contributorAddress]` records how
much each wallet has contributed to each campaign.

**Contract functions**

| Function | Responsibility |
|---|---|
| `createCampaign()` | Create a new campaign |
| `contribute()` | Contribute ETH to a campaign |
| `withdrawFunds()` | Withdraw successful campaign funds |
| `claimRefund()` | Claim funds from failed campaigns |
| `getCampaign()` / `getContribution()` | Read campaign and contribution data |
| `getStatus()` | Human-readable status (Active / Successful / Failed / Withdrawn) |

**Rules enforced by the contract**

- Only the campaign creator can withdraw successful campaign funds.
- Contributions are rejected after the deadline.
- Contributions are rejected once the funding goal is reached.
- Refunds are only possible for expired, unsuccessful campaigns.
- A contributor can claim only their own refund, and only once.
- Withdrawals cannot happen twice.
- Direct ETH transfers to the contract are rejected (must use `contribute()`).

### 4.3 Algorithms

**Create Campaign**

1. Start.
2. Read title, description, goal and duration.
3. Validate: title is non-empty, goal > 0, duration > 0.
4. Increment the campaign counter and set `deadline = current time + duration`.
5. Store the new campaign with `raised = 0`, `successful = false`, `withdrawn = false`.
6. Emit a `CampaignCreated` event.
7. Stop.

**Contribute**

1. Start.
2. Read the campaign and the amount of ETH sent.
3. Validate: amount > 0, current time ≤ deadline, goal not yet reached.
4. Add the amount to `raised` and to the contributor's recorded contribution.
5. If `raised ≥ goal`, mark the campaign as `successful` (closes to further contributions).
6. Emit a `ContributionMade` event.
7. Stop.

**Withdraw Funds**

1. Start.
2. Validate: caller is the campaign creator, campaign is successful, funds not already withdrawn.
3. Mark `withdrawn = true` **before** sending ETH (checks-effects-interactions pattern).
4. Transfer the full raised amount to the creator.
5. Emit a `FundsWithdrawn` event.
6. Stop.

**Claim Refund**

1. Start.
2. Validate: deadline has passed, campaign is not successful, caller has a recorded contribution.
3. Set the contributor's recorded contribution to **zero** before sending ETH (prevents double refunds and reentrancy).
4. Reduce `raised` accordingly and transfer the contribution back to the contributor.
5. Emit a `RefundClaimed` event.
6. Stop.

### 4.4 Security measures

- **Checks-effects-interactions pattern** — all state variables are updated
  before any ETH transfer is made, so a reentrant call observes consistent state.
- **Reentrancy guard** — a lock modifier prevents `withdrawFunds()` and
  `claimRefund()` from being re-entered mid-execution.
- **Zeroing refunds** — a contributor's balance is set to zero before the refund
  transfer, so a double claim always reverts.
- **Rejected direct transfers** — a `receive()` function reverts plain ETH
  transfers, forcing contributions through the validated `contribute()` path.

### 4.5 Implementation phases

| Phase | Work done |
|---|---|
| 1. Environment setup | Node.js, Hardhat 3, Solidity 0.8.28 compiler, local blockchain configuration |
| 2. Smart contract | Campaign structure, creation, contributions, withdrawal, refunds |
| 3. Contract testing | 28 automated tests: creation, contributions, goal detection, withdrawal, refunds, unauthorized and repeated actions |
| 4. Frontend development | Dashboard, campaign details modal, create-campaign form, contribution interface, my-contributions and history views |
| 5. Blockchain integration | MetaMask connection, network verification, Ethers.js contract access layer, transaction feedback |
| 6. Final testing | End-to-end demo: successful campaign with withdrawal, failed campaign with refunds |

### 4.6 Project structure

```
BlockFund/
├── contracts/Crowdfunding.sol     # Campaign + fund logic
├── scripts/deploy.js              # Deployment script
├── test/Crowdfunding.js           # 28 automated tests
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/ (app.js, contract.js, wallet.js)
├── hardhat.config.js
└── README.md
```

### 4.7 Code (key excerpts)

The complete contract is available in the project repository.

```solidity
/// Contribute ETH to a campaign. The campaign closes automatically
/// once the goal is reached.
function contribute(uint256 _id) external payable campaignExists(_id) {
    Campaign storage campaign = campaigns[_id];

    require(msg.value > 0, "Contribution must be greater than zero");
    require(block.timestamp <= campaign.deadline, "Campaign deadline has passed");
    require(campaign.raised < campaign.goal, "Funding goal reached; campaign is closed");

    campaign.raised += msg.value;
    contributions[_id][msg.sender] += msg.value;

    if (campaign.raised >= campaign.goal) {
        campaign.successful = true;
    }

    emit ContributionMade(_id, msg.sender, msg.value, campaign.raised);
}

/// Withdraw the collected funds of a successful campaign.
function withdrawFunds(uint256 _id) external nonReentrant campaignExists(_id) {
    Campaign storage campaign = campaigns[_id];

    require(msg.sender == campaign.creator, "Only the campaign creator can withdraw");
    require(campaign.successful, "Funding goal was not reached");
    require(!campaign.withdrawn, "Funds already withdrawn");

    uint256 amount = campaign.raised;
    campaign.withdrawn = true;               // effects before interactions

    (bool ok, ) = campaign.creator.call{value: amount}("");
    require(ok, "Transfer failed");

    emit FundsWithdrawn(_id, msg.sender, amount);
}

/// Claim a refund from a failed campaign.
function claimRefund(uint256 _id) external nonReentrant campaignExists(_id) {
    Campaign storage campaign = campaigns[_id];

    require(block.timestamp > campaign.deadline, "Campaign is still active");
    require(!campaign.successful, "Campaign succeeded; no refunds");

    uint256 amount = contributions[_id][msg.sender];
    require(amount > 0, "No contribution to refund");

    contributions[_id][msg.sender] = 0;      // effects before interactions
    campaign.raised -= amount;

    (bool ok, ) = payable(msg.sender).call{value: amount}("");
    require(ok, "Refund failed");

    emit RefundClaimed(_id, msg.sender, amount);
}
```

### 4.8 Output

The prototype was demonstrated end-to-end on a local blockchain:

| Demonstration | Expected result | Observed result |
|---|---|---|
| Create campaign (goal 10 ETH) | Campaign listed on dashboard as Active | ✔ |
| Contribute 4 ETH + 6 ETH from two accounts | Goal reached; status becomes Successful | ✔ |
| Further contribution after goal reached | Rejected: "Funding goal reached; campaign is closed" | ✔ |
| Creator withdraws funds | Contract balance → 0; status Withdrawn | ✔ |
| Campaign expires without reaching goal | Status becomes Failed | ✔ |
| Contributor claims refund | Contribution returned; record zeroed | ✔ |
| Second refund attempt by same contributor | Rejected: "No contribution to refund" | ✔ |

*(Screenshots of the dashboard, campaign details modal, MetaMask transaction
popups and the history view are to be attached here.)*

## 5. What Happens After Implementing the Solution

Once implemented, the system behaves as follows:

- Campaign creators can create fundraising campaigns with defined goals and
  deadlines, without registering with any central platform.
- Contributors can browse campaigns, contribute ETH, and see the exact state of
  every campaign (raised amount, goal, deadline, status) on the dashboard.
- Every contribution, withdrawal and refund is recorded as a blockchain
  transaction that anyone can independently verify.
- The smart contract automatically enforces the funding conditions: funds are
  released only to the creator of a successful campaign, and refunds are
  available only from failed campaigns.
- The result is a crowdfunding system with greater transparency and reduced
  dependence on centralized intermediaries — the rules are public code, not
  private policy.

### Known limitations

An important, honest limitation: **blockchain can prove that money was
transferred to a particular wallet, but it cannot prove that the recipient
actually used the money for the stated purpose.** For this prototype, campaign
creators remain responsible for their projects after withdrawing funds.

Other limitations of the current version:

- No real-world identity verification of campaign creators.
- No automatic verification of campaign legitimacy.
- Fiat currency payments are not supported.
- All data is stored on-chain, which is simple but storage-heavy on a real
  network.
- Production-grade security auditing has not been performed.

### Possible future scope

- Hybrid storage: keep large descriptions on IPFS, financial data on-chain.
- Milestone-based fund distribution approved by contributors.
- Multi-signature withdrawal requirements.
- Deployment to a public Ethereum testnet for wider demonstration.

## 6. Conclusion

This project demonstrates how blockchain technology can improve crowdfunding
through decentralization, transparency and smart-contract automation. The
all-or-nothing funding model, automated refunds and conditional withdrawals
reduce the reliance on trust between campaign creators, contributors and
platform operators, because the important financial rules are publicly
verifiable and automatically enforceable.

The implementation — a Solidity smart contract, a 28-test automated test
suite, and a web frontend integrated with MetaMask — shows that a working
decentralized crowdfunding system can be built with a small scope and a clear
architecture. At the same time, the project honestly acknowledges what
blockchain cannot do: it cannot verify the real-world use of withdrawn funds,
and it does not replace due diligence. Understanding both the capabilities and
the limitations of the technology was a central outcome of this work.
