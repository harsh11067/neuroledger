# NeuroLedger Mechanism Design

The core mechanisms of NeuroLedger ensure Byzantine-robustness, data privacy, and incentive alignment.

## 1. Byzantine-Robust Aggregation (Multi-Krum + Trimmed Mean)

To protect the global model from poisoning attacks, NeuroLedger uses Multi-Krum followed by coordinate-wise Trimmed Mean:

**Multi-Krum** (`agent/neurolledger/aggregator.py`):
- Computes the sum of squared Euclidean distances from each gradient to its `n − f − 2` nearest neighbors (`f` = tolerated Byzantine agents)
- For `n ≤ 2` or any single-agent round, all gradients are selected (degenerate case handled gracefully)
- Selects the `n − f` gradients with the lowest scores — effectively discarding outliers

**Coordinate-wise Trimmed Mean**:
- After Krum selection, averages the selected gradients dimension-by-dimension
- `trim_fraction=0` means plain mean; non-zero trims equal fractions from each tail

**Determinism and reproducibility**: The full aggregation trace (algorithm, n_agents, f_tolerated, sorted update hashes, Krum scores, selected indices, output SHA256) is serialized canonically and hashed. Anyone with the gradient CIDs can re-run `scripts/verify_aggregation.py` and reproduce the exact `aggregationHash` stored on-chain.

**TEE enforcement**: The aggregation trace is sent to the 0G Compute TeeML enclave via `tee_bridge.mjs`. The enclave hardware-verifies the computation and returns a signed proof bundle uploaded to 0G Storage.

## 2. Privacy Mechanism (Rényi Differential Privacy)

NeuroLedger uses Rényi Differential Privacy (RDP) to bound information leakage per round:

**Parameters** (applied in `agent/neurolledger/dp.py`):
- ε = 1.0, δ = 1e-5 (Rényi DP budget)
- Gradient norm clipping to `clip_norm = 1.0` before noise injection
- Gaussian noise σ calibrated to `clip_norm / ε`

**What this guarantees**: Even with access to all global model checkpoints, an adversary cannot determine with statistical confidence whether a specific patient record was used in training.

**On-chain accounting**: The `dpEpsilonConsumed` field in `AggregationComplete` tracks the privacy budget consumed per round, enabling per-agent cumulative DP tracking by auditors.

## 3. Autonomous Agent Decision Engine

Hospital agents are autonomous decision-makers, not passive gradient senders:

```
After each round:
  improvement = global_model_accuracy_round_N − global_model_accuracy_round_N-1

  if improvement >= +0.5%  → ACCEPT   (adopt global model)
  if improvement >= −1.0%  → RETRAIN  (keep old model, schedule extra local epochs)
  else                     → REJECT   (flag round on-chain, governance escalation if majority)
```

Each decision produces a `decisionRecord` hashed as `SHA256(record_bytes)` and submitted on-chain via `submitDecision(roundId, decision, proofHash)`. Inconsistencies (decision says ACCEPT but improvement is negative) are catchable on-chain and trigger reputation slashing.

**Governance escalation**: If majority of participants REJECT the same round, `GovernanceTrigger` fires on-chain, freezing reward distribution for that round.

## 4. On-Chain Coordination (NeuroLedger.sol)

The contract on 0G Mainnet (`0x8a3f97561819e66959cbECEE664e87bd10b8F865`) manages the 8-event lifecycle:

- **Immutability**: Once a CID or hash is posted in an event, it cannot be changed
- **Agent reputation**: Reputation (0–10000 basis points) updates each round — agents below 2000 are excluded from the next round by contract logic
- **Staking**: Agents stake OG on registration; slashing is applied for dishonest behavior
- **Auditability**: All 8 event types are indexable via standard EVM log queries from the last 200k blocks (the frontend queries `-200000` block range to catch all rounds)

## 5. 0G Storage CID Types

Two CID formats appear on-chain:

| Prefix | Meaning | Downloadable |
|--------|---------|-------------|
| `0x...` | Real 0G Storage Merkle root — the file was uploaded via the SDK | Yes — `GET /file?root=0x<root>` |
| `0g-...` | SHA256 fallback — used when SDK upload failed; file may be in local cache only | No |

The frontend's `AttestationPanel` correctly distinguishes these: only `0x`-prefixed CIDs show a download button. `0g-`-prefixed CIDs show "SHA-256 ref" (not uploadable to 0G Storage) and zero-value CIDs are silently hidden.

## 6. TeeML Two-Phase Attestation

`tee_bridge.mjs` implements a two-phase flow to handle funded vs unfunded wallets gracefully:

**Phase 1 — Hardware Verification (always free)**
- `broker.inference.verifyService(provider)` → DStack TDX verification
- Checks: TEE signer address match + Docker Compose hash match
- Result: `hardware_verified = signerMatch && composeHash`

**Phase 2 — TeeML Inference (requires funded ledger)**
- `broker.inference.getRequestHeaders(provider, prompt)` → signed headers
- `fetch(endpoint/chat/completions)` with the aggregation trace prompt
- `broker.inference.processResponse(provider, chatID, usage)` → `isValid: true`
- Result: `inference_valid = true`

**Final `is_valid` logic**: `isValid = inferenceIsValid || (hardwareVerified && !inferenceError)`

This means rounds where Phase 2 fails due to insufficient ledger balance still produce a valid hardware-attested proof (Phase 1 only), rather than failing completely.
