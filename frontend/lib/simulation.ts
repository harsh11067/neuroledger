/**
 * NeuroLedger Simulation Engine
 * Full federated learning lifecycle: agents → training → TEE → decisions → governance
 */

export type AgentStatus = 'IDLE' | 'TRAINING' | 'ENCRYPTING' | 'UPLOADING' | 'VERIFYING' | 'DECIDING';
export type Decision = 'ACCEPT' | 'RETRAIN' | 'REJECT';
export type RoundPhase = 'IDLE' | 'TRAINING' | 'ENCRYPTING' | 'UPLOADING' | 'TEE_AGGREGATING' | 'PROVING' | 'EVALUATING' | 'DECIDING' | 'COMPLETE';

export interface SimAgent {
  id: string;
  address: string;
  name: string;
  region: string;
  specialization: string;
  stake: string;
  reputation: number;
  status: AgentStatus;
  acceptThreshold: number;
  retrainThreshold: number;
  datasetSize: number;
  roundsCompleted: number;
  roundsAccepted: number;
  roundsRejected: number;
  decisionHistory: Decision[];
  localAccuracy: number;
  tokenId: number;
}

export interface RoundResult {
  roundId: number;
  timestamp: number;
  globalAccuracy: number;
  prevGlobalAccuracy: number;
  agentResults: AgentRoundResult[];
  proofBundle: ProofBundle;
  governanceTriggered: boolean;
  events: SimEvent[];
}

export interface AgentRoundResult {
  agentId: string;
  agentName: string;
  decision: Decision;
  improvement: number;
  localAcc: number;
  globalAccNew: number;
  updateHash: string;
  decisionProofHash: string;
  gradientCID: string;
  teeSignature?: string;
}

export interface ProofBundle {
  updateHashes: string[];
  aggregationHash: string;
  proofHash: string;
  modelVersionId: string;
  globalModelHash: string;
  globalModelCID: string;
  proofCID: string;
  mrenclave: string;
  teeSignature: string;
  timestamp: number;
  inferenceEndpoint?: string;
}

export interface SimEvent {
  id: number;
  block: number;
  type: string;
  agent: string;
  round: number;
  tx: string;
  timestamp: number;
  data?: Record<string, string | number>;
}

export interface StorageArtifact {
  name: string;
  type: 'file' | 'folder';
  size?: string;
  cid?: string;
  anchorHash?: string;
  anchorEvent?: string;
  time?: string;
  uploader?: string;
  children?: StorageArtifact[];
}

// Deterministic 64-char hex hash — "0x" + 64 hex chars (matches SHA256 output format)
function simHash64(seed: number): string {
  const chars = '0123456789abcdef';
  let h = '';
  let s = seed;
  for (let i = 0; i < 64; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    h += chars[s % 16];
  }
  return `0x${h}`;
}

// Legacy short hash kept for internal labels only (not exposed in UI)
function simHash(prefix: string, seed: number): string {
  return simHash64(seed * 31337);
}

// 0G Storage CID: "0g-" + 64 hex chars (content-addressed SHA256 format)
function simCID(seed: number): string {
  const chars = '0123456789abcdef';
  let h = '';
  let s = seed + 999983;
  for (let i = 0; i < 64; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    h += chars[s % 16];
  }
  return `0g-${h}`;
}

// Full 66-char tx hash for display (real on-chain format)
function simTxHash(seed: number): string {
  return simHash64(seed * 6271);
}

let eventIdCounter = 0;
let blockCounter = 148900;

export class SimulationEngine {
  agents: SimAgent[] = [];
  rounds: RoundResult[] = [];
  currentRound = 0;
  globalAccuracy = 45;
  events: SimEvent[] = [];
  storageArtifacts: StorageArtifact[] = [];
  listeners: Set<() => void> = new Set();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  registerAgent(config: {
    name: string;
    region: string;
    specialization: string;
    datasetSize: number;
    acceptThreshold: number;
    retrainThreshold: number;
  }): SimAgent {
    const tokenId = this.agents.length + 1;
    const addr = simHash('A' + tokenId, tokenId * 9973);
    const agent: SimAgent = {
      id: `agent_${tokenId}`,
      address: addr,
      name: config.name,
      region: config.region,
      specialization: config.specialization,
      stake: `${(config.datasetSize / 1000).toFixed(0)}k A0GI`,
      reputation: 5000,
      status: 'IDLE',
      acceptThreshold: config.acceptThreshold,
      retrainThreshold: config.retrainThreshold,
      datasetSize: config.datasetSize,
      roundsCompleted: 0,
      roundsAccepted: 0,
      roundsRejected: 0,
      decisionHistory: [],
      localAccuracy: 40 + Math.random() * 10,
      tokenId,
    };
    this.agents.push(agent);

    const block = ++blockCounter;
    this.events.push({
      id: ++eventIdCounter, block, type: 'AgentRegistered',
      agent: agent.name, round: 0,
      tx: simTxHash(tokenId * 1337), timestamp: Date.now(),
      data: { hospitalName: config.name, region: config.region, tokenId },
    });
    this.notify();
    return agent;
  }

  async runRound(onPhaseChange?: (phase: RoundPhase, progress: number) => void): Promise<RoundResult> {
    if (this.agents.length === 0) throw new Error('No agents registered');

    this.currentRound++;
    const roundId = this.currentRound;
    const prevAcc = this.globalAccuracy;

    // Phase: TRAINING
    onPhaseChange?.('TRAINING', 0);
    this.agents.forEach(a => { a.status = 'TRAINING'; });
    this.notify();
    this.events.push({
      id: ++eventIdCounter, block: ++blockCounter, type: 'RoundStarted',
      agent: 'SYSTEM', round: roundId,
      tx: simTxHash(roundId * 2657), timestamp: Date.now(),
    });
    
    // Simulate local training steps per agent
    for (let i = 0; i <= 100; i += 20) {
      onPhaseChange?.('TRAINING', i * 0.3);
      await this.delay(300);
    }

    // Phase: ENCRYPTING
    onPhaseChange?.('ENCRYPTING', 40);
    this.agents.forEach(a => { a.status = 'ENCRYPTING'; });
    this.notify();
    await this.delay(1000);

    // Phase: UPLOADING
    onPhaseChange?.('UPLOADING', 50);
    this.agents.forEach(a => { a.status = 'UPLOADING'; });
    this.notify();

    const agentResults: AgentRoundResult[] = [];
    for (const agent of this.agents) {
      const updateHash = simHash('uh', roundId * 100 + agent.tokenId);
      const cid = simCID(roundId * 100 + agent.tokenId);
      const block = ++blockCounter;
      this.events.push({
        id: ++eventIdCounter, block, type: 'GradientSubmitted',
        agent: agent.name, round: roundId,
        tx: simTxHash(roundId * 1000 + agent.tokenId),
        timestamp: Date.now(),
        data: { cid, updateHash },
      });
      agentResults.push({
        agentId: agent.id, agentName: agent.name,
        decision: 'ACCEPT', improvement: 0,
        localAcc: 0, globalAccNew: 0,
        updateHash, decisionProofHash: '', gradientCID: cid,
      });
      await this.delay(200); // Sequential uploads
    }
    this.notify();

    // Phase: TEE_AGGREGATING
    onPhaseChange?.('TEE_AGGREGATING', 60);
    this.agents.forEach(a => { a.status = 'VERIFYING'; });
    this.notify();
    // Simulate enclave initialization
    await this.delay(800);
    // Simulate FedAvg computation
    onPhaseChange?.('TEE_AGGREGATING', 65);
    await this.delay(1200);

    // Phase: PROVING
    onPhaseChange?.('PROVING', 70);
    const accGain = (Math.random() * 6 - 1.5) * (1 / Math.sqrt(roundId));
    const newGlobalAcc = Math.min(98.5, Math.max(prevAcc - 2, prevAcc + accGain));
    this.globalAccuracy = newGlobalAcc;

    const globalModelCID = simCID(roundId * 9999);
    const proofCID = simCID(roundId * 5555);
    const proofBundle: ProofBundle = {
      updateHashes: agentResults.map(a => a.updateHash),
      aggregationHash: simHash('agg', roundId * 4219),
      proofHash: simHash('pf', roundId * 9283),
      modelVersionId: `round_${String(roundId).padStart(3, '0')}_v${simHash('', roundId * 8761).slice(2, 6)}`,
      globalModelHash: simHash('gm', roundId * 6143),
      globalModelCID,
      proofCID,
      mrenclave: simHash64(roundId * 7331 + 0xdead).slice(2), // 64 hex chars (no 0x prefix for display)
      teeSignature: simHash64(roundId * 5557),
      timestamp: Date.now(),
      inferenceEndpoint: `https://node-${roundId}.inference.0g.ai/v1`,
    };

    const aggBlock = ++blockCounter;
    this.events.push({
      id: ++eventIdCounter, block: aggBlock, type: 'AggregationComplete',
      agent: 'TEE_ENCLAVE', round: roundId,
      tx: simTxHash(roundId * 7789), timestamp: Date.now(),
      data: {
        globalModelCID,
        aggregationHash: proofBundle.aggregationHash,
        proofHash: proofBundle.proofHash,
        modelVersionId: proofBundle.modelVersionId,
      },
    });
    this.notify();
    await this.delay(1500);

    // Phase: EVALUATING
    onPhaseChange?.('EVALUATING', 80);
    this.agents.forEach(a => { a.status = 'VERIFYING'; });
    this.notify();
    await this.delay(1200);

    // Phase: DECIDING
    onPhaseChange?.('DECIDING', 85);
    this.agents.forEach(a => { a.status = 'DECIDING'; });
    this.notify();

    let rejectCount = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const agentVariance = (Math.random() - 0.5) * 4;
      const improvement = ((newGlobalAcc - prevAcc) + agentVariance) / 100;
      const localAcc = agent.localAccuracy + Math.random() * 2;
      const globalAccNew = newGlobalAcc + agentVariance * 0.5;

      let decision: Decision;
      if (improvement >= agent.acceptThreshold / 100) {
        decision = 'ACCEPT';
        agent.roundsAccepted++;
        agent.reputation = Math.min(10000, agent.reputation + 100);
      } else if (improvement >= agent.retrainThreshold / 100) {
        decision = 'RETRAIN';
      } else {
        decision = 'REJECT';
        agent.roundsRejected++;
        agent.reputation = Math.max(0, agent.reputation - 200);
        rejectCount++;
      }

      agent.decisionHistory.push(decision);
      if (agent.decisionHistory.length > 10) agent.decisionHistory.shift();
      agent.roundsCompleted++;
      agent.localAccuracy = localAcc;

      const dpHash = simHash('dp', roundId * 1000 + i);
      agentResults[i].decision = decision;
      agentResults[i].improvement = improvement * 100;
      agentResults[i].localAcc = localAcc;
      agentResults[i].globalAccNew = globalAccNew;
      agentResults[i].decisionProofHash = dpHash;
      agentResults[i].teeSignature = simHash64(roundId * 1000 + i + 0xbeef);

      const block = ++blockCounter;
      this.events.push({
        id: ++eventIdCounter, block, type: 'AgentDecision',
        agent: agent.name, round: roundId,
        tx: simTxHash(roundId * 2000 + i), timestamp: Date.now(),
        data: { decision, proofHash: dpHash },
      });

      this.events.push({
        id: ++eventIdCounter, block, type: 'AccuracyReported',
        agent: agent.name, round: roundId,
        tx: simTxHash(roundId * 3000 + i), timestamp: Date.now(),
        data: { localAcc: Math.round(localAcc * 100), globalAcc: Math.round(globalAccNew * 100) },
      });
    }
    this.notify();
    await this.delay(1000);

    // Governance check
    const governanceTriggered = rejectCount * 2 > this.agents.length;
    if (governanceTriggered) {
      const block = ++blockCounter;
      this.events.push({
        id: ++eventIdCounter, block, type: 'GovernanceTrigger',
        agent: 'SYSTEM', round: roundId,
        tx: simTxHash(roundId * 5000), timestamp: Date.now(),
        data: { reason: 'majority_reject' },
      });
    }

    // Rewards
    if (!governanceTriggered) {
      for (const agent of this.agents) {
        const block = ++blockCounter;
        const reward = (agent.reputation * 0.01).toFixed(4);
        this.events.push({
          id: ++eventIdCounter, block, type: 'RewardDistributed',
          agent: agent.name, round: roundId,
          tx: simTxHash(roundId * 6000 + agent.tokenId), timestamp: Date.now(),
          data: { amount: reward },
        });
      }
    }

    // Phase: COMPLETE
    onPhaseChange?.('COMPLETE', 100);
    this.agents.forEach(a => { a.status = 'IDLE'; });

    // Update storage artifacts
    const result: RoundResult = {
      roundId, timestamp: Date.now(),
      globalAccuracy: newGlobalAcc, prevGlobalAccuracy: prevAcc,
      agentResults, proofBundle, governanceTriggered,
      events: this.events.filter(e => e.round === roundId),
    };
    this.rounds.push(result);
    this.updateStorageArtifacts(roundId, result);
    this.notify();
    return result;
  }

  private updateStorageArtifacts(roundId: number, result: RoundResult) {
    const results = result.agentResults;
    const gradients: StorageArtifact[] = results.map(r => ({
      name: `round_${roundId}_${r.agentName.replace(/\s/g, '_')}.enc`,
      type: 'file' as const, size: `${(Math.random() * 10 + 10).toFixed(1)} MB`,
      cid: r.gradientCID,
      anchorHash: r.updateHash,
      anchorEvent: 'GradientSubmitted',
      time: 'just now',
      uploader: r.agentName,
    }));

    this.storageArtifacts = [{
      name: 'neuroledger/', type: 'folder', children: [
        { name: 'gradients/', type: 'folder', children: gradients },
        { name: 'model/', type: 'folder', children: [{
          name: `global_round_${roundId}.bin`, type: 'file',
          size: `${(Math.random() * 50 + 50).toFixed(1)} MB`,
          cid: result.proofBundle.globalModelCID,
          anchorHash: result.proofBundle.globalModelHash,
          anchorEvent: 'AggregationComplete',
          time: 'just now',
          uploader: 'TEE_ENCLAVE',
        }]},
        { name: 'attestations/', type: 'folder', children: [{
          name: `tee_proof_${roundId}.json`, type: 'file',
          size: '4.2 KB',
          cid: result.proofBundle.proofCID,
          anchorHash: result.proofBundle.proofHash,
          anchorEvent: 'AggregationComplete',
          time: 'just now',
          uploader: 'TEE_ENCLAVE',
        }]},
        { name: 'decisions/', type: 'folder', children: results.map(r => ({
          name: `decision_${roundId}_${r.agentName.replace(/\s/g, '_')}.json`,
          type: 'file' as const, size: '1.8 KB',
          cid: simCID(roundId * 6666 + results.indexOf(r)),
          anchorHash: r.decisionProofHash,
          anchorEvent: 'AgentDecision',
          time: 'just now', uploader: r.agentName,
        }))},
      ],
    }];
  }

  getLatestProof(): ProofBundle | null {
    return this.rounds.length > 0 ? this.rounds[this.rounds.length - 1].proofBundle : null;
  }

  getAccuracyHistory(): { round: number; accuracy: number }[] {
    return [
      { round: 0, accuracy: 45 },
      ...this.rounds.map(r => ({ round: r.roundId, accuracy: r.globalAccuracy })),
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
let engine: SimulationEngine | null = null;
export function getSimulationEngine(): SimulationEngine {
  if (!engine) engine = new SimulationEngine();
  return engine;
}
