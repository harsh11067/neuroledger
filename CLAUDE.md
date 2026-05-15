# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
neuroledger/
├── contracts/NeuroLedger.sol     # Single Solidity contract (all logic)
├── frontend/                     # Next.js 15 dashboard (React 19, Tailwind v4)
│   ├── app/page.tsx              # Shell: 5-panel SPA, Spline background
│   ├── components/               # One file per panel/component
│   └── lib/                      # contract.ts, hooks.ts, simulation.ts, wallet.ts
├── agent/neurolledger/           # Python FL stack
│   ├── runner.py                 # End-to-end round orchestrator (entry point)
│   ├── model.py / dp.py          # FederatedLogisticRegression + Rényi DP
│   ├── aggregator.py             # Multi-Krum + trimmed mean
│   └── storage.py / tee_verifier.py
├── agent/config/hospital_map.json  # Registered hospital names → datasets
├── scripts/                      # Hardhat TS scripts (deploy, check_events, list_agents)
├── test/                         # Hardhat tests
└── hardhat.config.cjs
```

## Commands

### Smart Contracts (from repo root)
```bash
npm test                          # Run all Hardhat tests
npm run compile                   # Compile contracts
npx hardhat test test/NeuroLedger.test.ts   # Single test file
npx hardhat run scripts/deploy.ts --network og_galileo
npx hardhat run scripts/check_events.ts --network og_galileo
npx hardhat run scripts/list_agents.ts --network og_galileo
```

### Frontend (from `frontend/`)
```bash
npm run dev       # Dev server on localhost:3000
npm run build     # Production build (also type-checks)
npm run lint      # ESLint
```

### Python Agent (from repo root)
```bash
# Dry run (no chain, no TEE):
python3 -m agent.neurolledger.runner --hospitals "manipal,srenivas,dfl" --round 1 --no-chain --no-tee

# Live on-chain round (loads .env automatically):
python3 -m agent.neurolledger.runner --hospitals "manipal,srenivas,dfl" --round 4 --no-tee

# Single module test:
python3 -c "from agent.neurolledger.aggregator import aggregate; print('ok')"
```

## Chain & Contract

- **Network**: 0G Galileo Testnet, Chain ID **16602**, RPC `https://evmrpc-testnet.0g.ai`
- **Explorer**: `https://chainscan-galileo.0g.ai`
- **Contract**: `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` (in `frontend/lib/deployment.json`)
- **Aggregator** = deployer = `PRIVATE_KEY` wallet (set via `setAggregator` — required for `publishAggregation`)
- **MIN_STAKE**: 0.01 OG per agent registration

### Contract access control
- `registerAgent` — any EOA, payable (≥0.01 OG)
- `startRound` / `submitGradient` — `onlyActive` registered agents
- `publishAggregation` — `onlyAggregator` (the address set via `setAggregator`)
- `setAggregator` — `onlyOwner`

### Gas limits (0G Galileo requires more than local):
- `registerAgent`: 500,000 (needs ~332k)
- `submitGradient`: 400,000
- `publishAggregation`: 500,000
- `startRound`: 200,000

## Frontend Architecture

The app is a single-page dashboard with 5 panels, selected via `Sidebar`. Panel index maps:
- `0` → `GlobalNetworkView` (Spline 3D background)
- `1` → `NodeDeploymentPanel` (MetaMask → register agent on-chain)
- `2` → `TrainingSimulator` (local simulation engine + HospitalSelector)
- `3` → `AttestationPanel` (reads real `AggregationComplete` events from 0G Galileo)
- `4` → `ArtifactLedger`

**Key lib files:**
- `lib/contract.ts` — ABI (8 events + all functions), chain constants
- `lib/deployment.json` — contract address (source of truth, read by both frontend and `runner.py`)
- `lib/simulation.ts` — demo engine powering TrainingSimulator; keeps its own state machine
- `lib/hooks.ts` — `useSimulation()`, `useWallet()`, `useTrainingRound()` via `useSyncExternalStore`
- `lib/wallet.ts` — MetaMask-only wallet state (no simulation fallback)

**No simulation in chain-facing panels**: `NodeDeploymentPanel` and `AttestationPanel` show real chain state or error — there is intentionally no fake-data fallback.

**ethers.js v6** is used throughout (BrowserProvider, JsonRpcProvider, not v5 API).

## Python Agent Architecture

`runner.py` orchestrates 4 phases per round:
1. **Phase 0** — Register agents (if not already) + `startRound()` on-chain
2. **Phase 1** — Local training (UCI datasets) → Rényi DP noise → upload to 0G Storage → `submitGradient()` per hospital
3. **Phase 2** — Multi-Krum selection + trimmed mean aggregation (local)
4. **Phase 3** — TeeML attestation (skipped with `--no-tee`)
5. **Phase 4** — `publishAggregation()` on-chain

**Model**: `FederatedLogisticRegression` uses a 64-dim global weight space. Each hospital has a private random projection matrix `P_local` seeded by `hash(hospital_name)` that maps native features → 64-dim.

**Hospital registered names** (used in `--hospitals` flag and `hospital_map.json`):
- `manipal` → UCI Heart (13-dim, 297 samples)
- `srenivas` → Pima Diabetes (8-dim, 768 samples)
- `dfl` → Breast Cancer sklearn (30-dim, 569 samples)
- `rusty` → UCI Kidney Disease (24-dim, 400 samples)

**CID format**: `"0g-" + sha256(content_bytes).hexdigest()` — the 0G Storage indexer is often unavailable (503), so `storage.py` falls back to deterministic CIDs.

**`.env` loading**: `runner.py` auto-loads `.env` from the repo root via `python-dotenv`. The key env vars are `AGENT_A_KEY` through `AGENT_E_KEY`, `CONTRACT_ADDRESS`, `OG_RPC_URL`.

## Environment Setup

Copy `.env.example` to `.env` at repo root and fill:
```
PRIVATE_KEY=          # Deployer + AGENT_A (same wallet is fine for testing)
OG_RPC_URL=https://evmrpc-testnet.0g.ai
AGENT_A_KEY=          # manipal wallet
AGENT_B_KEY=          # srenivas wallet
AGENT_C_KEY=          # dfl wallet
CONTRACT_ADDRESS=0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD
```

Python deps: `pip install -r agent/requirements.txt` (torch, web3, python-dotenv, scikit-learn, pandas, numpy)

## Hardhat Networks

- `og_galileo` — live testnet (Chain ID 16602)
- `og_newton` — alias for og_galileo (same RPC)
- `hardhat` — local node (Chain ID 31337)

`viaIR: true` is set in hardhat.config.cjs (needed to avoid stack-too-deep in NeuroLedger.sol).
