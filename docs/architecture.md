# NeuroLedger Architecture

NeuroLedger solves the "Verifiability-Privacy-Scalability" trilemma in Federated Learning using 0G's modular infrastructure stack.

## Live Deployment Status

| Component | Network | Address |
|-----------|---------|---------|
| NeuroLedger.sol | **0G Mainnet** (Chain 16661) | `0x8a3f97561819e66959cbECEE664e87bd10b8F865` |
| NeuroLedger.sol | 0G Galileo Testnet (Chain 16602) | `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` |
| TeeML Provider (mainnet) | 0G Compute Network | `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` — deepseek/deepseek-chat-v3-0324 |
| TeeML Provider (testnet) | 0G Compute Network | `0xa48f01287233509FD694a22Bf840225062E67836` — qwen/qwen-2.5-7b-instruct |

---

## 1. System Components

### A. Autonomous Hospital Agents
- **Local Training**: Trains a federated logistic regression model on private datasets (UCI Heart, Pima Diabetes, Breast Cancer, etc.)
- **Rényi Differential Privacy (RDP)**: Adds Gaussian noise calibrated to ε=1.0, δ=1e-5 — prevents gradient inversion attacks before any data leaves the hospital
- **Autonomous Policy**: Each agent independently evaluates the global model on its local validation set and decides ACCEPT / RETRAIN / REJECT, with on-chain accountability

### B. 0G Modular Infrastructure

**0G Chain (mainnet + Galileo testnet)**
- Orchestrates training rounds via the 8-event `NeuroLedger.sol` contract
- Immutable on-chain anchors: CIDs, aggregation hashes, TEE proof hashes
- Manages agent reputation, staking, reward distribution, and governance escalation

**0G Storage (testnet turbo indexer)**
- Content-addressed gradient and model storage — Merkle root CIDs anchored on-chain
- `0x`-prefixed CIDs are real Merkle roots downloadable via `/file?root=0x<root>`
- `0g-`-prefixed CIDs are SHA-256 deterministic fallbacks (used when SDK upload fails)
- Storage contracts exist only on testnet; the runner always uses `STORAGE_BLOCKCHAIN_RPC=https://evmrpc-testnet.0g.ai` regardless of the main chain

**0G Compute TeeML (DStack Intel TDX)**
- Hardware attestation via `@0gfoundation/0g-compute-ts-sdk`
- Two-phase flow via `agent/neurolledger/tee_bridge.mjs`:
  - **Phase 1**: `verifyService(provider)` — free hardware verification (signerMatch + composeHash), always runs
  - **Phase 2**: `processResponse(provider, chatID, usage)` — cryptographic inference verification, requires funded compute ledger (3 OG minimum on mainnet)
- Both phases produce a proof bundle stored on 0G Storage and anchored on-chain

### C. Aggregator
- **Multi-Krum**: Computes pairwise Euclidean distances between all submitted gradients; selects the `n−f` with lowest scores (f = tolerated Byzantine agents)
- **Coordinate-wise Trimmed Mean**: Averages selected gradients with optional trim fraction
- **Deterministic**: Any auditor with gradient CIDs can reproduce the exact aggregation hash
- **TEE-attested**: The aggregation trace (algorithm, scores, selected indices, output hash) is sent to the TeeML enclave, which returns a hardware-signed verification

---

## 2. Data Flow

```
Hospital A            Hospital B            Hospital C
(UCI Heart)           (Pima Diabetes)       (Breast Cancer)
     │                     │                     │
     ▼                     ▼                     ▼
Local Training         Local Training         Local Training
  + RDP noise            + RDP noise            + RDP noise
     │                     │                     │
     ▼                     ▼                     ▼
submitGradient(CID)   submitGradient(CID)   submitGradient(CID)
  on-chain ────────────────────────────────── GradientSubmitted events
     │
     ▼
Aggregator pulls CIDs from 0G Storage
  → Multi-Krum selects clean gradients
  → Trimmed Mean computes global update
  → TeeML bridge (tee_bridge.mjs)
      Phase 1: hardware_verified=true
      Phase 2: inference_valid=true
  → publishAggregation(globalModelCID, aggHash, proofHash, teeCID)
  on-chain ──────────── AggregationComplete event
     │
     ▼
Each hospital downloads global model
  → evaluates on local validation set
  → submitDecision(ACCEPT/RETRAIN/REJECT)
  on-chain ──────────── AgentDecision event
```

---

## 3. Trust Model

| Guarantee | Mechanism |
|-----------|-----------|
| **Zero trust local data** | No raw patient data leaves the hospital — only DP-noised gradients |
| **Hardware-rooted trust** | TeeML: DStack TDX signerMatch + composeHash verify the exact code ran in hardware isolation |
| **Cryptographic reproducibility** | SHA256(sorted gradient CIDs + aggregation trace) = on-chain `aggregationHash` — anyone can verify |
| **Agent accountability** | Every ACCEPT/RETRAIN/REJECT decision is hashed and recorded on-chain — inconsistencies trigger slashing |
| **Tamper-evidence** | Changing any stored gradient changes its CID, breaking the on-chain anchor |

---

## 4. Contract Events (8 total)

| Event | Trigger | Key payload |
|-------|---------|-------------|
| `AgentRegistered` | Hospital deploys | agent address, hospitalName, region, tokenId |
| `RoundStarted` | Aggregator starts round | roundId, timestamp |
| `GradientSubmitted` | Hospital uploads gradient | roundId, agent, storageCID, updateHash, dpProofHash |
| `AggregationComplete` | Aggregator publishes | roundId, globalModelCID, aggregationHash, proofHash, modelVersionId, teeProofCID, dpEpsilon |
| `AgentDecision` | Hospital evaluates | roundId, agent, decision, decisionProofHash |
| `AccuracyReported` | Hospital reports metrics | roundId, agent, localAcc, globalAcc |
| `RewardDistributed` | Round closes | roundId, agent, amount |
| `GovernanceTrigger` | Majority REJECT | roundId, reason |

---

## 5. Key Files

| File | Purpose |
|------|---------|
| `contracts/NeuroLedger.sol` | Core coordination contract |
| `agent/neurolledger/runner.py` | Round orchestrator — training → upload → aggregate → TEE → publish |
| `agent/neurolledger/aggregator.py` | Multi-Krum + Trimmed Mean (deterministic, reproducible) |
| `agent/neurolledger/dp.py` | Rényi DP Gaussian mechanism |
| `agent/neurolledger/storage.py` | 0G Storage SDK wrapper (uses testnet RPC always) |
| `agent/neurolledger/tee_bridge.mjs` | 0G Compute SDK bridge (Node.js ESM, two-phase TEE) |
| `agent/neurolledger/tee_verifier.py` | Python wrapper that invokes `tee_bridge.mjs` |
| `frontend/lib/contract.ts` | Mainnet RPC + contract address constants |
| `frontend/lib/deployment.json` | Deployed contract address + network |
| `scripts/verify_aggregation.py` | Reproducibility verifier — download CIDs, re-run aggregation, compare hash |
