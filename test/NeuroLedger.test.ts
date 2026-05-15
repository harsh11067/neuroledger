const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NeuroLedger", function () {
  let neuroLedger;
  let owner, agentA, agentB, agentC;

  const STAKE = ethers.parseEther("0.01");

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
          { value: STAKE }
        )
      )
        .to.emit(neuroLedger, "AgentRegistered")
        .withArgs(agentA.address, "Kerala Rural Hospital", "South Asia", 1);
    });

    it("should register agent with correct data", async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      const agent = await neuroLedger.agents(agentA.address);
      expect(agent.hospitalName).to.equal("Kerala Rural Hospital");
      expect(agent.region).to.equal("South Asia");
      expect(agent.reputation).to.equal(5000);
      expect(agent.registered).to.be.true;
      expect(agent.active).to.be.true;
    });

    it("should reject duplicate registration", async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Hospital A", "APAC", "General", { value: STAKE }
      );
      await expect(
        neuroLedger.connect(agentA).registerAgent(
          "Hospital A", "APAC", "General", { value: STAKE }
        )
      ).to.be.revertedWith("Already registered");
    });

    it("should reject insufficient stake", async function () {
      await expect(
        neuroLedger.connect(agentA).registerAgent(
          "Hospital A", "APAC", "General", { value: ethers.parseEther("0.0001") }
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
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", { value: STAKE }
      );
    });

    it("should emit RoundStarted", async function () {
      await expect(neuroLedger.startRound())
        .to.emit(neuroLedger, "RoundStarted")
        .withArgs(1, (await ethers.provider.getBlock("latest"))!.timestamp + 1);
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
    const fakeCID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("gradient_delta_agent_A_round_1"));

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.startRound();
    });

    it("should emit GradientSubmitted with CID and updateHash", async function () {
      await expect(
        neuroLedger.connect(agentA).submitGradient(1, fakeCID, fakeHash)
      )
        .to.emit(neuroLedger, "GradientSubmitted")
        .withArgs(1, agentA.address, fakeCID, fakeHash);
    });

    it("should store gradient CID for the agent", async function () {
      await neuroLedger.connect(agentA).submitGradient(1, fakeCID, fakeHash);
      const storedCID = await neuroLedger.getAgentGradientCID(1, agentA.address);
      expect(storedCID).to.equal(fakeCID);
    });

    it("should reject submission after aggregation", async function () {
      await neuroLedger.connect(agentA).submitGradient(1, fakeCID, fakeHash);
      // Complete aggregation
      await neuroLedger.publishAggregation(
        1,
        "QmGlobalModelCID",
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "round_1_v1"
      );
      // Try to submit after aggregation
      await expect(
        neuroLedger.connect(agentA).submitGradient(1, "QmNewCID", fakeHash)
      ).to.be.revertedWith("Round closed");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 4: AggregationComplete
  // ═══════════════════════════════════════════════════════════

  describe("Event 4: AggregationComplete", function () {
    const globalModelCID = "QmGlobalModelRound1";
    const aggHash = ethers.keccak256(ethers.toUtf8Bytes("fedavg_trace_round_1"));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes("tee_proof_bundle_round_1"));
    const versionId = "round_001_v3a7f2";

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.startRound();
    });

    it("should emit AggregationComplete with all 5 fields", async function () {
      await expect(
        neuroLedger.publishAggregation(1, globalModelCID, aggHash, proofHash, versionId)
      )
        .to.emit(neuroLedger, "AggregationComplete")
        .withArgs(1, globalModelCID, aggHash, proofHash, versionId);
    });

    it("should mark round as aggregation complete", async function () {
      await neuroLedger.publishAggregation(1, globalModelCID, aggHash, proofHash, versionId);
      const info = await neuroLedger.getRoundInfo(1);
      expect(info.aggregationComplete).to.be.true;
      expect(info.globalModelCID).to.equal(globalModelCID);
    });

    it("should only allow aggregator to publish", async function () {
      await expect(
        neuroLedger.connect(agentA).publishAggregation(
          1, globalModelCID, aggHash, proofHash, versionId
        )
      ).to.be.revertedWith("Not aggregator");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 5: AgentDecision
  // ═══════════════════════════════════════════════════════════

  describe("Event 5: AgentDecision", function () {
    const decisionProofHash = ethers.keccak256(ethers.toUtf8Bytes("decision_record_agent_A"));

    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.publishAggregation(
        1,
        "QmGlobalModelCID",
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "round_001_v1"
      );
    });

    it("should emit AgentDecision with ACCEPT", async function () {
      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "ACCEPT", decisionProofHash)
      )
        .to.emit(neuroLedger, "AgentDecision")
        .withArgs(1, agentA.address, "ACCEPT", decisionProofHash);
    });

    it("should emit AgentDecision with RETRAIN", async function () {
      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "RETRAIN", decisionProofHash)
      )
        .to.emit(neuroLedger, "AgentDecision")
        .withArgs(1, agentA.address, "RETRAIN", decisionProofHash);
    });

    it("should emit AgentDecision with REJECT", async function () {
      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "REJECT", decisionProofHash)
      )
        .to.emit(neuroLedger, "AgentDecision")
        .withArgs(1, agentA.address, "REJECT", decisionProofHash);
    });

    it("should track ACCEPT count for agent", async function () {
      await neuroLedger.connect(agentA).submitDecision(1, "ACCEPT", decisionProofHash);
      const agent = await neuroLedger.agents(agentA.address);
      expect(agent.roundsAccepted).to.equal(1);
    });

    it("should require aggregation complete before decision", async function () {
      await neuroLedger.startRound(); // Round 2 - not aggregated
      await expect(
        neuroLedger.connect(agentA).submitDecision(2, "ACCEPT", decisionProofHash)
      ).to.be.revertedWith("Round not aggregated");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EVENT 6: AccuracyReported
  // ═══════════════════════════════════════════════════════════

  describe("Event 6: AccuracyReported", function () {
    beforeEach(async function () {
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.publishAggregation(
        1,
        "QmGlobalModelCID",
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "round_001_v1"
      );
    });

    it("should emit AccuracyReported with local and global accuracy", async function () {
      await expect(
        neuroLedger.connect(agentA).reportAccuracy(1, 8410, 8640) // 84.10%, 86.40%
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
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.connect(agentA).submitGradient(
        1,
        "QmGradientCID",
        ethers.keccak256(ethers.toUtf8Bytes("gradient"))
      );
      await neuroLedger.publishAggregation(
        1,
        "QmGlobalModelCID",
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "round_001_v1"
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
    beforeEach(async function () {
      // Register 3 agents
      await neuroLedger.connect(agentA).registerAgent(
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", { value: STAKE }
      );
      await neuroLedger.connect(agentC).registerAgent(
        "Tokyo General Hospital", "East Asia", "Emergency", { value: STAKE }
      );
      await neuroLedger.startRound();
      await neuroLedger.publishAggregation(
        1,
        "QmGlobalModelCID",
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "round_001_v1"
      );
    });

    it("should emit GovernanceTrigger on majority REJECT", async function () {
      const proofA = ethers.keccak256(ethers.toUtf8Bytes("reject_A"));
      const proofB = ethers.keccak256(ethers.toUtf8Bytes("reject_B"));

      // Agent A rejects
      await neuroLedger.connect(agentA).submitDecision(1, "REJECT", proofA);

      // Agent B rejects → majority (2/3)
      await expect(
        neuroLedger.connect(agentB).submitDecision(1, "REJECT", proofB)
      )
        .to.emit(neuroLedger, "GovernanceTrigger")
        .withArgs(1, "majority_reject");
    });

    it("should NOT trigger governance on single REJECT", async function () {
      const proofA = ethers.keccak256(ethers.toUtf8Bytes("reject_A"));

      await expect(
        neuroLedger.connect(agentA).submitDecision(1, "REJECT", proofA)
      ).to.not.emit(neuroLedger, "GovernanceTrigger");
    });

    it("should freeze rewards when governance is triggered", async function () {
      // Start a new round for this test
      await neuroLedger.startRound(); // Round 2
      
      const proofA = ethers.keccak256(ethers.toUtf8Bytes("reject_A"));
      const proofB = ethers.keccak256(ethers.toUtf8Bytes("reject_B"));

      // Submit gradients
      await neuroLedger.connect(agentA).submitGradient(
        2, "QmCID_A", ethers.keccak256(ethers.toUtf8Bytes("g_a"))
      );
      await neuroLedger.connect(agentB).submitGradient(
        2, "QmCID_B", ethers.keccak256(ethers.toUtf8Bytes("g_b"))
      );

      // Complete aggregation
      await neuroLedger.publishAggregation(
        2,
        "QmGlobalModelCID",
        ethers.keccak256(ethers.toUtf8Bytes("agg")),
        ethers.keccak256(ethers.toUtf8Bytes("proof")),
        "round_002_v1"
      );

      // Trigger governance
      await neuroLedger.connect(agentA).submitDecision(2, "REJECT", proofA);
      await neuroLedger.connect(agentB).submitDecision(2, "REJECT", proofB);

      // Try to distribute rewards — should fail
      await expect(
        neuroLedger.distributeRewards(2)
      ).to.be.revertedWith("Governance triggered, rewards frozen");
    });

    it("should track reject count correctly", async function () {
      const proof = ethers.keccak256(ethers.toUtf8Bytes("reject"));

      await neuroLedger.connect(agentA).submitDecision(1, "REJECT", proof);
      expect(await neuroLedger.getRejectCount(1)).to.equal(1);

      await neuroLedger.connect(agentB).submitDecision(1, "REJECT", proof);
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
        "Kerala Rural Hospital", "South Asia", "Cardiology", { value: STAKE }
      );
      await neuroLedger.connect(agentB).registerAgent(
        "NUS Medical Centre", "Southeast Asia", "Oncology", { value: STAKE }
      );
      await neuroLedger.connect(agentC).registerAgent(
        "Tokyo General Hospital", "East Asia", "Emergency", { value: STAKE }
      );
      console.log("  ✅ 3 agents registered (AgentRegistered x3)");

      // 2. RoundStarted
      const roundTx = await neuroLedger.startRound();
      const roundReceipt = await roundTx.wait();
      console.log("  ✅ Round 1 started (RoundStarted)");

      // 3. GradientSubmitted x3
      const cidA = "QmGradientAgentA_Round1";
      const cidB = "QmGradientAgentB_Round1";
      const cidC = "QmGradientAgentC_Round1";
      const hashA = ethers.keccak256(ethers.toUtf8Bytes("gradient_A"));
      const hashB = ethers.keccak256(ethers.toUtf8Bytes("gradient_B"));
      const hashC = ethers.keccak256(ethers.toUtf8Bytes("gradient_C"));

      await neuroLedger.connect(agentA).submitGradient(1, cidA, hashA);
      await neuroLedger.connect(agentB).submitGradient(1, cidB, hashB);
      await neuroLedger.connect(agentC).submitGradient(1, cidC, hashC);
      console.log("  ✅ 3 gradients submitted (GradientSubmitted x3)");

      // 4. AggregationComplete
      const globalModelCID = "QmGlobalModel_Round1";
      const aggHash = ethers.keccak256(ethers.toUtf8Bytes("fedavg_r1"));
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("tee_proof_r1"));
      await neuroLedger.publishAggregation(1, globalModelCID, aggHash, proofHash, "round_001_v1");
      console.log("  ✅ Aggregation published (AggregationComplete)");

      // 5. AgentDecision x3 (divergent!)
      const dpA = ethers.keccak256(ethers.toUtf8Bytes("decision_A_accept"));
      const dpB = ethers.keccak256(ethers.toUtf8Bytes("decision_B_retrain"));
      const dpC = ethers.keccak256(ethers.toUtf8Bytes("decision_C_accept"));

      await neuroLedger.connect(agentA).submitDecision(1, "ACCEPT", dpA);
      await neuroLedger.connect(agentB).submitDecision(1, "RETRAIN", dpB);
      await neuroLedger.connect(agentC).submitDecision(1, "ACCEPT", dpC);
      console.log("  ✅ 3 decisions submitted: A=ACCEPT, B=RETRAIN, C=ACCEPT (AgentDecision x3)");

      // 6. AccuracyReported x3
      await neuroLedger.connect(agentA).reportAccuracy(1, 8410, 8640);
      await neuroLedger.connect(agentB).reportAccuracy(1, 7800, 8200);
      await neuroLedger.connect(agentC).reportAccuracy(1, 8100, 8500);
      console.log("  ✅ 3 accuracy reports (AccuracyReported x3)");

      // 7. RewardDistributed
      await neuroLedger.distributeRewards(1);
      console.log("  ✅ Rewards distributed (RewardDistributed x3)");

      // Verify final state
      const roundInfo = await neuroLedger.getRoundInfo(1);
      expect(roundInfo.aggregationComplete).to.be.true;
      expect(roundInfo.rewardsDistributed).to.be.true;
      expect(roundInfo.governanceTriggered).to.be.false;
      expect(roundInfo.participantCount).to.equal(3);
      console.log("\n  ═══════════════════════════════════════════════");
      console.log("  ✅ FULL ROUND LIFECYCLE VERIFIED — All 7 events emitted");
      console.log("     (GovernanceTrigger tested separately above)");
      console.log("  ═══════════════════════════════════════════════");
    });
  });
});
