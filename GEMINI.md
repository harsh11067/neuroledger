# NeuroLedger — Project Instructions & Standards

> Verifiable Autonomous Clinical Intelligence Network  
> Built on 0G Modular Infrastructure

---

## 1. Project Overview

NeuroLedger is a decentralized federated learning network for medical imaging. It uses **0G Storage** for gradient data, **0G Chain** for coordination, and **Intel TDX (TEE)** for secure aggregation.

### High-Fidelity Vision
The project aims for a "production-grade" aesthetic with real-time technical feedback. Avoid "mock" behaviors; every UI element should correspond to a verifiable cryptographic or networking event.

---

## 2. Technical Stack

- **Blockchain:** 0G Newton Testnet (EVM-compatible, Chain ID 16602)
- **Storage:** 0G Storage (CID-based addressing)
- **TEE:** Intel TDX via 0G Private Compute (simulated in frontend, implemented in Python)
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Motion (framer-motion)
- **Backend:** Python 3.11+, PyTorch, Hardhat (Solidity)

---

## 3. Current Progress (as of May 13, 2026)

### Completed (Week 1 & Week 2 Day 8-12)
- [x] **Smart Contracts:** 8-event lifecycle implemented in `NeuroLedger.sol`. (Deployed at `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD`)
- [x] **Agent Engine:** Python implementation of `HospitalAgent`, `LocalTrainer`, and `TEEAggregator`.
- [x] **Frontend Architecture:** High-fidelity dashboard with Spline background.
- [x] **Simulation Engine:** 8-phase lifecycle (Training -> Deciding) with deep logging.
- [x] **TEE Integration:** Proof bundle display (7 fields) including MRENCLAVE and TEE signatures.
- [x] **Artifact Ledger:** On-chain event tracking and 0G Storage file tree.

### In Progress / Missing
- [ ] Real-time wallet event listening (currently simulated in `simulation.ts`).
- [ ] Direct 0G Storage SDK integration in the browser (currently using simulated CIDs).
- [ ] Multi-hospital peer-to-peer discovery (currently centralized simulation).

---

## 4. Development Workflow

### Frontend
```bash
cd frontend
npm run dev
```
*Note: If the dashboard fails to open, ensure port 3000 is clear or check `next.config.ts` for `outputFileTracingRoot` settings.*

### Frontend (Astro)
The project includes an Astro-based site in `radiant-debris/`.
- **MCP Server:** Configured in `.gemini/settings.json` to use Astro docs (`https://mcp.docs.astro.build/mcp`) for better documentation access.

### Backend Tests
```bash
# Contract tests
npx hardhat test

# Python logic
python3 agent/neurolledger/e2e_test.py
```

---

## 5. UI/UX Standards

- **Color Palette:**
  - Background: `#0d1117` (Deep Navy)
  - Neon Blue: `#00f0ff` (Primary Action)
  - Neon Purple: `#7000ff` (TEE/Security)
  - Status Success: `#00ff96` (Verified)
- **Fidelity Mandate:**
  - Always use `AnimatePresence` for panel transitions.
  - Every "mock" event must be backed by a `SimEvent` in `lib/simulation.ts`.
  - Maintain the "Deterministic Verification" stamp on the landing page.

---

*NeuroLedger — Where every hospital's knowledge becomes everyone's medicine.*
