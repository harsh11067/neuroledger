# NeuroLedger Setup Guide

## 1. Prerequisites

- **Node.js**: v18 or higher
- **Python**: v3.11 or higher
- **Wallet**: MetaMask with 0G Galileo Testnet funds
- **Operating System**: Linux (recommended) or macOS

## 2. Environment Configuration

Copy the example environment file and fill in your keys:
```bash
cp .env.example .env
```

Required variables:
- `PRIVATE_KEY`: Your wallet's private key (for deployment and agent A)
- `AGENT_A_KEY`, `AGENT_B_KEY`, `AGENT_C_KEY`: Private keys for hospital agents
- `CONTRACT_ADDRESS`: `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` (or your own deployment)

## 3. Frontend Installation

```bash
cd frontend
npm install
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

## 4. Backend (Python) Installation

From the project root:
```bash
# Create and activate virtual environment
python3 -m venv agent/venv
source agent/venv/bin/activate

# Install dependencies
pip install -r agent/requirements.txt
```

## 5. Deployment (Optional)

If you need to deploy a new version of the contract:
```bash
npx hardhat run scripts/deploy.ts --network og_galileo
```

## 6. Running a Training Round

Execute the end-to-end runner:
```bash
PYTHONPATH=. agent/venv/bin/python -m agent.neurolledger.runner \
  --hospitals manipal,srenivas,dfl \
  --round 1
```

## 7. TEE Verification (0G Compute)

Ensure you have the 0G Compute SDK installed:
```bash
npm install @0gfoundation/0g-compute-ts-sdk
```
The project uses `agent/neurolledger/tee_bridge.mjs` to interface with the TEE hardware via the 0G Compute network.
