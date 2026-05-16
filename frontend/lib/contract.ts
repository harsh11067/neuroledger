/**
 * NeuroLedger Contract ABI & Interface
 * Mirrors contracts/NeuroLedger.sol — all 8 events + core functions
 * Target: 0G Mainnet (Chain ID 16661)
 */

export const NEUROLEDGER_ABI = [
  // ── Events (all 8) ──────────────────────────────────────────
  "event AgentRegistered(address indexed agent, string hospitalName, string region, uint256 tokenId, uint256 acceptThresholdBps, uint256 retrainThresholdBps)",
  "event RoundStarted(uint256 indexed roundId, uint256 timestamp)",
  "event GradientSubmitted(uint256 indexed roundId, address indexed agent, string cid, bytes32 updateHash, bytes32 dpProofHash)",
  "event AggregationComplete(uint256 indexed roundId, string globalModelCID, bytes32 aggregationHash, bytes32 proofHash, bytes32 gradientMerkleRoot, string modelVersionId, bytes32 globalModelHash, string teeProofCID, uint256 dpEpsilonConsumed)",
  "event AgentDecision(uint256 indexed roundId, address indexed agent, string decision, bytes32 decisionProofHash, uint256 localAccBps, uint256 globalAccBps)",
  "event AccuracyReported(uint256 indexed roundId, address indexed agent, uint256 localAcc, uint256 globalAcc)",
  "event RewardDistributed(uint256 indexed roundId, address indexed agent, uint256 amount)",
  "event GovernanceTrigger(uint256 indexed roundId, string reason, uint256 rejectCount)",

  // ── Write Functions ──────────────────────────────────────────
  "function registerAgent(string hospitalName, string region, string specialization, uint256 acceptThresholdBps, uint256 retrainThresholdBps) payable",
  "function startRound() returns (uint256)",
  "function submitGradient(uint256 roundId, string cid, bytes32 updateHash, bytes32 dpProofHash)",
  "function publishAggregation(uint256 roundId, string globalModelCID, bytes32 aggHash, bytes32 proofHash, bytes32 gradientMerkleRoot, bytes32 globalModelHash, string teeProofCID, uint256 dpEpsilonConsumed)",
  "function submitDecision(uint256 roundId, string decision, bytes32 decisionProofHash, uint256 localAccBps, uint256 globalAccBps)",
  "function reportAccuracy(uint256 roundId, uint256 localAcc, uint256 globalAcc)",
  "function distributeRewards(uint256 roundId)",
  "function flagRound(uint256 roundId, string reason)",

  // ── View Functions ───────────────────────────────────────────
  "function getAgentCount() view returns (uint256)",
  "function getRoundParticipants(uint256 roundId) view returns (address[])",
  "function currentRound() view returns (uint256)",
  "function agents(address) view returns (address addr, string hospitalName, string region, string specialization, uint256 stake, uint256 reputation, uint256 agentTokenId, uint256 acceptThresholdBps, uint256 retrainThresholdBps, uint256 roundsCompleted, uint256 roundsAccepted, uint256 roundsRejected, bool registered, bool active)",
  "function getAgentGradientCID(uint256 roundId, address agent) view returns (string)",
  "function getAgentDecision(uint256 roundId, address agent) view returns (string decision, bytes32 proofHash)",
  "function getRejectCount(uint256 roundId) view returns (uint256)",
] as const;

// 0G Galileo Testnet constants
export const CHAIN_ID = 16661;
export const RPC_URL = "https://evmrpc.0g.ai";
export const EXPLORER_URL = "https://chainscan.0g.ai";

// Event type constants
export type EventType =
  | 'AgentRegistered'
  | 'RoundStarted'
  | 'GradientSubmitted'
  | 'AggregationComplete'
  | 'AgentDecision'
  | 'AccuracyReported'
  | 'RewardDistributed'
  | 'GovernanceTrigger';

export interface OnChainEvent {
  block: number;
  type: EventType;
  agent: string;
  round: number;
  tx: string;
  timestamp: number;
  data?: Record<string, string | number>;
}
