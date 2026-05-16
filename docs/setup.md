# NeuroLedger Setup Guide

## 1. Prerequisites

- **Node.js**: v18 or higher
- **Python**: v3.10 or higher
- **Wallet**: MetaMask or raw private key with OG tokens
  - Mainnet OG: [chainscan.0g.ai](https://chainscan.0g.ai)
  - Testnet OG: [faucet.0g.ai](https://faucet.0g.ai) (0G Galileo testnet)
- **Operating System**: Linux (recommended) or macOS

## 2. Environment Configuration

Copy the example environment file and fill in your keys:
```bash
cp .env.example .env
```

Required variables:
```bash
# Primary wallet (deployer + aggregator + agent A)
PRIVATE_KEY=0x...

# Agent keys (one per hospital participant)
AGENT_A_KEY=0x...   # manipal
AGENT_B_KEY=0x...   # srenivas
AGENT_C_KEY=0x...   # dfl

# Chain config — mainnet by default
OG_RPC_URL=https://evmrpc.0g.ai
CHAIN_ID=16661
CONTRACT_ADDRESS=0x8a3f97561819e66959cbECEE664e87bd10b8F865

# 0G Storage — always testnet (storage contracts only exist on testnet)
STORAGE_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai
# STORAGE_BLOCKCHAIN_RPC defaults to https://evmrpc-testnet.0g.ai (do not change)

# 0G Compute TeeML provider (mainnet)
TEE_PROVIDER_ADDRESS=0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0
```

For testnet (Galileo) usage:
```bash
OG_RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16602
CONTRACT_ADDRESS=0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD
TEE_PROVIDER_ADDRESS=0xa48f01287233509FD694a22Bf840225062E67836
```

## 3. Frontend Installation

```bash
cd frontend
npm install
npm run dev
# Dashboard → http://localhost:3000
```

## 4. Backend (Python) Agent

From the project root:
```bash
# Create virtual environment
python3 -m venv agent/venv
source agent/venv/bin/activate

# Install dependencies
pip install -r agent/requirements.txt

# Install Node deps for TEE bridge
npm install   # (from project root)
```

## 5. Running a Training Round

```bash
# Full multi-hospital round (requires all agents funded)
python3 -m agent.neurolledger.runner \
  --hospitals manipal,srenivas,dfl \
  --round 1

# Single-hospital round (minimal gas — just the deployer key needed)
python3 -m agent.neurolledger.runner \
  --hospitals manipal \
  --round 5

# Skip TEE (dry-run, no TeeML cost)
python3 -m agent.neurolledger.runner \
  --hospitals manipal,srenivas,dfl \
  --round 1 \
  --no-tee
```

TeeML attestation runs automatically. It requires:
- `PRIVATE_KEY` set with a funded 0G Compute ledger (3 OG minimum on mainnet)
- The TEE bridge writes its output to stdout (parsed by `runner.py`) and diagnostics to stderr

## 6. TEE (0G Compute) Setup

The TeeML bridge uses `@0gfoundation/0g-compute-ts-sdk`:
```bash
# Install (from project root)
npm install

# List available TeeML providers
node agent/neurolledger/tee_bridge.mjs --list-only
```

**Compute ledger funding** (required for `inference_valid=true`):
- The bridge auto-creates a ledger if your wallet has ≥ 3 OG
- Auto-funds the provider sub-account with 1 OG on first use
- `hardware_verified=true` (Phase 1) is free and always runs
- `inference_valid=true` (Phase 2) requires the funded ledger

## 7. Verify Aggregation Reproducibility

```bash
# Verify that gradient CIDs reproduce the on-chain aggregation hash
python3 scripts/verify_aggregation.py \
  --cids "0xCID1,0xCID2,0xCID3" \
  --expected 0x<aggregation_hash_from_chain>
```

## 8. Contract Deployment

Deploy a fresh contract to mainnet or testnet:
```bash
# Mainnet (0G Chain ID 16661)
npx hardhat run scripts/deploy.ts --network og_mainnet

# Testnet Galileo (Chain ID 16602)
npx hardhat run scripts/deploy.ts --network og_galileo
```

The deploy script automatically:
- Deploys `NeuroLedger.sol`
- Funds agent wallets with initial OG
- Updates `frontend/lib/deployment.json`
- Prints the explorer URL

## 9. Inspect On-Chain Events

```bash
# Print all 8 event types from the last 200k blocks
npx ts-node scripts/check_events.ts
```
