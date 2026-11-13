/* ============================================================
   BlockFund — application logic
   ============================================================ */

/* ---------- Toast ---------- */

const Toast = {
  _timer: null,
  show(message, isError = false) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.remove("hidden");
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.add("hidden"), 4500);
  },
  error(message) {
    this.show(message, true);
  },
};

/* ---------- Helpers ---------- */

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function $(id) { return document.getElementById(id); }

/** Human-friendly deadline text: "3d 4h left" / "expired 2d ago". */
function deadlineText(unixSeconds) {
  const diff = (unixSeconds * 1000) - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const span = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return diff > 0 ? `${span} left` : `expired ${span} ago`;
}

function formatDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleString();
}

/* ---------- Application ---------- */

const App = {
  campaigns: [], // cache of on-chain campaigns
  openCampaignId: null,

  async init() {
    this._bindNav();
    this._bindWallet();
    this._bindForms();
    this._bindModal();

    const contractReady = await Contract.init();
    if (!contractReady) {
      Toast.error("Contract not found. Run `npm run deploy:local` first, then refresh.");
    }

    // Auto-reconnect if the wallet was connected previously.
    if (Wallet.hasProvider()) {
      const accounts = await window.ethereum
        .request({ method: "eth_accounts" })
        .catch(() => []);
      if (accounts && accounts.length > 0) {
        Wallet.account = accounts[0];
        Wallet.chainId = await window.ethereum.request({ method: "eth_chainId" }).catch(() => null);
        Wallet._listen();
      }
    }

    await this.refreshAll();
    setInterval(() => this.refreshAll().catch(() => {}), 15000);
  },

  /* ----- data loading ----- */

  async refreshAll() {
    // Refresh the wallet's live chain state on every refresh.
    if (Wallet.hasProvider()) {
      Wallet.chainId = await window.ethereum
        .request({ method: "eth_chainId" })
        .catch(() => null);
    }

    if (!Contract.read) {
      Toast.error("Contract not found. Run `npm run deploy:local` first, then refresh.");
      return;
    }

    // The contract only exists on chain 31338. Reads on any other chain
    // return empty data (ethers BAD_DATA), so gate them here instead.
    if (Wallet.chainId !== null && Number(Wallet.chainId) !== Wallet.HARDHAT_CHAIN_ID) {
      this._renderWrongNetwork();
      this._updateWalletUI();
      return;
    }

    try {
      await this.loadCampaigns();
      if (Wallet.connected) {
        await this.renderContributions();
        await this.renderHistory();
      }
    } catch (err) {
      // e.g. BAD_DATA — the contract isn't deployed on the chain MetaMask is using
      console.error("Chain read failed:", err);
      if (err && (err.code === "BAD_DATA" || err.code === "CALL_EXCEPTION")) {
        // Chain is correct but nothing answers at the contract address —
        // usually the Hardhat node was restarted without redeploying.
        this._renderMissingContract();
      } else {
        this._renderWrongNetwork();
      }
    }
    this._updateWalletUI();
  },

  _renderMissingContract() {
    this.campaigns = [];
    this.closeCampaign();

    const grid = $("campaignGrid");
    grid.innerHTML = "";
    hide($("dashboardEmpty"));

    const card = document.createElement("div");
    card.className = "card campaign-card";
    card.innerHTML = `
      <h3>⚠ Contract not found on this chain</h3>
      <p class="desc">
        The wallet is on the correct network (chain ${Wallet.HARDHAT_CHAIN_ID}), but no
        contract exists at <strong>${Contract.address}</strong>. The Hardhat node keeps all
        state <em>in memory</em> — restarting it wipes every campaign.
      </p>
      <p class="desc">
        Run <strong>npm run deploy:local</strong>, then refresh this page.
      </p>`;
    grid.appendChild(card);

    $("contributionList").innerHTML = "";
    show($("contributionsEmpty"));
    $("historyList").innerHTML = "";
    show($("historyEmpty"));
  },

  _renderWrongNetwork() {
    this.campaigns = [];
    this.closeCampaign();

    const grid = $("campaignGrid");
    grid.innerHTML = "";
    hide($("dashboardEmpty"));

    const card = document.createElement("div");
    card.className = "card campaign-card";
    const current = Wallet.chainId ? Number(Wallet.chainId) : "unknown";
    card.innerHTML = `
      <h3>⚠ Wallet on a different network</h3>
      <p class="desc">
        MetaMask is currently on chain <strong>${current}</strong>, but the BlockFund
        contract is deployed on <strong>BlockFund Local (Hardhat), chain ${Wallet.HARDHAT_CHAIN_ID}</strong>.
        Reads on this network return nothing.
      </p>
      <p class="desc">
        Click <strong>Connect Wallet</strong> to switch automatically, or select
        "BlockFund Local (Hardhat)" in MetaMask's network dropdown.
      </p>`;
    grid.appendChild(card);

    $("contributionList").innerHTML = "";
    show($("contributionsEmpty"));
    $("historyList").innerHTML = "";
    show($("historyEmpty"));
  },

  async loadCampaigns() {
    if (!Contract.read) return;
    const count = Number(await Contract.read.campaignCount());

    this.campaigns = [];
    for (let id = 1; id <= count; id++) {
      const c = await Contract.read.campaigns(id);
      this.campaigns.push({
        id: Number(c.id),
        creator: c.creator,
        title: c.title,
        description: c.description,
        goal: c.goal,
        raised: c.raised,
        deadline: Number(c.deadline),
        withdrawn: c.withdrawn,
        successful: c.successful,
      });
    }
    this.renderDashboard();

    if (this.openCampaignId !== null) {
      const stillExists = this.campaigns.some((c) => c.id === this.openCampaignId);
      if (stillExists) this.openCampaign(this.openCampaignId, false);
      else this.closeCampaign();
    }
  },

  /** Client-side status matching the contract's getStatus(). */
  statusOf(c) {
    if (c.withdrawn) return "Withdrawn";
    if (c.successful) return "Successful";
    return Date.now() / 1000 > c.deadline ? "Failed" : "Active";
  },

  /* ----- rendering ----- */

  renderDashboard() {
    const grid = $("campaignGrid");
    grid.innerHTML = "";

    if (this.campaigns.length === 0) {
      show($("dashboardEmpty"));
    } else {
      hide($("dashboardEmpty"));
    }

    for (const c of this.campaigns) {
      const status = this.statusOf(c);
      const pct = Math.min(100, Number((c.raised * 100n) / c.goal));
      const card = document.createElement("div");
      card.className = "card campaign-card";
      card.innerHTML = `
        <h3>${this._escape(c.title)}</h3>
        <p class="desc">${this._escape(c.description || "No description provided.")}</p>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill ${pct >= 100 ? "full" : ""}" style="width:${pct}%"></div></div>
          <div class="progress-text">
            <span>${Contract.formatEth(c.raised)} / ${Contract.formatEth(c.goal)} ETH</span>
            <span>${pct}%</span>
          </div>
        </div>
        <div class="campaign-meta">
          <span class="status status-${status}">${status}</span>
          <span>${deadlineText(c.deadline)}</span>
        </div>`;
      card.addEventListener("click", () => this.openCampaign(c.id, true));
      grid.appendChild(card);
    }
  },

  async renderContributions() {
    const list = $("contributionList");
    list.innerHTML = "";
    let any = false;

    if (Contract.read && Wallet.connected) {
      for (const c of this.campaigns) {
        const amount = await Contract.read.getContribution(c.id, Wallet.account);
        if (amount === 0n) continue;
        any = true;

        const status = this.statusOf(c);
        const canRefund = status === "Failed" && amount > 0n;
        const card = document.createElement("div");
        card.className = "card campaign-card";
        card.innerHTML = `
          <h3>${this._escape(c.title)}</h3>
          <div class="campaign-meta" style="margin-bottom:10px">
            <span class="status status-${status}">${status}</span>
            <span>${deadlineText(c.deadline)}</span>
          </div>
          <div class="campaign-meta">
            <span>You contributed: <strong>${Contract.formatEth(amount)} ETH</strong></span>
          </div>`;
        if (canRefund) {
          const btn = document.createElement("button");
          btn.className = "btn btn-danger";
          btn.style.marginTop = "12px";
          btn.textContent = "Claim Refund";
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._doRefund(c.id);
          });
          card.appendChild(btn);
        }
        card.addEventListener("click", () => this.openCampaign(c.id, true));
        list.appendChild(card);
      }
    }

    if (any) hide($("contributionsEmpty")); else show($("contributionsEmpty"));
  },

  async renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";
    let any = false;

    if (Contract.read && Wallet.connected) {
      const cf = Contract.read;
      const [contribs, refunds, withdrawals] = await Promise.all([
        cf.queryFilter(cf.filters.ContributionMade(null, Wallet.account)),
        cf.queryFilter(cf.filters.RefundClaimed(null, Wallet.account)),
        cf.queryFilter(cf.filters.FundsWithdrawn(Wallet.account)),
      ]);

      const rows = [];
      for (const ev of contribs) {
        rows.push({
          type: "Contribution",
          cls: "contribution",
          id: Number(ev.args.id),
          amount: ev.args.amount,
          hash: ev.transactionHash,
          block: ev.blockNumber,
        });
      }
      for (const ev of refunds) {
        rows.push({ type: "Refund", cls: "refund", id: Number(ev.args.id), amount: ev.args.amount, hash: ev.transactionHash, block: ev.blockNumber });
      }
      for (const ev of withdrawals) {
        rows.push({ type: "Withdrawal", cls: "withdrawal", id: Number(ev.args.id), amount: ev.args.amount, hash: ev.transactionHash, block: ev.blockNumber });
      }
      rows.sort((a, b) => b.block - a.block);
      any = rows.length > 0;

      for (const r of rows) {
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `
          <span class="history-type history-type-${r.cls}">${r.type}</span>
          <span>Campaign #${r.id}</span>
          <span><strong>${Contract.formatEth(r.amount)} ETH</strong></span>
          <span class="muted">block ${r.block}</span>
          <span class="history-hash" title="${r.hash}">${Contract.shortHash(r.hash)}</span>`;
        list.appendChild(row);
      }
    }

    if (any) hide($("historyEmpty")); else show($("historyEmpty"));
  },

  /* ----- campaign modal ----- */

  async openCampaign(id, showToastIfMissing = true) {
    const c = this.campaigns.find((x) => x.id === id);
    if (!c) {
      if (showToastIfMissing) Toast.error("Campaign not found.");
      return;
    }
    this.openCampaignId = id;

    const status = this.statusOf(c);
    const pct = Math.min(100, Number((c.raised * 100n) / c.goal));

    $("modalTitle").textContent = c.title;
    $("modalCreator").textContent = c.creator;
    $("modalDescription").textContent = c.description || "No description provided.";
    $("modalProgress").style.width = pct + "%";
    $("modalProgress").classList.toggle("full", pct >= 100);
    $("modalRaised").textContent = Contract.formatEth(c.raised) + " ETH";
    $("modalGoal").textContent = Contract.formatEth(c.goal) + " ETH";
    $("modalStatus").innerHTML = `<span class="status status-${status}">${status}</span>`;
    $("modalDeadline").textContent = `${formatDate(c.deadline)} (${deadlineText(c.deadline)})`;
    $("modalId").textContent = "#" + c.id;

    let your = "—";
    if (Wallet.connected && Contract.read) {
      const amount = await Contract.read.getContribution(c.id, Wallet.account);
      your = amount > 0n ? Contract.formatEth(amount) + " ETH" : "None yet";
    }
    $("modalYourContribution").textContent = your;

    this._renderModalActions(c, status);
    show($("campaignModal"));
  },

  _renderModalActions(c, status) {
    const actions = $("modalActions");
    actions.innerHTML = "";

    if (!Wallet.connected) {
      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "Connect your wallet to interact with this campaign.";
      actions.appendChild(hint);
      return;
    }

    const isCreator = Wallet.account && c.creator.toLowerCase() === Wallet.account.toLowerCase();

    if (status === "Active") {
      const input = document.createElement("input");
      input.id = "contributeAmount";
      input.type = "number";
      input.step = "any";
      input.min = "0.000001";
      input.placeholder = "Amount (ETH)";
      actions.appendChild(input);

      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = "Contribute";
      btn.addEventListener("click", () => this._doContribute(c.id));
      actions.appendChild(btn);
    }

    if (status === "Successful" && isCreator) {
      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = "Withdraw Funds";
      btn.addEventListener("click", () => this._doWithdraw(c.id));
      actions.appendChild(btn);
    }

    if (status === "Failed") {
      const amount = this._myContributionCache;
      const btn = document.createElement("button");
      btn.className = "btn btn-danger";
      btn.textContent = "Claim Refund";
      btn.addEventListener("click", () => this._doRefund(c.id));
      actions.appendChild(btn);
    }

    if (status === "Withdrawn") {
      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "The creator has withdrawn the funds from this campaign.";
      actions.appendChild(hint);
    }

    if (status === "Successful" && !isCreator) {
      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "Goal reached — the creator can now withdraw the funds.";
      actions.appendChild(hint);
    }
  },

  closeCampaign() {
    this.openCampaignId = null;
    hide($("campaignModal"));
  },

  /* ----- actions (transactions) ----- */

  async _doContribute(id) {
    const raw = $("contributeAmount").value;
    if (!raw || Number(raw) <= 0) return Toast.error("Enter a contribution amount first.");
    try {
      await Wallet.ensureHardhatNetwork();
      const writer = await Contract.getWriter();
      Toast.show("Sending contribution transaction… confirm in MetaMask.");
      const tx = await writer.contribute(id, { value: Contract.parseEth(raw) });
      Toast.show("Transaction submitted. Waiting for confirmation…");
      const receipt = await tx.wait();
      Toast.show(`Contribution confirmed! Tx: ${Contract.shortHash(receipt.hash)}`);
      await this.refreshAll();
    } catch (err) {
      Toast.error(this._errText(err));
    }
  },

  async _doWithdraw(id) {
    try {
      await Wallet.ensureHardhatNetwork();
      const writer = await Contract.getWriter();
      Toast.show("Sending withdrawal transaction… confirm in MetaMask.");
      const tx = await writer.withdrawFunds(id);
      Toast.show("Transaction submitted. Waiting for confirmation…");
      const receipt = await tx.wait();
      Toast.show(`Funds withdrawn! Tx: ${Contract.shortHash(receipt.hash)}`);
      await this.refreshAll();
    } catch (err) {
      Toast.error(this._errText(err));
    }
  },

  async _doRefund(id) {
    try {
      await Wallet.ensureHardhatNetwork();
      const writer = await Contract.getWriter();
      Toast.show("Sending refund transaction… confirm in MetaMask.");
      const tx = await writer.claimRefund(id);
      Toast.show("Transaction submitted. Waiting for confirmation…");
      const receipt = await tx.wait();
      Toast.show(`Refund claimed! Tx: ${Contract.shortHash(receipt.hash)}`);
      await this.refreshAll();
    } catch (err) {
      Toast.error(this._errText(err));
    }
  },

  _errText(err) {
    // Pull the Solidity require reason out of ethers errors when possible.
    if (err && err.shortMessage) return err.shortMessage;
    if (err && err.reason) return err.reason;
    if (err && err.message) return err.message.slice(0, 160);
    return "Transaction failed.";
  },

  /* ----- wallet ----- */

  _updateWalletUI() {
    const btn = $("connectBtn");
    const addr = $("walletAddress");
    const chain = $("walletChain");

    if (Wallet.connected) {
      btn.textContent = "Disconnect";
      show(addr);
      addr.textContent = Wallet.shortAddress();
      if (Wallet.chainId) {
        show(chain);
        const local = Number(Wallet.chainId) === 31337;
        chain.textContent = local ? "Hardhat Local" : `Chain ${Number(Wallet.chainId)}`;
      }
    } else {
      btn.textContent = "Connect Wallet";
      hide(addr);
      hide(chain);
    }
  },

  async onWalletChanged() {
    await this.refreshAll();
    if (this.openCampaignId !== null) await this.openCampaign(this.openCampaignId, false);
  },

  /* ----- event binding ----- */

  _bindNav() {
    for (const btn of document.querySelectorAll("#mainNav .nav-btn")) {
      btn.addEventListener("click", () => {
        for (const b of document.querySelectorAll("#mainNav .nav-btn")) b.classList.remove("active");
        btn.classList.add("active");
        for (const page of document.querySelectorAll(".page")) hide(page);
        show($("page-" + btn.dataset.page));

        // Pages depending on the wallet refresh when opened.
        if (btn.dataset.page === "contributions") this.renderContributions().catch(() => {});
        if (btn.dataset.page === "history") this.renderHistory().catch(() => {});
      });
    }
  },

  _bindWallet() {
    $("connectBtn").addEventListener("click", async () => {
      try {
        if (Wallet.connected) {
          Wallet.account = null;
        } else {
          const account = await Wallet.connect();
          if (!account) return;
          await Wallet.ensureHardhatNetwork().catch(() =>
            Toast.error("Could not switch to the Hardhat network. Add it in MetaMask (chainId 31338).")
          );
        }
        await this.onWalletChanged();
      } catch (err) {
        Toast.error(err.message || "Wallet connection failed.");
      }
    });
  },

  _bindForms() {
    $("createForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = $("cTitle").value.trim();
      const description = $("cDescription").value.trim();
      const goal = $("cGoal").value;
      const minutes = $("cMinutes").value;

      if (!title) return Toast.error("Title is required.");

      try {
        await Wallet.ensureHardhatNetwork();
        const writer = await Contract.getWriter();
        Toast.show("Sending create-campaign transaction… confirm in MetaMask.");
        const tx = await writer.createCampaign(title, description, Contract.parseEth(goal), Number(minutes) * 60);
        Toast.show("Transaction submitted. Waiting for confirmation…");
        const receipt = await tx.wait();

        // Verify on-chain that the campaign really exists. A transaction to an
        // address without contract code mines "successfully" as a no-op, so a
        // confirmation alone is not proof the campaign was created.
        let count = 0;
        try {
          count = Number(await Contract.read.campaignCount());
        } catch (_) { /* contract missing entirely */ }

        if (count < 1) {
          Toast.error(
            "The transaction was mined but no campaign exists on-chain — " +
              "the contract may not be deployed on this network. Run `npm run deploy:local`, then retry."
          );
        } else {
          Toast.show(`Campaign created! Tx: ${Contract.shortHash(receipt.hash)}`);
        }

        $("createForm").reset();
        await this.refreshAll();
      } catch (err) {
        Toast.error(this._errText(err));
      }
    });

    $("refreshBtn").addEventListener("click", () => {
      this.refreshAll().catch(() => {});
      Toast.show("Refreshed from the blockchain.");
    });
  },

  _bindModal() {
    $("modalClose").addEventListener("click", () => this.closeCampaign());
    $("campaignModal").addEventListener("click", (e) => {
      if (e.target === $("campaignModal")) this.closeCampaign();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeCampaign();
    });
  },

  _escape(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },
};

document.addEventListener("DOMContentLoaded", () => {
  App.init().catch((err) => console.error("App init failed:", err));
});
