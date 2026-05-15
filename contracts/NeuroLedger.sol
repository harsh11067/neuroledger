// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NeuroLedger
 * @notice Verifiable Autonomous Clinical Intelligence Network
 * @dev Core contract: rounds, gradients, aggregation, decisions, governance
 *      Deploys on 0G Chain (EVM-compatible, Chain ID: 16602)
 *      All 8 events are emitted per round lifecycle for full auditability
 */
contract NeuroLedger {

    // ─── Storage ───────────────────────────────────────────────

    struct Agent {
        address addr;
        string hospitalName;
        string region;
        string specialization;
        uint256 stake;
        uint256 reputation;            // 0–10000 (basis points)
        uint256 agentTokenId;          // ERC-7857 compatible ID
        uint256 acceptThresholdBps;    // basis points: e.g. 50 = +0.50% to ACCEPT
        uint256 retrainThresholdBps;   // basis points: e.g. 20 = +0.20% floor before RETRAIN
        uint256 roundsCompleted;
        uint256 roundsAccepted;
        uint256 roundsRejected;
        bool registered;
        bool active;
    }

    struct TrainingRound {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        address[] participants;
        mapping(address => string)  gradientCIDs;       // 0G Storage CIDs
        mapping(address => bytes32) updateHashes;        // SHA256 per gradient
        mapping(address => bytes32) dpProofHashes;       // keccak256 of DP params
        string   globalModelCID;
        bytes32  aggregationHash;                        // SHA256 of krum+trimmed-mean trace
        bytes32  proofHash;                              // SHA256 of full proof bundle
        bytes32  gradientMerkleRoot;                     // Merkle root of all submitted gradients
        bytes32  globalModelHash;                        // SHA256 of global model weights
        string   modelVersionId;
        string   teeProofCID;                            // 0G Storage CID of tee_proof.json
        uint256  dpEpsilonConsumed;                      // Rényi DP ε × 1e6
        bool     aggregationComplete;
        bool     rewardsDistributed;
        mapping(address => string)  decisions;           // ACCEPT / RETRAIN / REJECT
        mapping(address => bytes32) decisionProofs;      // SHA256 of decision record
        mapping(address => uint256) localAccReports;     // Scaled by 10000
        mapping(address => uint256) globalAccReports;    // Scaled by 10000
        uint256  rejectCount;
        bool     governanceTriggered;
    }

    mapping(address => Agent) public agents;
    mapping(uint256 => TrainingRound) internal rounds;
    address[] public agentList;
    uint256 public currentRound;
    uint256 private _agentCounter;
    uint256 public constant MIN_STAKE = 0.01 ether;
    address public owner;
    address public aggregator;

    // ─── Events (All 8 — verifiable on 0G Explorer) ────────────

    event AgentRegistered(
        address indexed agent,
        string hospitalName,
        string region,
        uint256 tokenId,
        uint256 acceptThresholdBps,
        uint256 retrainThresholdBps
    );

    event RoundStarted(
        uint256 indexed roundId,
        uint256 timestamp
    );

    event GradientSubmitted(
        uint256 indexed roundId,
        address indexed agent,
        string cid,
        bytes32 updateHash,
        bytes32 dpProofHash
    );

    event AggregationComplete(
        uint256 indexed roundId,
        string globalModelCID,
        bytes32 aggregationHash,
        bytes32 proofHash,
        bytes32 gradientMerkleRoot,
        string modelVersionId,
        bytes32 globalModelHash,
        string teeProofCID,
        uint256 dpEpsilonConsumed
    );

    event AgentDecision(
        uint256 indexed roundId,
        address indexed agent,
        string decision,
        bytes32 decisionProofHash,
        uint256 localAccBps,
        uint256 globalAccBps
    );

    event AccuracyReported(
        uint256 indexed roundId,
        address indexed agent,
        uint256 localAcc,
        uint256 globalAcc
    );

    event RewardDistributed(
        uint256 indexed roundId,
        address indexed agent,
        uint256 amount
    );

    event GovernanceTrigger(
        uint256 indexed roundId,
        string reason,
        uint256 rejectCount
    );

    // ─── Modifiers ──────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAggregator() {
        require(msg.sender == aggregator, "Not aggregator");
        _;
    }

    modifier onlyActive() {
        require(agents[msg.sender].active, "Agent not active");
        _;
    }

    // ─── Constructor ────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        aggregator = msg.sender;
    }

    // ─── Core Functions ─────────────────────────────────────────

    /**
     * @notice Register a new hospital agent with autonomous decision policy
     * @param hospitalName Name of the hospital
     * @param region Geographic region (APAC, EU, Americas, Africa)
     * @param specialization Medical specialization
     * @param acceptThresholdBps Basis points improvement required to ACCEPT (e.g. 50 = 0.50%)
     * @param retrainThresholdBps Basis points floor below which RETRAIN triggers (e.g. 20 = 0.20%)
     */
    function registerAgent(
        string calldata hospitalName,
        string calldata region,
        string calldata specialization,
        uint256 acceptThresholdBps,
        uint256 retrainThresholdBps
    ) external payable {
        require(!agents[msg.sender].registered, "Already registered");
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(bytes(hospitalName).length > 0, "Hospital name required");

        uint256 tokenId = ++_agentCounter;

        agents[msg.sender] = Agent({
            addr: msg.sender,
            hospitalName: hospitalName,
            region: region,
            specialization: specialization,
            stake: msg.value,
            reputation: 5000,
            agentTokenId: tokenId,
            acceptThresholdBps: acceptThresholdBps,
            retrainThresholdBps: retrainThresholdBps,
            roundsCompleted: 0,
            roundsAccepted: 0,
            roundsRejected: 0,
            registered: true,
            active: true
        });
        agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, hospitalName, region, tokenId, acceptThresholdBps, retrainThresholdBps);
    }

    /**
     * @notice Start a new training round
     * @return roundId The new round's ID
     */
    function startRound() external returns (uint256 roundId) {
        roundId = ++currentRound;
        TrainingRound storage r = rounds[roundId];
        r.roundId = roundId;
        r.startTime = block.timestamp;

        for (uint256 i = 0; i < agentList.length; i++) {
            address a = agentList[i];
            if (agents[a].active && agents[a].reputation >= 2000) {
                r.participants.push(a);
            }
        }

        emit RoundStarted(roundId, block.timestamp);
    }

    /**
     * @notice Submit encrypted gradient delta + differential privacy proof
     * @param roundId The round to submit for
     * @param cid 0G Storage CID of the encrypted gradient
     * @param updateHash SHA256 of the gradient delta bytes
     * @param dpProofHash keccak256(agent, roundId, epsilon, delta, sigma, nonce) — DP proof
     */
    function submitGradient(
        uint256 roundId,
        string calldata cid,
        bytes32 updateHash,
        bytes32 dpProofHash
    ) external onlyActive {
        require(roundId <= currentRound, "Invalid round");
        require(!rounds[roundId].aggregationComplete, "Round closed");

        rounds[roundId].gradientCIDs[msg.sender] = cid;
        rounds[roundId].updateHashes[msg.sender] = updateHash;
        rounds[roundId].dpProofHashes[msg.sender] = dpProofHash;

        emit GradientSubmitted(roundId, msg.sender, cid, updateHash, dpProofHash);
    }

    /**
     * @notice Publish TEE aggregation results with full Krum + Trimmed Mean trace
     * @param roundId The round that was aggregated
     * @param globalModelCID 0G Storage CID of the new global model
     * @param aggHash SHA256(sorted_update_hashes || krum_scores || trimmed_indices || final_weights)
     * @param _proofHash SHA256 of the full TEE proof bundle JSON
     * @param _gradientMerkleRoot Merkle root of all submitted gradients
     * @param _globalModelHash SHA256 of global model weight bytes
     * @param teeProofCID 0G Storage CID of the tee_proof.json
     * @param dpEpsilonConsumed Rényi DP epsilon × 1e6 for this round
     */
    function publishAggregation(
        uint256 roundId,
        string calldata globalModelCID,
        bytes32 aggHash,
        bytes32 _proofHash,
        bytes32 _gradientMerkleRoot,
        bytes32 _globalModelHash,
        string calldata teeProofCID,
        uint256 dpEpsilonConsumed
    ) external onlyAggregator {
        TrainingRound storage r = rounds[roundId];
        require(!r.aggregationComplete, "Already aggregated");

        r.globalModelCID = globalModelCID;
        r.aggregationHash = aggHash;
        r.proofHash = _proofHash;
        r.gradientMerkleRoot = _gradientMerkleRoot;
        r.globalModelHash = _globalModelHash;
        r.modelVersionId = string(abi.encodePacked("round_", _uint2str(roundId), "_v", _bytes4hex(aggHash)));
        r.teeProofCID = teeProofCID;
        r.dpEpsilonConsumed = dpEpsilonConsumed;
        r.aggregationComplete = true;
        r.endTime = block.timestamp;

        emit AggregationComplete(
            roundId,
            globalModelCID,
            aggHash,
            _proofHash,
            _gradientMerkleRoot,
            r.modelVersionId,
            _globalModelHash,
            teeProofCID,
            dpEpsilonConsumed
        );
    }

    /**
     * @notice Submit autonomous decision with accuracy evidence
     * @param roundId The round being evaluated
     * @param decision "ACCEPT", "RETRAIN", or "REJECT"
     * @param decisionProofHash keccak256(agent, roundId, decision, localAccBps, globalAccBps, nonce)
     * @param localAccBps Local model accuracy in basis points (e.g. 8750 = 87.50%)
     * @param globalAccBps Global model accuracy in basis points
     */
    function submitDecision(
        uint256 roundId,
        string calldata decision,
        bytes32 decisionProofHash,
        uint256 localAccBps,
        uint256 globalAccBps
    ) external onlyActive {
        require(rounds[roundId].aggregationComplete, "Round not aggregated");

        rounds[roundId].decisions[msg.sender] = decision;
        rounds[roundId].decisionProofs[msg.sender] = decisionProofHash;
        rounds[roundId].localAccReports[msg.sender] = localAccBps;
        rounds[roundId].globalAccReports[msg.sender] = globalAccBps;

        emit AgentDecision(roundId, msg.sender, decision, decisionProofHash, localAccBps, globalAccBps);

        if (keccak256(bytes(decision)) == keccak256(bytes("ACCEPT"))) {
            agents[msg.sender].roundsAccepted++;
        }

        if (keccak256(bytes(decision)) == keccak256(bytes("REJECT"))) {
            agents[msg.sender].roundsRejected++;
            rounds[roundId].rejectCount++;

            uint256 total = rounds[roundId].participants.length;
            if (rounds[roundId].rejectCount * 2 > total && !rounds[roundId].governanceTriggered) {
                rounds[roundId].governanceTriggered = true;
                emit GovernanceTrigger(roundId, "majority_reject", rounds[roundId].rejectCount);
            }
        }
    }

    /**
     * @notice Report accuracy metrics (separate from decision for audit trail)
     */
    function reportAccuracy(
        uint256 roundId,
        uint256 localAcc,
        uint256 globalAcc
    ) external onlyActive {
        require(rounds[roundId].aggregationComplete, "Round not complete");
        rounds[roundId].localAccReports[msg.sender] = localAcc;
        rounds[roundId].globalAccReports[msg.sender] = globalAcc;
        emit AccuracyReported(roundId, msg.sender, localAcc, globalAcc);
        _updateReputation(msg.sender, globalAcc);
    }

    /**
     * @notice Distribute rewards to round participants
     */
    function distributeRewards(uint256 roundId) external {
        TrainingRound storage r = rounds[roundId];
        require(r.aggregationComplete, "Not complete");
        require(!r.rewardsDistributed, "Already distributed");
        require(!r.governanceTriggered, "Governance triggered, rewards frozen");

        r.rewardsDistributed = true;

        for (uint256 i = 0; i < r.participants.length; i++) {
            address agent = r.participants[i];
            if (bytes(r.gradientCIDs[agent]).length > 0) {
                uint256 reward = (agents[agent].reputation * 1e14) / 10000;
                if (reward > address(this).balance) reward = address(this).balance;
                if (reward > 0) {
                    agents[agent].roundsCompleted++;
                    payable(agent).transfer(reward);
                    emit RewardDistributed(roundId, agent, reward);
                }
            }
        }
    }

    /**
     * @notice Flag a round for governance
     */
    function flagRound(uint256 roundId, string calldata reason) external onlyActive {
        if (!rounds[roundId].governanceTriggered) {
            rounds[roundId].governanceTriggered = true;
            emit GovernanceTrigger(roundId, reason, rounds[roundId].rejectCount);
        }
    }

    /**
     * @notice Slash a misbehaving agent (Nash enforcement)
     */
    function slashAgent(address agent, string calldata reason) external onlyOwner {
        require(agents[agent].registered, "Agent not found");
        uint256 slashAmount = agents[agent].stake / 10;
        agents[agent].stake -= slashAmount;
        agents[agent].reputation = agents[agent].reputation > 500
            ? agents[agent].reputation - 500 : 0;
        if (agents[agent].reputation < 500) agents[agent].active = false;
        payable(owner).transfer(slashAmount);
        // Silence unused param warning
        reason;
    }

    // ─── View Functions ─────────────────────────────────────────

    function setAggregator(address _aggregator) external onlyOwner {
        aggregator = _aggregator;
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getRoundParticipants(uint256 roundId) external view returns (address[] memory) {
        return rounds[roundId].participants;
    }

    function getRoundInfo(uint256 roundId) external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 participantCount,
        bool aggregationComplete,
        bool rewardsDistributed,
        bool governanceTriggered,
        string memory globalModelCID,
        string memory modelVersionId
    ) {
        TrainingRound storage r = rounds[roundId];
        return (r.startTime, r.endTime, r.participants.length,
                r.aggregationComplete, r.rewardsDistributed, r.governanceTriggered,
                r.globalModelCID, r.modelVersionId);
    }

    function getAgentGradientCID(uint256 roundId, address agent) external view returns (string memory) {
        return rounds[roundId].gradientCIDs[agent];
    }

    function getAgentDecision(uint256 roundId, address agent) external view returns (
        string memory decision,
        bytes32 proofHash
    ) {
        return (rounds[roundId].decisions[agent], rounds[roundId].decisionProofs[agent]);
    }

    function getRejectCount(uint256 roundId) external view returns (uint256) {
        return rounds[roundId].rejectCount;
    }

    // ─── Internal ───────────────────────────────────────────────

    function _updateReputation(address agent, uint256 accuracy) internal {
        uint256 prev = agents[agent].reputation;
        if (accuracy > 7500) {
            agents[agent].reputation = prev + 100 < 10000 ? prev + 100 : 10000;
        } else if (accuracy < 5000) {
            agents[agent].reputation = prev > 200 ? prev - 200 : 0;
        }
    }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v; uint256 digits;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + uint256(v % 10))); v /= 10; }
        return string(buf);
    }

    function _bytes4hex(bytes32 b) internal pure returns (string memory) {
        bytes memory h = new bytes(8);
        bytes memory hex_ = "0123456789abcdef";
        for (uint i = 0; i < 4; i++) {
            h[i*2]   = hex_[uint8(b[i]) >> 4];
            h[i*2+1] = hex_[uint8(b[i]) & 0xf];
        }
        return string(h);
    }

    receive() external payable {}
    fallback() external payable {}
}
