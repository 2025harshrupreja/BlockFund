/* ============================================================
   BlockFund — contract access layer
   The deployed address is loaded from `contract-address.json`
   (written automatically by `npm run deploy:local`). You can also
   paste it into CONTRACT_ADDRESS below as a fallback.
   ============================================================ */

const CONTRACT_ADDRESS = ""; // e.g. "0x5FbDB2315678afecb367f032d93F642f64180aa3"

const CONTRACT_ABI = [
  "function campaignCount() view returns (uint256)",
  "function campaigns(uint256 campaignId) view returns (uint256 id, address creator, string title, string description, uint256 goal, uint256 raised, uint256 deadline, bool withdrawn, bool successful)",
  "function createCampaign(string title, string description, uint256 goal, uint256 durationInSeconds) returns (uint256)",
  "function contribute(uint256 campaignId) payable",
  "function withdrawFunds(uint256 campaignId)",
  "function claimRefund(uint256 campaignId)",
  "function getContribution(uint256 campaignId, address contributor) view returns (uint256)",
  "function getStatus(uint256 campaignId) view returns (string)",
  "event CampaignCreated(uint256 indexed id, address indexed creator, string title, uint256 goal, uint256 deadline)",
  "event ContributionMade(uint256 indexed id, address indexed contributor, uint256 amount, uint256 totalRaised)",
  "event FundsWithdrawn(uint256 indexed id, address indexed creator, uint256 amount)",
  "event RefundClaimed(uint256 indexed id, address indexed contributor, uint256 amount)",
];

const Contract = {
  address: null,
  read: null, // read-only instance
  localChain: false, // true when running against the local Hardhat network

  /**
   * Load the deployed address and create a read-only contract instance.
   * Returns true when a contract address is available.
   */
  async init() {
    this.address = CONTRACT_ADDRESS;

    // Try the auto-generated address file first.
    try {
      const res = await fetch("js/contract-address.json", { cache: "no-store" });
      if (res.ok) {
        const info = await res.json();
        this.address = info.address;
      }
    } catch (_) {
      // fetch fails when opened via file:// — fall back to the constant above
    }

    if (!this.address) return false;

    // With MetaMask we read through the wallet's provider; otherwise we
    // attempt a direct connection to the local Hardhat node (read-only).
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      this.read = new ethers.Contract(this.address, CONTRACT_ABI, provider);
      this.localChain = this._isLocal(await provider.getNetwork().then((n) => n.chainId));
    } else {
      try {
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545", 31338);
        this.read = new ethers.Contract(this.address, CONTRACT_ABI, provider);
        this.localChain = true;
      } catch (_) {
        return false;
      }
    }

    return true;
  },

  _isLocal(chainId) {
    return Number(chainId) === 31338;
  },

  /** Contract instance connected to the user's wallet (for transactions). */
  async getWriter() {
    if (!this.address) throw new Error("Contract not deployed yet. Run `npm run deploy:local`.");
    if (!Wallet.hasProvider()) throw new Error("MetaMask not detected.");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(this.address, CONTRACT_ABI, signer);
  },

  /** wei -> ETH string, trimmed of trailing zeros. */
  formatEth(wei) {
    const s = ethers.formatEther(wei);
    return Number(s).toString();
  },

  /** ETH string -> wei (BigInt). */
  parseEth(amount) {
    return ethers.parseEther(String(amount));
  },

  /** Short transaction hash for display, e.g. "0x12ab…9f". */
  shortHash(hash) {
    if (!hash) return "";
    return hash.slice(0, 8) + "…" + hash.slice(-6);
  },
};
