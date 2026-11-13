/* ============================================================
   BlockFund — wallet handling (MetaMask)
   ============================================================ */

const Wallet = {
  HARDHAT_CHAIN_ID: 31338, // decimal; hex form is "0x7a7a"
  account: null,
  chainId: null,
  _listening: false,

  get connected() {
    return this.account !== null;
  },

  hasProvider() {
    return typeof window.ethereum !== "undefined";
  },

  /** Ask MetaMask for account access. Returns the account or null. */
  async connect() {
    if (!this.hasProvider()) {
      throw new Error("MetaMask not detected. Install it from metamask.io to use BlockFund.");
    }

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) return null;

    this.account = accounts[0];
    this.chainId = await window.ethereum.request({ method: "eth_chainId" });
    this._listen();
    return this.account;
  },

  /** Point the wallet at the local Hardhat network (chainId 31338). */
  async ensureHardhatNetwork() {
    const HARDHAT_CHAIN_ID = "0x" + this.HARDHAT_CHAIN_ID.toString(16); // "0x7a7a"

    // Re-read the live value rather than trusting a cached one.
    const current = await window.ethereum.request({ method: "eth_chainId" });
    this.chainId = current;
    if (current === HARDHAT_CHAIN_ID) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: HARDHAT_CHAIN_ID }],
      });
    } catch (err) {
      // 4902 = chain not added yet
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: HARDHAT_CHAIN_ID,
              chainName: "BlockFund Local (Hardhat)",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      } else {
        throw err;
      }
    }

    // Verify the wallet actually moved. MetaMask can silently reject or
    // leave the popup unconfirmed, so never assume the switch worked.
    const after = await window.ethereum.request({ method: "eth_chainId" });
    this.chainId = after;
    if (after !== HARDHAT_CHAIN_ID) {
      throw new Error(
        `MetaMask is still on chain ${parseInt(after, 16)} instead of 31338. ` +
          `Switch manually in the network dropdown.`
      );
    }
  },

  /** Subscribe to wallet account / network changes (once). */
  _listen() {
    if (this._listening || !this.hasProvider()) return;
    this._listening = true;

    window.ethereum.on("accountsChanged", (accounts) => {
      this.account = accounts && accounts.length > 0 ? accounts[0] : null;
      App.onWalletChanged();
    });

    window.ethereum.on("chainChanged", (chainId) => {
      this.chainId = chainId;
      App.onWalletChanged();
    });
  },

  /** "0x1234...abcd" style display address. */
  shortAddress(address = this.account) {
    if (!address) return "";
    return address.slice(0, 6) + "..." + address.slice(-4);
  },
};
