# NeuroLedger — On-Chain Proof Bundle

**Network:** 0G Galileo Testnet · Chain ID 16602  
**Explorer:** https://chainscan-galileo.0g.ai  
**Date:** May 16, 2026 (hackathon deadline)

---

## Core Addresses

| Role | Address |
|------|---------|
| Smart Contract | `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` |
| Owner / Aggregator | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` |
| TeeML Provider (qwen-2.5-7b) | `0xa48f01287233509FD694a22Bf840225062E67836` |

**Contract on Explorer:**  
https://chainscan-galileo.0g.ai/address/0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD

---

## Registered Agents (7 total)

| Hospital Name | Address | Registration TX |
|---------------|---------|-----------------|
| manipal | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` | [0x47d06...](https://chainscan-galileo.0g.ai/tx/0x47d061dfe10d2795f390ab50f0cbf295404217c234dddd67c0b25755638e9cf9) |
| srenivas | `0xC2B7C2B9C923941A14b3e1f42897b1769EEA28C3` | [0xa7c49...](https://chainscan-galileo.0g.ai/tx/0xa7c4907c34e4a3fcc897b17d6f7c2ffdc7445d061a02738b6068bb54996bedda) |
| dfl | `0x2633a0d83a2aA43449DAd7a304a0EE71F5Bfa8eC` | [0x44a02...](https://chainscan-galileo.0g.ai/tx/0x44a02559e1af7444be8587951a6dce0f1195405176c4a0af81a9ac950bc9266c) |
| Medanta | `0x7A5b2b436991929b6429a10650A2ebF681DE33E0` | [0xc4ddb...](https://chainscan-galileo.0g.ai/tx/0xc4ddb643ef7c338549f6858289a46812436839903a5386dafd0c0f400d5ef6be) |
| Medanta | `0x907c508449eb3F9D14BD8844AC71839DE90bD046` | [0x6a1bd...](https://chainscan-galileo.0g.ai/tx/0x6a1bdf682dc1da73e93d1d865fe585e2a0bf52303a692ff586c733d66d0a48cb) |
| vedanta | `0x01239786Ac8c9D78F8055045d7a3e7E18e5492DA` | [0xc998e...](https://chainscan-galileo.0g.ai/tx/0xc998e5a2dc1a254c75cfc1372e5e445808577ecfd4fa4855c56a3260d511972f) |
| Kokilaben Dhirubhai Ambani Hospital | `0x3b9A0b46CF4e583aDA6CddF87970D5EB4DAAaA09` | [0x894cc...](https://chainscan-galileo.0g.ai/tx/0x894cc22c494fcd65386322cf46ae81efc21e4c18e321a56739c8a510a16584e9) |

---

## TeeML Attestation — 0G Compute Network

**Provider:** `0xa48f01287233509FD694a22Bf840225062E67836`  
**Model:** `qwen/qwen-2.5-7b-instruct`  
**Hardware:** DStack TEE (Intel TDX)  
**Verifiability:** TeeML  

TEE attestation status per round:
- **Rounds 1–11:** No TEE (early test rounds, `teeProofCID = 0g-000...`)
- **Rounds 12–17:** Hardware attestation only (`hardware_verified=True`, `inference_valid=False` — wallet underfunded)
- **Rounds 18–21:** Full TeeML live ✅ (`hardware_verified=True`, `inference_valid=True`, `signerMatch=True`, `composeHash=True`)

**Round 19 — Full TEE proof (reference round):**
- TX: https://chainscan-galileo.0g.ai/tx/0x2e26d3540e14adbdf8b6dfd490a3a65d85fa46923c624be6f29393c8e1c61d29
- Proof hash: `0x7670d4db11667486652092a8e808e51476be5a9310140cb9a43468ff47062771`
- TEE Proof CID: `0x898adb9ae2e8c66e9ea19d123b2c7ac6101322b889c2283e50297fc1271fb5e8`
- Global model CID: `0x67da144d6c2aea98b47298258ffe468912bc4e55efc4c1df8bde25947a4b7a53`

---

## All 17 AggregationComplete Rounds

| Round | Block | Aggregation TX | TEE Proof CID | Status |
|-------|-------|---------------|---------------|--------|
| 1 | 33390833 | [0xe4dc0...](https://chainscan-galileo.0g.ai/tx/0xe4dc059a32524e633536f5fefff896f34cf0b910111e6e71ce65c49cc5f2843e) | `0g-000...` | No TEE |
| 3 | 33229317 | [0x496e8...](https://chainscan-galileo.0g.ai/tx/0x496e84e656b1e97c838527f4515d3fbac70106b77fece39786c3c7ef8d2fd96a) | `0g-000...` | No TEE |
| 4 | 33288852 | [0xdbb88...](https://chainscan-galileo.0g.ai/tx/0xdbb88e9bb14544cd34ffb40aa55f55629a1a37b01cc8a9f23614a7f7b8e55012) | `0g-000...` | No TEE |
| 5 | 33315401 | [0x0f77a...](https://chainscan-galileo.0g.ai/tx/0x0f77ab1be0fbac95fe231d08192c2723a1980e9f9bd0f72effac18fca009b1c6) | `0g-000...` | No TEE |
| 8 | 33398863 | [0x9c9e7...](https://chainscan-galileo.0g.ai/tx/0x9c9e766128757932505db1c72d756a50274361697b52c33f42c3e304ea509cb6) | `0g-000...` | No TEE |
| 9 | 33399285 | [0x9ada7...](https://chainscan-galileo.0g.ai/tx/0x9ada79b300ba7d8545cebf1a3de42e8692c32a6727370da6254b1bb7f1c48d60) | `0g-000...` | No TEE |
| 10 | 33400337 | [0x4ad0f...](https://chainscan-galileo.0g.ai/tx/0x4ad0f248b840ba56d493c7d3c6cdfe4e2cde6aa562cee2f04a4cc096583f8b31) | `0g-000...` | No TEE |
| 12 | 33483487 | [0x3f185...](https://chainscan-galileo.0g.ai/tx/0x3f185980da568ca03a8df2d3c35d502c24f4c2dba9cdb4206277ca3453d1a1dd) | `0g-2d043...` | HW only |
| 13 | 33483850 | [0xdab2e...](https://chainscan-galileo.0g.ai/tx/0xdab2ec3e71bcb06b02b75caf7084001f1b4ef9a98294ff79d736f2c2a128473e) | `0xc5586...` | HW only |
| 14 | 33484178 | [0xcd8b1...](https://chainscan-galileo.0g.ai/tx/0xcd8b1256f2b3244bdd821b399a518ddd83ecdac3539bd343e84c114bf756cea6) | `0x517a1...` | HW only |
| 15 | 33484505 | [0x2b636...](https://chainscan-galileo.0g.ai/tx/0x2b6362004d2b77f9888f70e421988dd9ebbd6a5ee50058f195b1de3153986a3b) | `0x1ea1c...` | HW only |
| 16 | 33487107 | [0x53c48...](https://chainscan-galileo.0g.ai/tx/0x53c48d0b9d62d314b8c2bf72a48bdc00b6f321bb63ce5d3132096d8ae860b6ad) | `0g-8d81f...` | HW only |
| 17 | 33492601 | [0xa69f9...](https://chainscan-galileo.0g.ai/tx/0xa69f955f865bbf9c005586b7270ff206193cd324397bdaa2573e6844a34c92a1) | `0g-a2c64...` | HW only |
| 18 | 33493805 | [0x9bf7b...](https://chainscan-galileo.0g.ai/tx/0x9bf7b44fb006cf331d4c3c2ad98d9e570f8fa6875dc80b0405a9fedf00810ed4) | `0xd21b5...` | ✅ Full TeeML |
| 19 | 33494171 | [0x2e26d...](https://chainscan-galileo.0g.ai/tx/0x2e26d3540e14adbdf8b6dfd490a3a65d85fa46923c624be6f29393c8e1c61d29) | `0x898ad...` | ✅ Full TeeML |
| 20 | 33494779 | [0x8a1e2...](https://chainscan-galileo.0g.ai/tx/0x8a1e2f03184faa479d7fb6b5c964d45bc85b93268087a77da34e808345f20a31) | `0g-abb5a...` | ✅ Full TeeML |
| 21 | 33496175 | [0x79b6d...](https://chainscan-galileo.0g.ai/tx/0x79b6d02cc3c2354c93b220b65aa6a12118ec8977d1b311b21601a082732d3b5d) | `0x2215d...` | ✅ Full TeeML |

---

## Key Hashes — Round 19 (Full TeeML Reference)

```
Aggregation hash:   0x65086917816b741ad103b08f3ef18cc8100344656f28a556660ded2808ed6075
Proof hash:         0x7670d4db11667486652092a8e808e51476be5a9310140cb9a43468ff47062771
TEE Proof CID:      0x898adb9ae2e8c66e9ea19d123b2c7ac6101322b889c2283e50297fc1271fb5e8
Global Model CID:   0x67da144d6c2aea98b47298258ffe468912bc4e55efc4c1df8bde25947a4b7a53
Model Version ID:   round_19_v7670d4db
TX Hash:            0x2e26d3540e14adbdf8b6dfd490a3a65d85fa46923c624be6f29393c8e1c61d29
Block:              33494171
```

---

## Key Hashes — Round 21 (Latest)

```
Aggregation hash:   0xf79001435498cf7651a43742721d6c0c82ae8c35c40f216f28df9afe423f3afa
Proof hash:         0x83179515e6b794fd3e25afd16f9f9e56a1f02e66af47cd147b739a3a8201afee
TEE Proof CID:      0x2215dd9ac34587e8859dfe7ee61d4ba10fa6891c0ced8d645e8bea22f6caed60
Global Model CID:   0x6626e393c8ffb9b6ffdd4759fdec57e5ffc7ba0b64b7fcd5ad887be15b755750
TX Hash:            0x79b6d02cc3c2354c93b220b65aa6a12118ec8977d1b311b21601a082732d3b5d
Block:              33496175
```

---

## 0G Storage — Indexer

**Turbo Indexer RPC:** `https://indexer-storage-testnet-turbo.0g.ai`  
CIDs starting with `0x` are Merkle roots from the 0G storage SDK.  
CIDs starting with `0g-` are SHA-256 deterministic fallbacks (indexer unavailable at upload time).

---

## 0G Compute SDK

**Package:** `@0gfoundation/0g-compute-ts-sdk`  
**Bridge:** `agent/neurolledger/tee_bridge.mjs` (Node.js ESM, Router path)  
**Provider discovery:** `broker.inference.listService(0, 50, false)` → filter `verifiability === "TeeML" && serviceType === "chatbot"`  
**Hardware verify:** `broker.inference.verifyService(provider)` → DStack TDX `signerMatch` + `composeHash`  
**Inference verify:** `broker.inference.processResponse(provider, chatID, usage)` → `isValid: true`

---

## Mainnet Cost Estimate (0G Mainnet)

**Wallet:** `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` — **1.983 OG**

| Operation | Gas | Est. Cost |
|-----------|-----|-----------|
| Deploy NeuroLedger.sol | ~3.5M gas | ~0.004 OG |
| registerAgent × 3 | ~332k each | ~0.001 OG each + **0.01 OG stake each** |
| startRound | ~100k | ~0.0001 OG |
| submitGradient × 3 | ~120k each | ~0.0004 OG |
| publishAggregation | ~200k | ~0.0002 OG |
| **Per full round** | ~700k | **~0.001 OG** |

**Summary:**
- Contract deploy + 3 agents: ~0.04 OG gas + 0.03 OG stake = **~0.07 OG**
- Each subsequent round: **~0.001 OG**
- Remaining after setup (~20 rounds): **~1.89 OG left**
- ⚠️ **TeeML compute ledger on mainnet requires 3 OG minimum** — your 1.983 OG is **insufficient** for TeeML inference on mainnet
- Recommendation: Deploy contract + run rounds on mainnet for judge verification; keep TeeML attestation on testnet where compute ledger is already funded
