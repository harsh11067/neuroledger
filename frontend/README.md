# NeuroLedger Frontend

Next.js 15 dashboard for the NeuroLedger verifiable federated learning network.

## Live

[neuroledgerprivacycommunity.vercel.app](https://neuroledgerprivacycommunity.vercel.app/)

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
# → http://localhost:3000
```

The dashboard reads live data from 0G Mainnet (Chain 16661). No backend server required — all chain reads use public RPC.

## Dashboard Panels

| Panel | Description |
|-------|-------------|
| **GlobalNetworkView** | Spline 3D visualization of the hospital node network |
| **NodeDeploymentPanel** | Connect MetaMask → register a new hospital agent on-chain |
| **TrainingSimulator** | Run a local FL simulation or trigger an on-chain round |
| **AttestationPanel** | Live `AggregationComplete` events with TeeML proof status badges |
| **ArtifactLedger** | All 8 on-chain event types, last 200k blocks, filterable |

## Configuration

The app reads from `lib/deployment.json` and `lib/contract.ts`:

```json
{
  "contractAddress": "0x8a3f97561819e66959cbECEE664e87bd10b8F865",
  "network": "mainnet",
  "chainId": 16661
}
```

To point at testnet, set:
```json
{
  "contractAddress": "0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD",
  "network": "galileo",
  "chainId": 16602
}
```

## Build

```bash
npm run build    # production build
npm run lint     # ESLint
npx tsc --noEmit # type check
```
