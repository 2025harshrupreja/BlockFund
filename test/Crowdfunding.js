import { expect } from "chai";
import { network } from "hardhat";

// Hardhat 3: ethers is exposed on the network connection.
const { ethers } = await network.getOrCreate();

const ONE_ETH = ethers.parseEther("1");
const GOAL = ethers.parseEther("10");
const THIRTY_DAYS = 30 * 24 * 60 * 60;

describe("Crowdfunding", function () {
  let crowdfunding, crowdfundingAddress;
  let creator, contributor1, contributor2, outsider;

  beforeEach(async function () {
    [creator, contributor1, contributor2, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await factory.deploy();
    await crowdfunding.waitForDeployment();
    crowdfundingAddress = await crowdfunding.getAddress();
  });

  /* ---------------------------------------------------------------- */
  /* Helpers                                                          */
  /* ---------------------------------------------------------------- */

  async function createCampaign(title = "Water Purifier", goal = GOAL, durationSeconds = THIRTY_DAYS) {
    return crowdfunding
      .connect(creator)
      .createCampaign(title, "Affordable water purification system", goal, durationSeconds);
  }

  async function advanceTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  /* ---------------------------------------------------------------- */
  /* Deployment                                                       */
  /* ---------------------------------------------------------------- */

  describe("Deployment", function () {
    it("starts with zero campaigns", async function () {
      expect(await crowdfunding.campaignCount()).to.equal(0n);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Campaign creation                                                */
  /* ---------------------------------------------------------------- */

  describe("Campaign creation", function () {
    it("stores the campaign with correct fields", async function () {
      await (await createCampaign()).wait();

      const c = await crowdfunding.getCampaign(1);
      expect(c.id).to.equal(1n);
      expect(c.creator).to.equal(creator.address);
      expect(c.title).to.equal("Water Purifier");
      expect(c.description).to.equal("Affordable water purification system");
      expect(c.goal).to.equal(GOAL);
      expect(c.raised).to.equal(0n);
      expect(c.withdrawn).to.equal(false);
      expect(c.successful).to.equal(false);
      expect(c.deadline).to.be.greaterThan(0n);
    });

    it("increments the campaign count", async function () {
      await (await createCampaign("Campaign A")).wait();
      await (await createCampaign("Campaign B")).wait();
      expect(await crowdfunding.campaignCount()).to.equal(2n);
    });

    it("emits CampaignCreated", async function () {
      await expect(createCampaign()).to.emit(crowdfunding, "CampaignCreated");
    });

    it("reverts when the title is empty", async function () {
      await expect(createCampaign("")).to.be.revertedWith("Title is required");
    });

    it("reverts when the goal is zero", async function () {
      await expect(createCampaign("No goal", 0n)).to.be.revertedWith(
        "Goal must be greater than zero"
      );
    });

    it("reverts when the duration is zero", async function () {
      await expect(createCampaign("No time", GOAL, 0)).to.be.revertedWith(
        "Duration must be greater than zero"
      );
    });

    it("reverts for an invalid campaign id", async function () {
      await expect(crowdfunding.getCampaign(1)).to.be.revertedWith(
        "Campaign does not exist"
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /* Contributions                                                    */
  /* ---------------------------------------------------------------- */

  describe("Contributions", function () {
    beforeEach(async function () {
      await (await createCampaign()).wait();
    });

    it("records a contribution and updates the raised amount", async function () {
      await (await crowdfunding.connect(contributor1).contribute(1, { value: ONE_ETH })).wait();

      const c = await crowdfunding.getCampaign(1);
      expect(c.raised).to.equal(ONE_ETH);
      expect(c.successful).to.equal(false);
      expect(await crowdfunding.getContribution(1, contributor1.address)).to.equal(ONE_ETH);
      expect(await ethers.provider.getBalance(crowdfundingAddress)).to.equal(ONE_ETH);
    });

    it("accumulates multiple contributions from the same address", async function () {
      const cf = crowdfunding.connect(contributor1);
      await (await cf.contribute(1, { value: ONE_ETH })).wait();
      await (await cf.contribute(1, { value: ONE_ETH })).wait();

      expect(await crowdfunding.getContribution(1, contributor1.address)).to.equal(ONE_ETH * 2n);
      expect((await crowdfunding.getCampaign(1)).raised).to.equal(ONE_ETH * 2n);
    });

    it("marks the campaign successful when the goal is reached", async function () {
      await (await crowdfunding.connect(contributor1).contribute(1, { value: GOAL })).wait();

      const c = await crowdfunding.getCampaign(1);
      expect(c.successful).to.equal(true);
      expect(await crowdfunding.getStatus(1)).to.equal("Successful");
    });

    it("reverts on a zero-value contribution", async function () {
      await expect(crowdfunding.connect(contributor1).contribute(1, { value: 0n })).to.be.revertedWith(
        "Contribution must be greater than zero"
      );
    });

    it("reverts for a nonexistent campaign", async function () {
      await expect(
        crowdfunding.connect(contributor1).contribute(99, { value: ONE_ETH })
      ).to.be.revertedWith("Campaign does not exist");
    });

    it("reverts once the funding goal has been reached", async function () {
      await (await crowdfunding.connect(contributor1).contribute(1, { value: GOAL })).wait();

      await expect(
        crowdfunding.connect(contributor2).contribute(1, { value: ONE_ETH })
      ).to.be.revertedWith("Funding goal reached; campaign is closed");
    });

    it("reverts after the deadline has passed", async function () {
      await advanceTime(THIRTY_DAYS + 1);

      await expect(
        crowdfunding.connect(contributor1).contribute(1, { value: ONE_ETH })
      ).to.be.revertedWith("Campaign deadline has passed");
    });

    it("emits ContributionMade with the correct amounts", async function () {
      await expect(
        crowdfunding.connect(contributor1).contribute(1, { value: ONE_ETH })
      )
        .to.emit(crowdfunding, "ContributionMade")
        .withArgs(1, contributor1.address, ONE_ETH, ONE_ETH);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Fund withdrawal                                                  */
  /* ---------------------------------------------------------------- */

  describe("Fund withdrawal", function () {
    beforeEach(async function () {
      await (await createCampaign()).wait();
      // 4 ETH + 6 ETH = 10 ETH goal
      await (await crowdfunding.connect(contributor1).contribute(1, { value: ethers.parseEther("4") })).wait();
      await (await crowdfunding.connect(contributor2).contribute(1, { value: ethers.parseEther("6") })).wait();
    });

    it("lets the creator withdraw the full raised amount", async function () {
      await expect(crowdfunding.connect(creator).withdrawFunds(1))
        .to.emit(crowdfunding, "FundsWithdrawn")
        .withArgs(1, creator.address, GOAL);

      expect(await ethers.provider.getBalance(crowdfundingAddress)).to.equal(0n);

      const c = await crowdfunding.getCampaign(1);
      expect(c.withdrawn).to.equal(true);
      expect(await crowdfunding.getStatus(1)).to.equal("Withdrawn");
    });

    it("reverts when a non-creator tries to withdraw", async function () {
      await expect(crowdfunding.connect(outsider).withdrawFunds(1)).to.be.revertedWith(
        "Only the campaign creator can withdraw"
      );
    });

    it("reverts when the campaign is not successful", async function () {
      await (await createCampaign("Underfunded", GOAL, THIRTY_DAYS * 2)).wait();
      await (await crowdfunding.connect(contributor1).contribute(2, { value: ONE_ETH })).wait();

      await expect(crowdfunding.connect(creator).withdrawFunds(2)).to.be.revertedWith(
        "Funding goal was not reached"
      );
    });

    it("reverts when withdrawing twice", async function () {
      await (await crowdfunding.connect(creator).withdrawFunds(1)).wait();

      await expect(crowdfunding.connect(creator).withdrawFunds(1)).to.be.revertedWith(
        "Funds already withdrawn"
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /* Refunds                                                          */
  /* ---------------------------------------------------------------- */

  describe("Refunds", function () {
    beforeEach(async function () {
      await (await createCampaign()).wait();
      await (await crowdfunding.connect(contributor1).contribute(1, { value: ONE_ETH })).wait();
      await (await crowdfunding.connect(contributor2).contribute(1, { value: ONE_ETH })).wait();
      await advanceTime(THIRTY_DAYS + 1); // expire the campaign
    });

    it("refunds a contributor of a failed campaign", async function () {
      const balanceBefore = await ethers.provider.getBalance(contributor1.address);

      const tx = await crowdfunding.connect(contributor1).claimRefund(1);
      const receipt = await tx.wait();
      const gasCost = receipt.gasPrice * receipt.gasUsed;

      const balanceAfter = await ethers.provider.getBalance(contributor1.address);
      expect(balanceAfter).to.equal(balanceBefore + ONE_ETH - gasCost);
    });

    it("zeroes the contribution record after a refund", async function () {
      await (await crowdfunding.connect(contributor1).claimRefund(1)).wait();

      expect(await crowdfunding.getContribution(1, contributor1.address)).to.equal(0n);
      expect((await crowdfunding.getCampaign(1)).raised).to.equal(ONE_ETH);
    });

    it("reverts while the campaign is still active", async function () {
      await (await createCampaign("Still active", GOAL, THIRTY_DAYS * 2)).wait();
      await (await crowdfunding.connect(contributor1).contribute(2, { value: ONE_ETH })).wait();

      await expect(crowdfunding.connect(contributor1).claimRefund(2)).to.be.revertedWith(
        "Campaign is still active"
      );
    });

    it("reverts for a successful campaign", async function () {
      // Created after the clock was already advanced; a short duration (30s)
      // expires once the test advances time again.
      await (await createCampaign("Won", GOAL, 30)).wait();
      await (await crowdfunding.connect(contributor1).contribute(2, { value: GOAL })).wait();
      await advanceTime(THIRTY_DAYS + 1);

      await expect(crowdfunding.connect(contributor1).claimRefund(2)).to.be.revertedWith(
        "Campaign succeeded; no refunds"
      );
    });

    it("reverts when there is nothing to refund", async function () {
      await expect(crowdfunding.connect(outsider).claimRefund(1)).to.be.revertedWith(
        "No contribution to refund"
      );
    });

    it("reverts on a double refund", async function () {
      await (await crowdfunding.connect(contributor1).claimRefund(1)).wait();

      await expect(crowdfunding.connect(contributor1).claimRefund(1)).to.be.revertedWith(
        "No contribution to refund"
      );
    });

    it("emits RefundClaimed", async function () {
      await expect(crowdfunding.connect(contributor1).claimRefund(1))
        .to.emit(crowdfunding, "RefundClaimed")
        .withArgs(1, contributor1.address, ONE_ETH);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Safety                                                           */
  /* ---------------------------------------------------------------- */

  describe("Direct ETH transfers", function () {
    it("rejects plain ETH transfers to the contract", async function () {
      await expect(
        outsider.sendTransaction({ to: crowdfundingAddress, value: ONE_ETH })
      ).to.be.revertedWith("Direct ETH transfers are not allowed; use contribute()");
    });
  });
});
