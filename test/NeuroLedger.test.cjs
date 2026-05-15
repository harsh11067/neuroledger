const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NeuroLedger", function () {
  let neuroLedger;
  let owner, agentA, agentB, agentC;

  const STAKE = ethers.parseEther("0.01");
  // Default decision thresholds (50 bps = 0.50% accept, 20 bps = 0.20% retrain floor)
  const ACCEPT_BPS = 50;
  const RETRAIN_BPS = 20;

  beforeEach(async function () {
    [owner, agentA, agentB, agentC] = await ethers.getSigners();
    const NeuroLedgerFactory = await ethers.getContractFactory("NeuroLedger");
    neuroLedger = await NeuroLedgerFactory.deploy();
    await neuroLedger.waitForDeployment();

    // Fund contract for rewards
    await owner.sendTransaction({
      to: await neuroLedger.getAddress(),
      value: ethers.parseEther("1.0"),
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 1: AgentRegistered
  // ═══════════════════════════════════════════════════════════

  describe("Event 1: AgentRegistered", function () {
    it("should emit AgentRegistered on agent registration", async function () {
      await expect(
        neuroLedger.connect(agentA).registerAgent(
          "Kerala Rural Hospital",
          "South Asia",
          "Cardiology",
          ACCEPT_BPS,
          RETRAIN_BPS,
          { value: STAKE }
        )
      )
        .to.emit(neuroLedger, "AgentRegistered")
        .withArgs(agentA.address, "Kerala Rural Hospital", "South Asia", 1, ACCEPT_BPS, RETRAIN_BPS);
    });

    it("should register agent with correct data", async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      const agent = await neuroLedger.agents(agentA.address);
      expect(agent.hospitalName).to.equal("Kerala Rural Hospital");
      expect(agent.region).to.equal("South Asia");
      expect(agent.reputation).to.equal(5000);
      expect(agent.registered).to.be.true;
      expect(agent.active).to.be.true;
      expect(agent.acceptThresholdBps).to.equal(ACCEPT_BPS);
      expect(agent.retrainThresholdBps).to.equal(RETRAIN_BPS);
    });

    it("should reject duplicate registration", async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Hospital A", "APAC", "General", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await expect(
        neuroLedger.connect(agentA).registerAgent(
          "Hospital A", "APAC", "General", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
        )
      ).to.be.revertedWith("Already registered");
    });

    it("should reject insufficient stake", async function () {
      await expect(
        neuroLedger.connect(agentA).registerAgent(
          "Hospital A", "APAC", "General", ACCEPT_BPS, RETRAIN_BPS, { value: ethers.parseEther("0.0001") }
        )
      ).to.be.revertedWith("Insufficient stake");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 2: RoundStarted
  // ═══════════════════════════════════════════════════════════

  describe("Event 2: RoundStarted", function () {
    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
    });

    it("should emit RoundStarted", async function () {
      await expect(neuroLedger.startRound())
        .to.emit(neuroLedger, "RoundStarted")
        .withArgs(1, (await ethers.provider.getBlock("latest")).timestamp + 1);
    });

    it("should enroll active agents with sufficient reputation", async function () {
      await neuroLedger.startRound();
      const participants = await neuroLedger.getRoundParticipants(1);
      expect(participants.length).to.equal(2);
      expect(participants).to.include(agentA.address);
      expect(participants).to.include(agentB.address);
    });

    it("should increment round counter", async function () {
      await neuroLedger.startRound();
      expect(await neuroLedger.currentRound()).to.equal(1);
      await neuroLedger.startRound();
      expect(await neuroLedger.currentRound()).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 3: GradientSubmitted
  // ═══════════════════════════════════════════════════════════

  describe("Event 3: GradientSubmitted", function () {
    const fakeCID = "0g-" + "a".repeat(64);
    const fakeUpdateHash = ethers.keccak256(ethers.toUtf8Bytes("gradient_delta_agent_A_round_1"));
    const fakeDpProofHash = ethers.keccak256(ethers.toUtf8Bytes("dp_proof_agent_A_round_1_eps1"));

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.startRound();
    });

    it("should emit GradientSubmitted with CID, updateHash, and dpProofHash", async function () {
      await expect(
        neuroLedger.connect(agentA).submitGradient(1, fakeCID, fakeUpdateHash, fakeDpProofHash)
      )
        .to.emit(neuroLedger, "GradientSubmitted")
        .withArgs(1, agentA.address, fakeCID, fakeUpdateHash, fakeDpProofHash);
    });

    it("should store gradient CID for the agent", async function () {
      await neuroLedger.connect(agentA).submitGradient(1, fakeCID, fakeUpdateHash, fakeDpProofHash);
      const storedCID = await neuroLedger.getAgentGradientCID(1, agentA.address);
      expect(storedCID).to.equal(fakeCID);
    });

    it("should reject submission after aggregation", async function () {
      await neuroLedger.connect(agentA).submitGradient(1, fakeCID, fakeUpdateHash, fakeDpProofHash);
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("merkle_root_1"));
      const modelHash = ethers.keccak256(ethers.toUtf8Bytes("model_hash_1"));
      await neuroLedger.publishAggregation(
        1,
        "0g-" + "b".repeat(64),
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        merkleRoot,
        modelHash,
        "0g-" + "c".repeat(64),
        1000000
      );
      await expect(
        neuroLedger.connect(agentA).submitGradient(1, "0g-new", fakeUpdateHash, fakeDpProofHash)
      ).to.be.revertedWith("Round closed");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 4: AggregationComplete
  // ═══════════════════════════════════════════════════════════

  describe("Event 4: AggregationComplete", function () {
    const globalModelCID = "0g-" + "d".repeat(64);
    const aggHash = ethers.keccak256(ethers.toUtf8Bytes("krum_trimmed_mean_trace_round_1"));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("tee_proof_bundle_round_1"));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("gradient_merkle_root_1"));
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("global_model_sha256_round_1"));
    const teeProofCID = "0g-" + "e".repeat(64);
    const dpEpsilon = 1000000; // ε=1.0 × 1e6

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.startRound();
    });

    it("should emit AggregationComplete with all fields", async function () {
      await expect(
        neuroLedger.publishAggregation(1, globalModelCID, aggHash, proofHash, merkleRoot, modelHash, teeProofCID, dpEpsilon)
      )
        .to.emit(neuroLedger, "AggregationComplete")
        .withArgs(
          1, globalModelCID, aggHash, proofHash, merkleRoot,
          // modelVersionId is auto-generated from roundId + first 4 bytes of aggHash
          await getExpectedVersionId(1, aggHash),
          modelHash, teeProofCID, dpEpsilon
        );
    });

    it("should mark round as aggregation complete", async function () {
      await neuroLedger.publishAggregation(1, globalModelCID, aggHash, proofHash, merkleRoot, modelHash, teeProofCID, dpEpsilon);
      const info = await neuroLedger.getRoundInfo(1);
      expect(info.aggregationComplete).to.be.true;
      expect(info.globalModelCID).to.equal(globalModelCID);
    });

    it("should only allow aggregator to publish", async function () {
      await expect(
        neuroLedger.connect(agentA).publishAggregation(
          1, globalModelCID, aggHash, proofHash, merkleRoot, modelHash, teeProofCID, dpEpsilon
        )
      ).to.be.revertedWith("Not aggregator");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 5: AgentDecision
  // ═══════════════════════════════════════════════════════════

  describe("Event 5: AgentDecision", function () {
    const decisionProofHash = ethers.keccak256(ethers.toUtf8Bytes("decision_proof_agent_A_round_1"));
    const localAccBps = 8410;   // 84.10%
    const globalAccBps = 8640;  // 86.40%

    const aggParams = () => [
      "0g-" + "f".repeat(64),
      ethers.keccak256(ethers.toUtf8Bytes("agg")),
      ethers.keccak256(ethers.toUtf8Bytes("proof")),
      ethers.keccak256(ethers.toUtf8Bytes("merkle")),
      ethers.keccak256(ethers.toUtf8Bytes("model")),
      "0g-" + "g".repeat(64),
      1000000
    ];

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.publishAggregation(1, ...aggParams());
    });

    it("should emit AgentDecision with ACCEPT", async function () {
      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "ACCEPT", decisionProofHash, localAccBps, globalAccBps)
      )
        .to.emit(neuroLedger, "AgentDecision")
        .withArgs(1, agentA.address, "ACCEPT", decisionProofHash, localAccBps, globalAccBps);
    });

    it("should emit AgentDecision with RETRAIN", async function () {
      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "RETRAIN", decisionProofHash, localAccBps, globalAccBps)
      )
        .to.emit(neuroLedger, "AgentDecision")
        .withArgs(1, agentA.address, "RETRAIN", decisionProofHash, localAccBps, globalAccBps);
    });

    it("should emit AgentDecision with REJECT", async function () {
      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "REJECT", decisionProofHash, localAccBps, globalAccBps)
      )
        .to.emit(neuroLedger, "AgentDecision")
        .withArgs(1, agentA.address, "REJECT", decisionProofHash, localAccBps, globalAccBps);
    });

    it("should track ACCEPT count for agent", async function () {
      await neuroLedger.connect(agentA).submitDecision(1, "ACCEPT", decisionProofHash, localAccBps, globalAccBps);
      const agent = await neuroLedger.agents(agentA.address);
      expect(agent.roundsAccepted).to.equal(1);
    });

    it("should require aggregation complete before decision", async function () {
      await neuroLedger.startRound(); // Round 2 - not aggregated
      await expect(
        neuroLedger.connect(agentA).submitDecision(2, "ACCEPT", decisionProofHash, localAccBps, globalAccBps)
      ).to.be.revertedWith("Round not aggregated");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 6: AccuracyReported
  // ═══════════════════════════════════════════════════════════

  describe("Event 6: AccuracyReported", function () {
    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.publishAggregation(
        1,
        "0g-" + "h".repeat(64),
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        ethers.keccak256(ethers.toUtf8Bytes("merkle")),
        ethers.keccak256(ethers.toUtf8Bytes("model")),
        "0g-" + "i".repeat(64),
        1000000
      );
    });

    it("should emit AccuracyReported with local and global accuracy", async function () {
      await expect(
        neuroLedger.connect(agentA).reportAccuracy(1, 8410, 8640)
      )
        .to.emit(neuroLedger, "AccuracyReported")
        .withArgs(1, agentA.address, 8410, 8640);
    });

    it("should update reputation for high accuracy", async function () {
      const agentBefore = await neuroLedger.agents(agentA.address);
      await neuroLedger.connect(agentA).reportAccuracy(1, 8410, 8640);
      const agentAfter = await neuroLedger.agents(agentA.address);
      expect(agentAfter.reputation).to.be.greaterThan(agentBefore.reputation);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 7: RewardDistributed
  // ═══════════════════════════════════════════════════════════

  describe("Event 7: RewardDistributed", function () {
    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.connect(agentA).submitGradient(
        1,
        "0g-" + "j".repeat(64),
        ethers.keccak256(ethers.toUtf8Bytes("gradient")),
        ethers.keccak256(ethers.toUtf8Bytes("dp_proof"))
      );
      await neuroLedger.publishAggregation(
        1,
        "0g-" + "k".repeat(64),
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        ethers.keccak256(ethers.toUtf8Bytes("merkle")),
        ethers.keccak256(ethers.toUtf8Bytes("model")),
        "0g-" + "l".repeat(64),
        1000000
      );
    });

    it("should emit RewardDistributed for participating agents", async function () {
      await expect(neuroLedger.distributeRewards(1))
        .to.emit(neuroLedger, "RewardDistributed")
        .withArgs(1, agentA.address, (5000n * 10n ** 14n) / 10000n);
    });

    it("should prevent double distribution", async function () {
      await neuroLedger.distributeRewards(1);
      await expect(
        neuroLedger.distributeRewards(1)
      ).to.be.revertedWith("Already distributed");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 8: GovernanceTrigger
  // ═══════════════════════════════════════════════════════════

  describe("Event 8: GovernanceTrigger", function () {
    const aggParams = () => [
      "0g-" + "m".repeat(64),
      ethers.keccak256(ethers.toUtf8Bytes("agg")),
      ethers.keccak256(ethers.toUtf8Bytes("proof")),
      ethers.keccak256(ethers.toUtf8Bytes("merkle")),
      ethers.keccak256(ethers.toUtf8Bytes("model")),
      "0g-" + "n".repeat(64),
      1000000
    ];

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.connect(agentC).registerAgent(
        "Tokyo General Hospital", "East Asia", "Emergency", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.publishAggregation(1, ...aggParams());
    });

    it("should emit GovernanceTrigger on majority REJECT", async function () {
      const proofA = ethers.keccak256(ethers.toUtf8Bytes("reject_A"));
      const proofB = ethers.keccak256(ethers.toUtf8Bytes("reject_B"));

      await neuroLedger.connect(agentA).submitDecision(1, "REJECT", proofA, 7000, 6500);

      await expect(
        neuroLedger.connect(agentB).submitDecision(1, "REJECT", proofB, 7200, 6500)
      )
        .to.emit(neuroLedger, "GovernanceTrigger")
        .withArgs(1, "majority_reject", 2);
    });

    it("should NOT trigger governance on single REJECT", async function () {
      const proofA = ethers.keccak256(ethers.toUtf8Bytes("reject_A"));

      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "REJECT", proofA, 7000, 6500)
      ).to.not.emit(neuroLedger, "GovernanceTrigger");
    });

    it("should freeze rewards when governance is triggered", async function () {
      await neuroLedger.startRound(); // Round 2

      const proofA = ethers.keccak256(ethers.toUtf8Bytes("reject_A"));
      const proofB = ethers.keccak256(ethers.toUtf8Bytes("reject_B"));
      const dpProof = ethers.keccak256(ethers.toUtf8Bytes("dp_proof"));

      await neuroLedger.connect(agentA).submitGradient(
        2, "0g-" + "o".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("g_a")), dpProof
      );
      await neuroLedger.connect(agentB).submitGradient(
        2, "0g-" + "p".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("g_b")), dpProof
      );

      await neuroLedger.publishAggregation(2, ...aggParams());

      await neuroLedger.connect(agentA).submitDecision(2, "REJECT", proofA, 7000, 6500);
      await neuroLedger.connect(agentB).submitDecision(2, "REJECT", proofB, 7200, 6500);

      await expect(
        neuroLedger.distributeRewards(2)
      ).to.be.revertedWith("Governance triggered, rewards frozen");
    });

    it("should track reject count correctly", async function () {
      const proof = ethers.keccak256(ethers.toUtf8Bytes("reject"));

      await neuroLedger.connect(agentA).submitDecision(1, "REJECT", proof, 7000, 6500);
      expect(await neuroLedger.getRejectCount(1)).to.equal(1);

      await neuroLedger.connect(agentB).submitDecision(1, "REJECT", proof, 7200, 6500);
      expect(await neuroLedger.getRejectCount(1)).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  FULL ROUND LIFECYCLE (Integration)
  // ═══════════════════════════════════════════════════════════

  describe("Full Round Lifecycle", function () {
    it("should complete a full round with all 8 events", async function () {
      // 1. AgentRegistered x3
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology",
        150, 20, { value: STAKE }  // 1.5% accept, 0.2% retrain
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology",
        50, 20, { value: STAKE }
      );
      await neuroLedger.connect(agentC).registerAgent(
        "Tokyo General Hospital", "East Asia", "Emergency",
        30, 10, { value: STAKE }
      );

      // 2. RoundStarted
      await neuroLedger.startRound();
      const participants = await neuroLedger.getRoundParticipants(1);
      expect(participants.length).to.equal(3);

      // 3. GradientSubmitted x3
      const dpProof = ethers.keccak256(ethers.toUtf8Bytes("dp_proof_batch"));
      await neuroLedger.connect(agentA).submitGradient(1, "0g-" + "1".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("gA")), dpProof);
      await neuroLedger.connect(agentB).submitGradient(1, "0g-" + "2".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("gB")), dpProof);
      await neuroLedger.connect(agentC).submitGradient(1, "0g-" + "3".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("gC")), dpProof);

      // 4. AggregationComplete
      const aggHash = ethers.keccak256(ethers.toUtf8Bytes("krum_trace"));
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("bundle"));
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("merkle_r"));
      const modelHash = ethers.keccak256(ethers.toUtf8Bytes("model_sha"));
      await neuroLedger.publishAggregation(
        1, "0g-" + "4".repeat(64), aggHash, proofHash, merkleRoot, modelHash, "0g-" + "5".repeat(64), 1000000
      );

      // 5. AgentDecision x3 (divergent)
      await neuroLedger.connect(agentA).submitDecision(1, "ACCEPT", ethers.keccak256(ethers.toUtf8Bytes("dpA")), 8410, 8640);
      await neuroLedger.connect(agentB).submitDecision(1, "RETRAIN", ethers.keccak256(ethers.toUtf8Bytes("dpB")), 8200, 8400);
      await neuroLedger.connect(agentC).submitDecision(1, "ACCEPT", ethers.keccak256(ethers.toUtf8Bytes("dpC")), 8500, 8640);

      // 6. AccuracyReported x3
      await neuroLedger.connect(agentA).reportAccuracy(1, 8410, 8640);
      await neuroLedger.connect(agentB).reportAccuracy(1, 8200, 8400);
      await neuroLedger.connect(agentC).reportAccuracy(1, 8500, 8640);

      // 7. RewardDistributed
      await expect(neuroLedger.distributeRewards(1))
        .to.emit(neuroLedger, "RewardDistributed");

      // Verify final state
      const info = await neuroLedger.getRoundInfo(1);
      expect(info.aggregationComplete).to.be.true;
      expect(info.rewardsDistributed).to.be.true;
      expect(info.governanceTriggered).to.be.false;
    });

    it("should trigger governance when majority REJECT", async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala", "APAC", "Gen", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS", "APAC", "Gen", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );
      await neuroLedger.connect(agentC).registerAgent(
        "Tokyo", "APAC", "Gen", ACCEPT_BPS, RETRAIN_BPS, { value: STAKE }
      );

      await neuroLedger.startRound();

      const dpProof = ethers.keccak256(ethers.toUtf8Bytes("dp"));
      const aggHash = ethers.keccak256(ethers.toUtf8Bytes("agg"));
      await neuroLedger.connect(agentA).submitGradient(1, "0g-" + "a".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("ga")), dpProof);
      await neuroLedger.connect(agentB).submitGradient(1, "0g-" + "b".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("gb")), dpProof);
      await neuroLedger.connect(agentC).submitGradient(1, "0g-" + "c".repeat(64), ethers.keccak256(ethers.toUtf8Bytes("gc")), dpProof);

      await neuroLedger.publishAggregation(
        1, "0g-" + "d".repeat(64), aggHash,
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        ethers.keccak256(ethers.toUtf8Bytes("merkle")),
        ethers.keccak256(ethers.toUtf8Bytes("model")),
        "0g-" + "e".repeat(64), 1000000
      );

      const rejProof = ethers.keccak256(ethers.toUtf8Bytes("reject_proof"));
      await neuroLedger.connect(agentA).submitDecision(1, "REJECT", rejProof, 5000, 4500);
      await neuroLedger.connect(agentB).submitDecision(1, "REJECT", rejProof, 5100, 4500);

      const info = await neuroLedger.getRoundInfo(1);
      expect(info.governanceTriggered).to.be.true;
    });
  });
});

// Helper: compute the expected modelVersionId the contract generates
async function getExpectedVersionId(roundId, aggHash) {
  // Contract builds: "round_" + roundId + "_v" + first 4 bytes of aggHash as hex
  const hashHex = aggHash.slice(2); // remove "0x"
  const first8chars = hashHex.slice(0, 8);
  return `round_${roundId}_v${first8chars}`;
}
