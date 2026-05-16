# NeuroLedger — On-Chain Proof Bundle

**Hackathon:** 0G APAC Hackathon 2026 — Deadline May 16, 2026

---

## Deployments

| Network | Contract Address | Explorer |
|---------|-----------------|---------|
| **0G Mainnet** (Chain 16661) | `0x8a3f97561819e66959cbECEE664e87bd10b8F865` | [View](https://chainscan.0g.ai/address/0x8a3f97561819e66959cbECEE664e87bd10b8F865) |
| **0G Galileo Testnet** (Chain 16602) | `0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD` | [View](https://chainscan-galileo.0g.ai/address/0x1f52371d93bBdAeEBBAdbEA72A7f7ceb6f6503DD) |

**Mainnet Deploy TX:** [0x34b66c9...](https://chainscan.0g.ai/tx/0x34b66c9ad09d6c5f8eeb561ca805171da32ddedbb6a1ddc340cc4d06752c2ed9)

---

## Core Addresses

| Role | Address |
|------|---------|
| Owner / Aggregator / Deployer | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` |
| **Mainnet TeeML Provider** (deepseek-chat-v3-0324) | `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` |
| Testnet TeeML Provider (qwen-2.5-7b) | `0xa48f01287233509FD694a22Bf840225062E67836` |

---

## Testnet: Registered Agents (7 total)

| Hospital | Address | TX |
|----------|---------|-----|
| manipal | `0x071a19F7eB5D2eD8188858c5f69de44CcBD725e3` | [0x47d06...](https://chainscan-galileo.0g.ai/tx/0x47d061dfe10d2795f390ab50f0cbf295404217c234dddd67c0b25755638e9cf9) |
| srenivas | `0xC2B7C2B9C923941A14b3e1f42897b1769EEA28C3` | [0xa7c49...](https://chainscan-galileo.0g.ai/tx/0xa7c4907c34e4a3fcc897b17d6f7c2ffdc7445d061a02738b6068bb54996bedda) |
| dfl | `0x2633a0d83a2aA43449DAd7a304a0EE71F5Bfa8eC` | [0x44a02...](https://chainscan-galileo.0g.ai/tx/0x44a02559e1af7444be8587951a6dce0f1195405176c4a0af81a9ac950bc9266c) |
| Medanta | `0x7A5b2b436991929b6429a10650A2ebF681DE33E0` | [0xc4ddb...](https://chainscan-galileo.0g.ai/tx/0xc4ddb643ef7c338549f6858289a46812436839903a5386dafd0c0f400d5ef6be) |
| Medanta | `0x907c508449eb3F9D14BD8844AC71839DE90bD046` | [0x6a1bd...](https://chainscan-galileo.0g.ai/tx/0x6a1bdf682dc1da73e93d1d865fe585e2a0bf52303a692ff586c733d66d0a48cb) |
| vedanta | `0x01239786Ac8c9D78F8055045d7a3e7E18e5492DA` | [0xc998e...](https://chainscan-galileo.0g.ai/tx/0xc998e5a2dc1a254c75cfc1372e5e445808577ecfd4fa4855c56a3260d511972f) |
| Kokilaben Dhirubhai Ambani Hospital | `0x3b9A0b46CF4e583aDA6CddF87970D5EB4DAAaA09` | [0x894cc...](https://chainscan-galileo.0g.ai/tx/0x894cc22c494fcd65386322cf46ae81efc21e4c18e321a56739c8a510a16584e9) |

---

## Mainnet TeeML Attestation — Round 4

| | |
|---|---|
| **Provider** | `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` |
| **Model** | `deepseek/deepseek-chat-v3-0324` |
| **Hardware** | DStack TEE (Intel TDX) |
| **Verifiability** | TeeML |
| **hardware_verified** | `true` (signerMatch=true, composeHash=true) |
| **inference_valid** | `true` (processResponse → isValid=true) |

**Mainnet Round 4 — Full TeeML proof:**
```
TX:               0x575b1193d4690d981aafb64e7ec526572a1af0b76d546c86360d9c8d2bf11dd3
Aggregation hash: 0x6560e2fbb287318a32fd16c4dab9921867415fe7cbff7fa81c3d0c89a00f0018
TEE Proof hash:   0x26c85d157499efe27e0f27eea5a1c72518f235e9deb2782385fcb4ed82711516
TEE Proof CID:    0xbed29dc5015d97afe14951d7eed065ffdf46bdbcf85d673bbee1d7aefee91fe2
Global model CID: 0xdc15ea7cd1d9700dc26fd9f6289bbb936357223abc1587b97f90970c1ab76e79
Gradient CID (manipal): 0x88d9d2473c243b8bddca1aed2f1fc3476f75f82cecc85937b8774da5cee45e09
Model version:    round_4_v26c85d15
```

---

## Testnet TeeML Attestation

| | |
|---|---|
| **Provider** | `0xa48f01287233509FD694a22Bf840225062E67836` |
| **Model** | `qwen/qwen-2.5-7b-instruct` |
| **Hardware** | DStack TEE (Intel TDX) |
| **Verifiability** | TeeML |
| **Full TeeML Rounds** | 18, 19, 20, 21, 22, 23 (`inference_valid=True`, `signerMatch=True`, `composeHash=True`) |

**Round 19 — Full TEE proof (reference):**
```
TX:               0x2e26d3540e14adbdf8b6dfd490a3a65d85fa46923c624be6f29393c8e1c61d29
Proof hash:       0x7670d4db11667486652092a8e808e51476be5a9310140cb9a43468ff47062771
TEE Proof CID:    0x898adb9ae2e8c66e9ea19d123b2c7ac6101322b889c2283e50297fc1271fb5e8
Global model CID: 0x67da144d6c2aea98b47298258ffe468912bc4e55efc4c1df8bde25947a4b7a53
Block:            33494171
```

---

## Testnet AggregationComplete Events (25 rounds)

| Round | Block | TX | TEE Proof CID | Status |
|-------|-------|----|---------------|--------|
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
| 24 | 33518930 | [0x02c08...](https://chainscan-galileo.0g.ai/tx/0x02c086f62094073e674c315a1dc4268f46791a08b5d355baebb7f884e7cae315) | `0x59d0c...` | ✅ Full TeeML |
| 25 | 33519xxx | [0xaad9d...](https://chainscan-galileo.0g.ai/tx/0xaad9d88f441576de2a8352cdc31eeb3ecb1a72a86d24ad2c964688f3466d772f) | `0x59d0c...` | ✅ Full TeeML |

---

## 0G Storage

| | |
|---|---|
| **Turbo Indexer** | `https://indexer-storage-testnet-turbo.0g.ai` |
| **File endpoint** | `GET /file?root=0x<merkle_root>` |
| **CID format** | `0x` prefix = real Merkle root (downloadable) · `0g-` prefix = SHA256 ref (pre-fix rounds) |
| **Propagation** | ~30-45 min after upload |

---

## 0G Compute SDK

```
Package:  @0gfoundation/0g-compute-ts-sdk
Bridge:   agent/neurolledger/tee_bridge.mjs  (Node.js ESM, Router path)
Provider: broker.inference.listService(0, 50, false) → filter TeeML chatbot
Verify:   broker.inference.verifyService(provider)  → DStack TDX signerMatch + composeHash  
Infer:    broker.inference.processResponse(provider, chatID, usage) → isValid: true
```
