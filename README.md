# NeuroLedger

[![Built on 0G](https://img.shields.io/badge/Built%20on-0G-blue?style=for-the-badge)](https://0g.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![0G Mainnet](https://img.shields.io/badge/0G%20Mainnet-Live-brightgreen?style=for-the-badge)](https://chainscan.0g.ai/address/0x8a3f97561819e66959cbECEE664e87bd10b8F865)

**NeuroLedger** is a verifiable federated learning network for medical AI. Hospitals collaborate on global AI models without exposing patient data. Every gradient, aggregation, and inference is cryptographically anchored on-chain and hardware-attested via Intel TDX enclaves.

---

## Live Deployment

| | |
|---|---|
| **Agent Runner** | Railway Background Worker |
| **Network** | 0G Mainnet (Chain ID: 16661) |
| **Contract** | [`0x8a3f97561819e66959cbECEE664e87bd10b8F865`](https://chainscan.0g.ai/address/0x8a3f97561819e66959cbECEE664e87bd10b8F865) |
| **Owner / Aggregator** | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` |
| **TeeML Provider** | [`0xa48f01287233509FD694a22Bf840225062E67836`](https://compute.0g.ai) — qwen/qwen-2.5-7b-instruct (DStack TDX) |
| **Testnet Contract** | [`0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD`](https://chainscan-galileo.0g.ai/address/0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD) — 25 rounds complete |
| **Frontend** | [Vercel](https://neuroledgerprivacycommunity.vercel.app/) |

---

## How It Works

1. **Hospital agents** train local models on private datasets (UCI Heart, Pima Diabetes, Breast Cancer, etc.)
2. **Differential Privacy** (Rényi DP, ε=1.0, δ=1e-5) is applied before gradients leave the hospital
3. **Gradients** are uploaded to 0G Storage — content-addressed Merkle roots anchored on-chain
4. **Multi-Krum + Trimmed Mean** aggregation produces a Byzantine-robust global model
5. **0G Compute TeeML** (Intel TDX enclave) attests the aggregation: `hardware_verified=True`, `inference_valid=True`
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
- 0G wallet with OG tokens ([faucet](https://faucet.0g.ai) for testnet)

### Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Run a Training Round (mainnet)
```bash
cp frontend/.env.example .env
# Edit .env — set PRIVATE_KEY, AGENT_*_KEY, CONTRACT_ADDRESS

# Install Python deps
pip install -r agent/requirements.txt

# Run a round (TEE attestation automatic)
python3 -m agent.neurolledger.runner \
  --hospitals manipal,srenivas,dfl \
  --round 1
```

### Verify Aggregation Reproducibility
```bash
python3 scripts/verify_aggregation.py \
  --cids "0xCID1,0xCID2,0xCID3" \
  --expected 0x<on_chain_aggregation_hash>
```

### Deploy Your Own Contract
```bash
npm install
cp frontend/.env.example .env  # set PRIVATE_KEY

# Mainnet
npx hardhat run scripts/deploy.ts --network og_mainnet

# Testnet
npx hardhat run scripts/deploy.ts --network og_galileo
```

---

## Project Structure

```
neuroledger/
├── agent/
│   ├── neurolledger/
│   │   ├── runner.py          # Round orchestrator
│   │   ├── model.py           # Federated logistic regression
│   │   ├── aggregator.py      # Multi-Krum + Trimmed Mean
│   │   ├── dp.py              # Rényi DP mechanism
│   │   ├── storage.py         # 0G Storage SDK wrapper
│   │   ├── tee_verifier.py    # TeeML attestation (Python)
│   │   ├── tee_bridge.mjs     # 0G Compute SDK bridge (Node.js)
│   │   ├── hashing.py         # SHA256 gradient/model hashing
│   │   └── data_loader.py     # UCI dataset loaders
│   └── requirements.txt
├── contracts/
│   └── NeuroLedger.sol        # Core coordination contract
├── frontend/
│   ├── app/                   # Next.js 15 App Router
│   ├── components/            # Dashboard panels
│   └── lib/                   # Contract ABI, deployment, hooks
├── scripts/
│   ├── deploy.ts              # Hardhat deploy (mainnet + testnet)
│   ├── verify_aggregation.py  # Reproducibility verifier
│   └── check_events.ts        # On-chain event inspector
├── proof.md                   # All on-chain proof hashes
└── data/                      # Medical training datasets
```

---

## 0G Technology Used

| Component | Usage |
|-----------|-------|
| **0G Chain** | Smart contract coordination, 8-event audit trail |
| **0G Storage** | Content-addressed gradient + model storage (Merkle roots on-chain) |
| **0G Compute TeeML** | Intel TDX hardware attestation, `processResponse` signature verify |
| **0G Compute SDK** | `@0gfoundation/0g-compute-ts-sdk` — `verifyService` + `processResponse` |

---

*NeuroLedger — Decentralized Intelligence, Verifiable Medicine.*
