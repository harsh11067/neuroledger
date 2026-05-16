# NeuroLedger

[![Built on 0G](https://img.shields.io/badge/Built%20on-0G-blue?style=for-the-badge)](https://0g.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![0G Mainnet](https://img.shields.io/badge/0G%20Mainnet-Live-brightgreen?style=for-the-badge)](https://chainscan.0g.ai/address/0x8a3f97561819e66959cbECEE664e87bd10b8F865)

**NeuroLedger** is a verifiable federated learning network for medical AI. Hospitals collaborate on global AI models without exposing patient data. Every gradient, aggregation, and inference is cryptographically anchored on-chain and hardware-attested via Intel TDX enclaves.

---

## Live Deployment

| | |
|---|---|
| **Network** | 0G Mainnet (Chain ID: 16661) |
| **Contract** | [`0x8a3f97561819e66959cbECEE664e87bd10b8F865`](https://chainscan.0g.ai/address/0x8a3f97561819e66959cbECEE664e87bd10b8F865) |
| **Deploy TX** | [`0x34b66c9...`](https://chainscan.0g.ai/tx/0x34b66c9ad09d6c5f8eeb561ca805171da32ddedbb6a1ddc340cc4d06752c2ed9) |
| **Owner / Aggregator** | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` |
| **Mainnet TeeML Provider** | [`0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0`](https://compute.0g.ai) — deepseek/deepseek-chat-v3-0324 (DStack TDX) |
| **Testnet Contract** | [`0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD`](https://chainscan-galileo.0g.ai/address/0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD) — 25 rounds, 6 full TeeML |
| **Frontend** | [neuroledgerprivacycommunity.vercel.app](https://neuroledgerprivacycommunity.vercel.app/) |

### Mainnet Round 4 — Full TeeML Proof

| Field | Value |
|-------|-------|
| **TX** | [`0x575b1193...`](https://chainscan.0g.ai/tx/0x575b1193d4690d981aafb64e7ec526572a1af0b76d546c86360d9c8d2bf11dd3) |
| **hardware_verified** | `true` (signerMatch ✅ composeHash ✅) |
| **inference_valid** | `true` (deepseek-chat-v3-0324, processResponse → isValid=true) |
| **TEE Proof CID** | `0xbed29dc5015d97afe14951d7eed065ffdf46bdbcf85d673bbee1d7aefee91fe2` |
| **Global Model CID** | `0xdc15ea7cd1d9700dc26fd9f6289bbb936357223abc1587b97f90970c1ab76e79` |
| **Aggregation Hash** | `0x6560e2fbb287318a32fd16c4dab9921867415fe7cbff7fa81c3d0c89a00f0018` |

---

## How It Works

1. **Hospital agents** train local models on private datasets (UCI Heart, Pima Diabetes, Breast Cancer, etc.)
2. **Differential Privacy** (Rényi DP, ε=1.0, δ=1e-5) is applied before gradients leave the hospital
3. **Gradients** are uploaded to 0G Storage — content-addressed Merkle roots anchored on-chain
4. **Multi-Krum + Trimmed Mean** aggregation produces a Byzantine-robust global model
5. **0G Compute TeeML** (Intel TDX enclave) attests the aggregation: `hardware_verified=true`, `inference_valid=true`
6. **AggregationComplete** event published on-chain with 9-field proof bundle
7. Hospitals autonomously **ACCEPT / RETRAIN / REJECT** — majority REJECT triggers GovernanceTrigger

---

## The 8-Event On-Chain Lifecycle

| Event | Description |
|-------|-------------|
| `AgentRegistered` | Hospital joins with stake + autonomous decision policy |
| `RoundStarted` | New training iteration begins |
| `GradientSubmitted` | DP-noised gradient anchored to 0G Storage |
| `AggregationComplete` | TEE-attested global model with 9-field proof bundle |
| `AgentDecision` | Hospital autonomously ACCEPT / RETRAIN / REJECT |
| `AccuracyReported` | Verifiable local/global accuracy on-chain |
| `RewardDistributed` | Reputation-weighted incentives in native OG |
| `GovernanceTrigger` | Majority rejection triggers safety protocol |

---

## Quick Start

### Prerequisites
- Node.js 18+, Python 3.10+
- 0G wallet with OG tokens ([testnet faucet](https://faucet.0g.ai))

### Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Run a Training Round
```bash
# Install Python deps
pip install -r agent/requirements.txt

# Copy and configure environment
cp .env.example .env
# Required: PRIVATE_KEY, AGENT_A_KEY, CONTRACT_ADDRESS, OG_RPC_URL

# Run a round with TeeML attestation (automatic)
python3 -m agent.neurolledger.runner \
  --hospitals manipal,srenivas,dfl \
  --round 1

# Single-hospital round (when only one agent has funds)
python3 -m agent.neurolledger.runner \
  --hospitals manipal \
  --round 5
```

### Verify Aggregation Reproducibility
```bash
python3 scripts/verify_aggregation.py \
  --cids "0xCID1,0xCID2" \
  --expected 0x<on_chain_aggregation_hash>
```

### Deploy Your Own Contract
```bash
npm install

# Mainnet (0G Chain ID 16661)
npx hardhat run scripts/deploy.ts --network og_mainnet

# Testnet Galileo (Chain ID 16602)
npx hardhat run scripts/deploy.ts --network og_galileo
```

---

## Project Structure

```
neuroledger/
├── agent/
│   ├── neurolledger/
│   │   ├── runner.py          # Round orchestrator (training → upload → aggregate → TEE → publish)
│   │   ├── model.py           # Federated logistic regression
│   │   ├── aggregator.py      # Multi-Krum + Trimmed Mean
│   │   ├── dp.py              # Rényi DP mechanism
│   │   ├── storage.py         # 0G Storage SDK wrapper
│   │   ├── tee_verifier.py    # TeeML attestation (Python)
│   │   ├── tee_bridge.mjs     # 0G Compute SDK bridge (Node.js ESM)
│   │   ├── hashing.py         # SHA256 gradient/model hashing
│   │   └── data_loader.py     # UCI dataset loaders
│   └── requirements.txt
├── contracts/
│   └── NeuroLedger.sol        # Core coordination contract (8 events)
├── frontend/
│   ├── app/                   # Next.js 15 App Router
│   ├── components/            # Dashboard panels
│   └── lib/                   # Contract ABI, deployment config, hooks
├── scripts/
│   ├── deploy.ts              # Hardhat deploy (mainnet + testnet)
│   ├── verify_aggregation.py  # Reproducibility verifier
│   └── check_events.ts        # On-chain event inspector
├── proof.md                   # All on-chain proof hashes (mainnet + testnet)
└── data/                      # Medical training datasets
```

---

## 0G Technology Used

| Component | Usage |
|-----------|-------|
| **0G Chain** | Smart contract coordination, 8-event audit trail, mainnet + Galileo testnet |
| **0G Storage** | Content-addressed gradient + model storage (Merkle roots on-chain), turbo indexer |
| **0G Compute TeeML** | Intel TDX hardware attestation, `verifyService` + `processResponse` verification |
| **0G Compute SDK** | `@0gfoundation/0g-compute-ts-sdk` via Node.js bridge (`tee_bridge.mjs`) |

---

## Key Addresses

| Role | Address |
|------|---------|
| Owner / Aggregator / Deployer | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` |
| Mainnet Contract | `0x8a3f97561819e66959cbECEE664e87bd10b8F865` |
| Testnet Contract (Galileo) | `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` |
| Mainnet TeeML Provider | `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` |
| Testnet TeeML Provider | `0xa48f01287233509FD694a22Bf840225062E67836` |

---

*NeuroLedger — Decentralized Intelligence, Verifiable Medicine.*
