# NeuroLedger — Project Overview

> Verifiable Autonomous Clinical Intelligence Network  
> 0G APAC Hackathon 2026 · Submission Deadline: May 16, 2026

---

## Current Status (May 16, 2026 — Deadline Day)

All infrastructure is deployed and producing verifiable on-chain data.

### Mainnet (0G Chain 16661)

| Component | Status | Detail |
|---|---|---|
| Contract | **LIVE** | `0x8a3f97561819e66959cbECEE664e87bd10b8F865` |
| Deploy TX | **confirmed** | `0x34b66c9ad09d6c5f8eeb561ca805171da32ddedbb6a1ddc340cc4d06752c2ed9` |
| Full TeeML round | **Round 4 complete** | `hardware_verified=true`, `inference_valid=true` |
| TeeML provider | **LIVE** | `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` — deepseek/deepseek-chat-v3-0324 |
| Compute ledger | **funded** | 3 OG deposited, sub-account provisioned |

### Testnet (0G Galileo 16602)

| Component | Status | Detail |
|---|---|---|
| Contract | **LIVE** | `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` |
| Completed rounds | **25 rounds** | All with on-chain `AggregationComplete` events |
| Full TeeML rounds | **6 rounds** | Rounds 18, 19, 20, 21, 24, 25 — `inference_valid=true` |
| TeeML provider | **LIVE** | `0xa48f01287233509FD694a22Bf840225062E67836` — qwen/qwen-2.5-7b-instruct |

### 0G Storage

| Component | Status | Detail |
|---|---|---|
| Gradient uploads | **LIVE** | Real `0x`-prefixed Merkle roots from `0g-storage-sdk` Python |
| Global model CID | **LIVE** | Uploaded after each aggregation |
| TEE proof CID | **LIVE** | Full DStack TDX attestation JSON uploaded and anchored |
| Indexer | **Turbo active** | `https://indexer-storage-testnet-turbo.0g.ai` |

### Dashboard

| Panel | Status |
|---|---|
| GlobalNetworkView (Spline 3D) | **LIVE** |
| NodeDeploymentPanel (MetaMask → register on-chain) | **LIVE** |
| TrainingSimulator (local sim + run-on-chain) | **LIVE** |
| AttestationPanel (real `AggregationComplete` events, TeeML badge) | **LIVE** |
| ArtifactLedger (all 8 event types, last 200k blocks) | **LIVE** |

---

## 1. Project Vision

NeuroLedger is a decentralized federated learning network where autonomous hospital AI agents collaboratively train a global medical model — without ever exchanging raw patient data. Every gradient update is cryptographically privacy-bounded (Rényi DP), uploaded to 0G Storage, and aggregated inside a 0G TeeML enclave — producing a hardware-signed attestation stored on-chain.

The agents are not passive participants — they are decision-making entities. After each round, every agent independently evaluates the global model on its local validation set and autonomously decides ACCEPT / RETRAIN / REJECT. Each decision is hashed and posted on-chain, creating a fully auditable governance trail. Majority REJECT triggers a `GovernanceTrigger` event that freezes rewards and flags the round for investigation.

---

## 2. Problem Statement

Every hospital trains AI models only on its own patients. Patient data is legally and ethically untransferable (HIPAA, GDPR, PDPA, regional health laws). The result: medical AI is fragmented, biased toward wealthy institutions with large datasets, and fails the patients who most need a globally informed diagnostic model.

Traditional federated learning still requires a trusted central aggregator — a single point of failure. Gradient updates can leak patient data without cryptographic verification. And agents are passive — they blindly accept whatever the aggregator returns with no independent verification.

**NeuroLedger's approach**: Gradients carry the learning signal without carrying patient records. 0G TeeML verifies the aggregation in hardware — the operator cannot see the computation. The cryptographic attestation proves it, stored immutably on 0G Chain. Agents verify and decide independently — making the network self-defending.

---

## 3. Execution Flow — Full Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ROUND N — FULL EXECUTION FLOW                                          │
│                                                                         │
│  STEP 1 ── Hospitals train locally                                      │
│    Each agent runs SGD on its private patient dataset                   │
│    Output: gradient delta ∇W = new_weights − global_weights             │
│    Safety: gradient norm clipped before DP noise injection              │
│                                                                         │
│  STEP 2 ── Differential Privacy                                         │
│    Rényi DP Gaussian noise (ε=1.0, δ=1e-5) added to gradient           │
│    update_hash = SHA256(noised_gradient_bytes)                          │
│    dp_proof_hash = keccak256(agent, roundId, epsilon, delta, sigma)     │
│                                                                         │
│  STEP 3 ── Upload to 0G Storage                                         │
│    gradient JSON uploaded → Merkle root CID returned                   │
│    contract.submitGradient(roundId, CID, updateHash, dpProofHash)       │
│    On-chain: GradientSubmitted(roundId, agent, CID, updateHash)         │
│                                                                         │
│  STEP 4 ── Aggregation + TeeML Attestation                              │
│    Multi-Krum selects clean gradients                                   │
│    Trimmed Mean computes global update                                  │
│    tee_bridge.mjs:                                                      │
│      Phase 1: verifyService → hardware_verified=true                   │
│      Phase 2: processResponse → inference_valid=true                   │
│    TEE proof bundle uploaded to 0G Storage → teeProofCID               │
│                                                                         │
│  STEP 5 ── On-Chain Publication                                         │
│    contract.publishAggregation(roundId, globalModelCID, aggHash,        │
│                                proofHash, versionId, teeProofCID, ...)  │
│    On-chain: AggregationComplete(roundId, globalModelCID, aggHash, ...) │
│                                                                         │
│  STEP 6 ── Autonomous Agent Decision                                    │
│    Each agent: evaluate global model on local validation set            │
│    improvement = acc_global_N − acc_global_N-1                          │
│    decision = ACCEPT | RETRAIN | REJECT                                 │
│    On-chain: AgentDecision(roundId, agent, decision, proofHash)         │
│    Majority REJECT → GovernanceTrigger event                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Proof of Reality

### What Is on Chain (Mainnet, Verifiable)

**Round 4 — Full TeeML proof:**
```
Contract:         0x8a3f97561819e66959cbECEE664e87bd10b8F865
TX:               0x575b1193d4690d981aafb64e7ec526572a1af0b76d546c86360d9c8d2bf11dd3
Aggregation hash: 0x6560e2fbb287318a32fd16c4dab9921867415fe7cbff7fa81c3d0c89a00f0018
TEE Proof hash:   0x26c85d157499efe27e0f27eea5a1c72518f235e9deb2782385fcb4ed82711516
TEE Proof CID:    0xbed29dc5015d97afe14951d7eed065ffdf46bdbcf85d673bbee1d7aefee91fe2
Global model CID: 0xdc15ea7cd1d9700dc26fd9f6289bbb936357223abc1587b97f90970c1ab76e79
hardware_verified: true  (signerMatch=true, composeHash=true)
inference_valid:   true  (processResponse → isValid=true)
Model:            deepseek/deepseek-chat-v3-0324
```

### What Is Verifiable by Anyone

1. **File integrity**: `SHA256(downloaded_CID_bytes)` matches the on-chain Merkle root
2. **TEE hardware**: DStack verifier confirms Intel TDX quote, compose hash, signer address match
3. **Aggregation reproducibility**: `scripts/verify_aggregation.py` re-runs Multi-Krum + Trimmed Mean from gradient CIDs and reproduces the exact `aggregationHash`
4. **Agent decisions**: Each decision record is hashed on-chain; auditors can check `improvement >= threshold` matches the declared decision

---

## 5. Technology Stack

| Layer | Technology | Status |
|---|---|---|
| **Agent runtime** | Python 3.10, scikit-learn, web3.py | ✅ Live |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS v4 | ✅ Live |
| **Smart contracts** | Solidity 0.8.x, 0G Mainnet (16661) + Galileo (16602) | ✅ Live |
| **0G Storage SDK** | `0g-storage-sdk` (Python), turbo indexer, testnet chain | ✅ Live |
| **0G Compute TeeML** | `@0gfoundation/0g-compute-ts-sdk` via Node.js bridge, DStack TDX | ✅ Live |
| **Mainnet TeeML** | `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` — deepseek-chat-v3-0324 | ✅ Verified |
| **Testnet TeeML** | `0xa48f01287233509FD694a22Bf840225062E67836` — qwen-2.5-7b-instruct | ✅ Verified |
| **Differential Privacy** | Rényi DP Gaussian mechanism (ε=1.0, δ=1e-5) | ✅ Live |
| **Aggregation** | Multi-Krum + Trimmed Mean (Byzantine-robust, deterministic) | ✅ Live |
| **Hashing** | SHA256 throughout (update_hash, aggregation_hash, model_hash, proof_hash) | ✅ Live |

---

## 6. 0G Integration Checklist

- [x] **0G Chain** — Smart contract deployed on mainnet (16661) + testnet (16602), 8 events, 25+ testnet rounds + 4 mainnet rounds
- [x] **0G Storage** — Real Merkle-root CIDs for gradients, global models, TEE proofs; turbo indexer
- [x] **0G Compute TeeML** — DStack TDX hardware verification + TeeML inference, `hardware_verified=true`, `inference_valid=true` on both mainnet and testnet
- [x] **0G Compute SDK** — `@0gfoundation/0g-compute-ts-sdk`, Router path (`createZGComputeNetworkBroker`), `verifyService` + `processResponse`
- [x] **Mainnet compute ledger** — 3 OG deposited, sub-account provisioned with 1 OG per provider

---

## 7. Submission Checklist

### Infrastructure (all complete)
- [x] `NeuroLedger.sol` deployed on **0G Mainnet** — `0x8a3f97561819e66959cbECEE664e87bd10b8F865`
- [x] `NeuroLedger.sol` deployed on **0G Galileo** — `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD`
- [x] **25 testnet rounds** with on-chain `AggregationComplete` events
- [x] **4 mainnet rounds** — round 4 with full TeeML (`hardware_verified=true`, `inference_valid=true`)
- [x] 0G Storage turbo: real Merkle root CIDs for gradients, global model, TEE proof
- [x] 0G Compute TeeML: DStack TDX hardware verification + inference verification on mainnet
- [x] Rényi DP (ε=1.0, δ=1e-5) on all gradient uploads
- [x] Multi-Krum + Trimmed Mean Byzantine-robust aggregation (reproducible)
- [x] 5-panel dashboard — all panels read live chain data, last 200k blocks
- [x] MetaMask wallet connect → register agent on-chain from browser
- [x] `scripts/verify_aggregation.py` — reproducibility verifier
- [x] All docs updated

### Run command
```bash
# From repo root (mainnet, TeeML automatic):
python3 -m agent.neurolledger.runner --hospitals manipal --round 5

# Testnet (3 hospitals):
OG_RPC_URL=https://evmrpc-testnet.0g.ai CHAIN_ID=16602 \
  CONTRACT_ADDRESS=0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD \
  python3 -m agent.neurolledger.runner --hospitals manipal,srenivas,dfl --round 26
```

---

*NeuroLedger — Where every hospital's knowledge becomes everyone's medicine.*  
*Every gradient encrypted. Every aggregation verified. Every decision on-chain.*
