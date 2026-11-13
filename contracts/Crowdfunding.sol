// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title  Crowdfunding
 * @notice BlockFund: a decentralized, all-or-nothing crowdfunding platform.
 *         All campaign data is stored on-chain (design decision: Option A).
 *
 *         Campaign lifecycle:
 *           Create -> Active -> Goal reached? -> Successful -> Creator withdraws
 *                                          |-> Deadline expires -> Failed -> Contributors claim refunds
 *
 *         Rules enforced by this contract:
 *           - Only the campaign creator can withdraw successful campaign funds.
 *           - Contributions are rejected after the deadline.
 *           - Contributions are rejected once the funding goal is reached.
 *           - Refunds are only possible for failed (unsuccessful, expired) campaigns.
 *           - Contributors can only claim their own refunds, and only once.
 *           - Withdrawals cannot happen twice.
 */
contract Crowdfunding {
    // ------------------------------------------------------------------
    // Data structures
    // ------------------------------------------------------------------

    struct Campaign {
        uint256 id;
        address payable creator; // campaign owner's wallet
        string title;
        string description;
        uint256 goal; // funding target (in wei)
        uint256 raised; // amount collected (in wei)
        uint256 deadline; // unix timestamp
        bool withdrawn; // whether the creator withdrew the funds
        bool successful; // whether the funding goal was reached
    }

    uint256 public campaignCount;

    // Auto getter: campaigns(campaignId) returns the full Campaign struct.
    mapping(uint256 => Campaign) public campaigns;

    // contributions[campaignId][contributor] = total contributed (in wei)
    mapping(uint256 => mapping(address => uint256)) public contributions;

    // ------------------------------------------------------------------
    // Reentrancy protection (minimal guard)
    // ------------------------------------------------------------------

    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1, "Reentrant call");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        string title,
        uint256 goal,
        uint256 deadline
    );

    event ContributionMade(
        uint256 indexed id,
        address indexed contributor,
        uint256 amount,
        uint256 totalRaised
    );

    event FundsWithdrawn(
        uint256 indexed id,
        address indexed creator,
        uint256 amount
    );

    event RefundClaimed(
        uint256 indexed id,
        address indexed contributor,
        uint256 amount
    );

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier campaignExists(uint256 _id) {
        require(_id >= 1 && _id <= campaignCount, "Campaign does not exist");
        _;
    }

    // Reject accidental direct ETH transfers.
    receive() external payable {
        revert("Direct ETH transfers are not allowed; use contribute()");
    }

    // ------------------------------------------------------------------
    // External / public functions
    // ------------------------------------------------------------------

    /// @notice Create a new crowdfunding campaign.
    /// @param _title             Campaign title (required, non-empty).
    /// @param _description       Campaign description (informational).
    /// @param _goal              Funding target in wei.
    /// @param _durationInSeconds How long the campaign stays open, in seconds.
    ///                           (The demo UI expresses this in minutes.)
    /// @return The id of the newly created campaign.
    function createCampaign(
        string calldata _title,
        string calldata _description,
        uint256 _goal,
        uint256 _durationInSeconds
    ) external returns (uint256) {
        require(bytes(_title).length > 0, "Title is required");
        require(_goal > 0, "Goal must be greater than zero");
        require(_durationInSeconds > 0, "Duration must be greater than zero");

        campaignCount += 1;
        uint256 deadline = block.timestamp + _durationInSeconds;

        campaigns[campaignCount] = Campaign({
            id: campaignCount,
            creator: payable(msg.sender),
            title: _title,
            description: _description,
            goal: _goal,
            raised: 0,
            deadline: deadline,
            withdrawn: false,
            successful: false
        });

        emit CampaignCreated(campaignCount, msg.sender, _title, _goal, deadline);
        return campaignCount;
    }

    /// @notice Contribute ETH to a campaign.
    /// @dev    The campaign closes automatically once the goal is reached.
    function contribute(uint256 _id) external payable campaignExists(_id) {
        Campaign storage campaign = campaigns[_id];

        require(msg.value > 0, "Contribution must be greater than zero");
        require(block.timestamp <= campaign.deadline, "Campaign deadline has passed");
        require(campaign.raised < campaign.goal, "Funding goal reached; campaign is closed");

        campaign.raised += msg.value;
        contributions[_id][msg.sender] += msg.value;

        // All-or-nothing: the moment the goal is reached, mark it successful.
        if (campaign.raised >= campaign.goal) {
            campaign.successful = true;
        }

        emit ContributionMade(_id, msg.sender, msg.value, campaign.raised);
    }

    /// @notice Withdraw the collected funds of a successful campaign.
    /// @dev    Only callable by the campaign creator, only once.
    function withdrawFunds(uint256 _id) external nonReentrant campaignExists(_id) {
        Campaign storage campaign = campaigns[_id];

        require(msg.sender == campaign.creator, "Only the campaign creator can withdraw");
        require(campaign.successful, "Funding goal was not reached");
        require(!campaign.withdrawn, "Funds already withdrawn");

        uint256 amount = campaign.raised;

        // Effects before interactions (checks-effects-interactions pattern).
        campaign.withdrawn = true;

        (bool ok, ) = campaign.creator.call{value: amount}("");
        require(ok, "Transfer failed");

        emit FundsWithdrawn(_id, msg.sender, amount);
    }

    /// @notice Claim a refund from a failed campaign.
    /// @dev    The campaign must be expired and unsuccessful.
    function claimRefund(uint256 _id) external nonReentrant campaignExists(_id) {
        Campaign storage campaign = campaigns[_id];

        require(block.timestamp > campaign.deadline, "Campaign is still active");
        require(!campaign.successful, "Campaign succeeded; no refunds");

        uint256 amount = contributions[_id][msg.sender];
        require(amount > 0, "No contribution to refund");

        // Effects before interactions; zeroes the balance to block re-entry
        // and double refunds.
        contributions[_id][msg.sender] = 0;
        campaign.raised -= amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Refund failed");

        emit RefundClaimed(_id, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // View helpers
    // ------------------------------------------------------------------

    /// @notice Retrieve the full campaign information.
    function getCampaign(uint256 _id)
        external
        view
        campaignExists(_id)
        returns (Campaign memory)
    {
        return campaigns[_id];
    }

    /// @notice Retrieve an individual's contribution to a campaign.
    function getContribution(uint256 _id, address _contributor)
        external
        view
        campaignExists(_id)
        returns (uint256)
    {
        return contributions[_id][_contributor];
    }

    /// @notice Human-readable status for the UI:
    ///         Active | Successful | Failed | Withdrawn
    function getStatus(uint256 _id)
        external
        view
        campaignExists(_id)
        returns (string memory)
    {
        Campaign storage campaign = campaigns[_id];
        if (campaign.withdrawn) return "Withdrawn";
        if (campaign.successful) return "Successful";
        if (block.timestamp > campaign.deadline) return "Failed";
        return "Active";
    }
}
