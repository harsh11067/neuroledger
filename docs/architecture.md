# NeuroLedger Architecture

NeuroLedger utilizes a modular architecture to solve the "Verifiability-Privacy-Scalability" trilemma in Federated Learning.

## 1. System Components

### A. Autonomous Hospital Agents
- **Local Training**: Uses private hospital datasets (e.g., UCI Heart, Pima Diabetes).
- **Rényi Differential Privacy (RDP)**: Adds calibrated noise to gradients to prevent membership inference attacks.
- **Autonomous Policy**: Evaluates global model improvements against local validation sets to decide on acceptance.

### B. 0G Modular Infrastructure
- **0G Storage**: Serves as the global model and gradient ledger. CIDs are anchored on-chain for immutability.
- **0G Chain (Galileo Testnet)**: Orchestrates the training rounds, manages hospital reputation, and handles reward distribution.
- **0G Compute (TeeML)**: Provides the Trusted Execution Environment (Intel TDX) where the aggregation logic (Multi-Krum) is executed and attested.

### C. Secure Aggregator
- **Byzantine Robustness**: Implements Multi-Krum and Trimmed Mean algorithms to filter out malicious or noisy updates.
- **Hardware Attestation**: Produces a 7-field proof bundle (MRENCLAVE, TEE Signature, etc.) for on-chain verification.

## 2. Data Flow

1. **Local Update**: Agent trains locally → computes gradient delta.
2. **Privacy Injection**: Agent adds DP noise → hashes result.
3. **Persistence**: Agent uploads to 0G Storage → submits CID to 0G Chain.
4. **TEE Aggregation**: Aggregator pulls CIDs → verifies hashes → performs robust aggregation inside TEE.
5. **On-Chain Settlement**: Aggregator publishes results + TEE proof to the `NeuroLedger` contract.
6. **Autonomous Decision**: Agents pull global model → verify accuracy → submit vote.

## 3. Trust Model

- **Zero Trust Local Data**: No raw data ever leaves the hospital.
- **Hardware-Rooted Trust**: Aggregation is guaranteed by Intel TDX hardware, not by the operator.
- **Mathematical Trust**: Reproducibility scripts allow any auditor to recompute the aggregation hash from stored gradients.
