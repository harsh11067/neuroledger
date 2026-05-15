# NeuroLedger

[![Built on 0G](https://img.shields.io/badge/Built%20on-0G-blue?style=for-the-badge)](https://0g.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**NeuroLedger** is a decentralized federated learning network designed for medical imaging and clinical intelligence. It empowers hospitals to collaborate on global AI models without ever exposing sensitive patient data. 

By leveraging **0G's Modular Infrastructure**, NeuroLedger ensures that every model update is cryptographically verifiable, hardware-attested, and mathematically reproducible.

---

## 🌟 Vision

In the current healthcare landscape, medical data is siloed due to privacy regulations and competitive barriers. NeuroLedger breaks these silos using **Autonomous Clinical Intelligence**. Every hospital's unique local knowledge is aggregated into a global "brain" that remains verifiable and fair, accelerating medical discovery while guaranteeing 100% patient privacy.

## 🛠 Modular Stack

NeuroLedger is built on the **0G Modular AI Chain**:

- **0G Storage**: Distributed, content-addressed storage for high-dimensional gradient deltas and global model checkpoints.
- **0G Chain (Galileo Testnet)**: The trust anchor that coordinates the 8-event lifecycle and enforces reputation-based rewards.
- **0G Compute (TeeML)**: Secure aggregation performed inside **Intel TDX** enclaves, providing hardware-level attestation for every federated update.
- **Rényi Differential Privacy (RDP)**: Mathematical privacy guarantees injected into model weights before they leave the hospital perimeter.

## 🧬 The 8-Event Lifecycle

NeuroLedger implements a rigorous on-chain audit trail:

1.  **AgentRegistered**: Hospitals join the network with a stake and autonomous policy.
2.  **RoundStarted**: Coordination layer triggers a new training iteration.
3.  **GradientSubmitted**: Encrypted/DP-noised gradients are anchored to 0G Storage.
4.  **AggregationComplete**: TEE-attested global model is published with a 7-field proof bundle.
5.  **AgentDecision**: Hospitals autonomously **ACCEPT**, **RETRAIN**, or **REJECT** the update.
6.  **AccuracyReported**: Verifiable local/global accuracy metrics are recorded.
7.  **RewardDistributed**: Reputation-weighted incentives are paid in native 0G tokens.
8.  **GovernanceTrigger**: Majority rejection triggers automated safety protocols.

---

## 🚦 Quick Start

### Frontend Dashboard
Explore the network state, TEE attestations, and artifact ledger.
```bash
cd frontend
npm run dev
```
👉 `http://localhost:3000`

### Agent Runner
Execute a live training round across multiple hospitals.
```bash
PYTHONPATH=. agent/venv/bin/python -m agent.neurolledger.runner \
  --hospitals manipal,srenivas,dfl \
  --round 21
```

---

## 🏗 Project Structure

- `agent/`: Python FL stack (Model, DP, Multi-Krum Aggregator, Storage SDK).
- `contracts/`: `NeuroLedger.sol` — The core coordination smart contract.
- `frontend/`: Next.js 15 Dashboard with real-time 0G Chain event listeners.
- `radiant-debris/`: Astro-based high-fidelity landing page.
- `scripts/`: Verification and reproducibility tools.

---

*NeuroLedger — Decentralized Intelligence, Verifiable Medicine.*
