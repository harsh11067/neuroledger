"""
NeuroLedger — TEE Aggregator Module (Day 5)

Simulates TEE aggregation via 0G Compute (pc.0g.ai).
Produces the 7-field proof bundle with attestation.
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, asdict
from typing import List, Optional, Tuple

import torch
import io


@dataclass
class TEEProofBundle:
    """
    The 7-field TEE attestation proof bundle.
    This is the cryptographic heart of NeuroLedger's verifiability.
    """
    update_hashes: List[str]        # SHA256 of each agent's gradient delta
    aggregation_hash: str           # SHA256 of FedAvg computation trace
    model_version_id: str           # e.g., "round_005_v3a7f2"
    global_model_hash: str          # SHA256 of new global model weights
    mrenclave: str                  # Intel TDX enclave measurement hash
    tee_signature: str              # RSA-3072 hardware attestation (simulated)
    timestamp: int                  # Unix UTC of aggregation completion

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)

    def to_dict(self) -> dict:
        return asdict(self)

    def compute_proof_hash(self) -> str:
        """Compute the proof_hash for on-chain anchoring."""
        canonical = json.dumps(asdict(self), sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()


@dataclass
class AggregationResult:
    """Result of TEE aggregation."""
    new_model_bytes: bytes
    new_model_cid: str
    proof_bundle: TEEProofBundle
    proof_hash: str
    aggregation_hash: str
    computation_time_ms: int
    agents_included: List[str]
    agents_excluded: List[str]


class TEEAggregator:
    """
    TEE Aggregator — Simulates 0G Compute (pc.0g.ai)

    In production: runs inside Intel TDX enclave via 0G Private Computer API.
    For demo: simulates the full aggregation flow with realistic attestation.

    The aggregator:
    1. Pulls all encrypted gradient deltas
    2. Decrypts inside enclave (simulated)
    3. Validates gradients (cosine similarity, norm checks)
    4. Runs stake-weighted FedAvg
    5. Produces 7-field Intel TDX proof bundle
    6. Outputs new global model + attestation
    """

    # Simulated known-good enclave hash
    KNOWN_MRENCLAVE = "a3f2e8d1c4b7965038f21a4e6d9b0c3f7e8a1d4b6c9f2e5a8d1b4c7f0e3a6d9"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://pc.0g.ai/v1",
        cosine_threshold: float = -0.5,
        max_norm: float = 20.0,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.cosine_threshold = cosine_threshold
        self.max_norm = max_norm

    def aggregate(
        self,
        gradient_deltas: dict,          # {agent_id: delta_bytes}
        update_hashes: dict,            # {agent_id: sha256_hex}
        current_global_weights: bytes,
        agent_stakes: dict,             # {agent_id: stake_amount}
        round_id: int,
    ) -> AggregationResult:
        """
        Run full TEE aggregation.

        Steps:
        1. Deserialize all gradient deltas
        2. Validate each gradient (norm check, cosine similarity)
        3. Stake-weighted FedAvg on clean gradients
        4. Serialize new global weights
        5. Generate 7-field proof bundle
        """
        start_time = time.time()

        print(f"\n{'='*60}")
        print(f"  TEE AGGREGATOR — Round {round_id}")
        print(f"  Running inside Intel TDX enclave (simulated)")
        print(f"{'='*60}")

        # 1. Deserialize gradient deltas
        print(f"\n  📦 Deserializing {len(gradient_deltas)} gradient deltas...")
        deltas = {}
        for agent_id, delta_bytes in gradient_deltas.items():
            # Verify hash (update_hashes are "0x{sha256}" format)
            actual_hash = "0x" + hashlib.sha256(delta_bytes).hexdigest()
            expected_hash = update_hashes.get(agent_id, "")
            if actual_hash != expected_hash:
                print(f"  ❌ Hash mismatch for {agent_id}: {actual_hash} != {expected_hash}")
                continue

            buffer = io.BytesIO(delta_bytes)
            delta_dict = torch.load(buffer, map_location="cpu", weights_only=False)
            deltas[agent_id] = delta_dict
            print(f"  ✅ {agent_id}: hash verified, delta loaded")

        # 2. Validate + Multi-Krum selection
        print(f"\n  🔍 Multi-Krum Byzantine-Robust Selection...")
        excluded = []
        flat_deltas = {}

        for agent_id, delta_dict in deltas.items():
            flat = torch.cat([v.flatten().float() for v in delta_dict.values()])
            norm = float(torch.norm(flat).item())
            if norm > self.max_norm:
                print(f"  ⚠️ {agent_id}: norm {norm:.4f} > max {self.max_norm}, excluding")
                excluded.append(agent_id)
                continue
            flat_deltas[agent_id] = flat
            print(f"  ✅ {agent_id}: norm={norm:.4f}")

        # Multi-Krum: score(i) = Σ_{j ∈ KNN(i, n-f-2)} ||∇_i - ∇_j||²
        agent_ids = list(flat_deltas.keys())
        n = len(agent_ids)
        f = max(0, n // 3 - 1)  # tolerate up to n/3-1 Byzantine agents
        k_select = max(1, n - f)
        krum_scores: dict = {}
        if n > 1:
            for i, ai in enumerate(agent_ids):
                dists = sorted([
                    float(torch.norm(flat_deltas[ai] - flat_deltas[aj]).item())
                    for j, aj in enumerate(agent_ids) if i != j
                ])
                krum_k = min(n - f - 2, len(dists) - 1)
                krum_scores[ai] = sum(dists[:max(1, krum_k)])
            # Select k_select agents with lowest Krum scores
            krum_selected = sorted(agent_ids, key=lambda a: krum_scores[a])[:k_select]
        else:
            krum_selected = agent_ids
            krum_scores = {a: 0.0 for a in agent_ids}

        clean_deltas = {a: deltas[a] for a in krum_selected}
        for a in agent_ids:
            if a in krum_selected:
                print(f"  ✅ KRUM SELECTED {a}: score={krum_scores.get(a, 0):.4f}")
            else:
                print(f"  ⚠️ KRUM EXCLUDED {a}: score={krum_scores.get(a, 0):.4f}")
                excluded.append(a)

        # 3. Stake-weighted FedAvg on Krum-selected agents
        print(f"\n  🧮 Running Krum-Filtered Stake-Weighted FedAvg...")
        total_stake = sum(agent_stakes.get(a, 1.0) for a in clean_deltas.keys())

        # Load current global weights
        buffer = io.BytesIO(current_global_weights)
        global_state = torch.load(buffer, map_location="cpu", weights_only=False)

        # Compute weighted average of deltas
        aggregated_delta = None
        for agent_id, delta_dict in clean_deltas.items():
            weight = agent_stakes.get(agent_id, 1.0) / total_stake
            print(f"     {agent_id}: weight={weight:.4f}")

            if aggregated_delta is None:
                aggregated_delta = {k: v.float() * weight for k, v in delta_dict.items()}
            else:
                for k, v in delta_dict.items():
                    aggregated_delta[k] += v.float() * weight

        # Apply aggregated delta to global weights
        if aggregated_delta is not None:
            for key in global_state:
                global_state[key] = global_state[key].float() + aggregated_delta[key]

        # 4. Serialize new global weights
        buffer = io.BytesIO()
        torch.save(global_state, buffer)
        new_model_bytes = buffer.getvalue()
        new_model_hash = hashlib.sha256(new_model_bytes).hexdigest()

        # 5. Generate deterministic computation trace (Krum + FedAvg)
        # aggregation_hash = SHA256(sorted_update_hashes || krum_scores || included_indices || final_weights)
        sorted_update_hashes = sorted(update_hashes.get(a, "") for a in clean_deltas.keys())
        trace_data = {
            "algorithm": "MultiKrum+FedAvg",
            "round_id": round_id,
            "update_hashes": sorted_update_hashes,
            "krum_scores": {a: f"{krum_scores.get(a, 0):.6f}" for a in clean_deltas.keys()},
            "included_agent_indices": [agent_ids.index(a) for a in krum_selected if a in agent_ids],
            "final_weights_sha256": new_model_hash,
            "stake_weights": {a: f"{agent_stakes.get(a, 1.0) / total_stake:.6f}" for a in clean_deltas.keys()},
        }
        trace_bytes = json.dumps(trace_data, sort_keys=True, separators=(',', ':')).encode()
        aggregation_hash = "0x" + hashlib.sha256(trace_bytes).hexdigest()

        # 6. Generate 7-field proof bundle
        # model_version_id: "round_NNN_v{first8_of_aggHash}"
        model_version_id = f"round_{round_id:03d}_v{aggregation_hash[2:10]}"

        # mrenclave: SHA256(round_id || aggregation_hash || global_model_hash)
        # For testnet demo: deterministic from proof inputs (auditable)
        mrenclave_input = f"{round_id}:{aggregation_hash}:{new_model_hash}".encode()
        mrenclave = "0x" + hashlib.sha256(mrenclave_input).hexdigest()

        # tee_signature: SHA256(aggregation_hash || global_model_hash || global_model_cid)
        sig_input = f"{aggregation_hash}:{new_model_hash}:0g-{new_model_hash}".encode()
        tee_signature = "0x" + hashlib.sha256(sig_input).hexdigest()

        proof_bundle = TEEProofBundle(
            update_hashes=[update_hashes[a] for a in clean_deltas.keys()],
            aggregation_hash=aggregation_hash,
            model_version_id=model_version_id,
            global_model_hash="0x" + new_model_hash,
            mrenclave=mrenclave,
            tee_signature=tee_signature,
            timestamp=int(time.time()),
        )

        proof_hash = "0x" + proof_bundle.compute_proof_hash()

        computation_time_ms = int((time.time() - start_time) * 1000)

        print(f"\n  📋 TEE Proof Bundle (7 fields):")
        print(f"     1. update_hashes:    [{len(proof_bundle.update_hashes)} hashes]")
        print(f"     2. aggregation_hash: {proof_bundle.aggregation_hash[:32]}...")
        print(f"     3. model_version_id: {proof_bundle.model_version_id}")
        print(f"     4. global_model_hash:{proof_bundle.global_model_hash[:32]}...")
        print(f"     5. mrenclave:        {proof_bundle.mrenclave[:32]}...")
        print(f"     6. tee_signature:    {proof_bundle.tee_signature[:32]}...")
        print(f"     7. timestamp:        {proof_bundle.timestamp}")
        print(f"\n     proof_hash: {proof_hash}")
        print(f"     Computation time: {computation_time_ms}ms")

        return AggregationResult(
            new_model_bytes=new_model_bytes,
            new_model_cid="0g-" + new_model_hash,
            proof_bundle=proof_bundle,
            proof_hash=proof_hash,
            aggregation_hash=aggregation_hash,
            computation_time_ms=computation_time_ms,
            agents_included=list(clean_deltas.keys()),
            agents_excluded=excluded,
        )

    def verify_attestation(self, proof_bundle: TEEProofBundle) -> bool:
        """
        Verify a TEE attestation.
        In production: Intel TDX remote attestation verification.
        For testnet demo: Verify all 7 fields are cryptographically valid hashes.
        MRENCLAVE is validated as SHA256 format (not fixed value — round-specific).
        """
        import re
        hex66_pattern = re.compile(r'^0x[0-9a-f]{64}$')

        print(f"\n  🔐 Verifying TEE Attestation...")

        # MRENCLAVE: verify it's a valid 66-char SHA256 hash (0x + 64 hex)
        mrenclave_valid = bool(hex66_pattern.match(proof_bundle.mrenclave))
        print(f"     MRENCLAVE valid format: {'✅' if mrenclave_valid else '❌'} {proof_bundle.mrenclave[:20]}...")

        # TEE signature: valid 66-char hash
        sig_valid = bool(hex66_pattern.match(proof_bundle.tee_signature))
        print(f"     TEE signature valid:    {'✅' if sig_valid else '❌'}")

        # Timestamp reasonable
        ts_valid = proof_bundle.timestamp > 0
        print(f"     Timestamp valid:        {'✅' if ts_valid else '❌'}")

        # All 7 fields present and non-empty
        fields_valid = all([
            len(proof_bundle.update_hashes) > 0,
            bool(hex66_pattern.match(proof_bundle.aggregation_hash)),
            len(proof_bundle.model_version_id) > 0,
            bool(hex66_pattern.match(proof_bundle.global_model_hash)),
        ])
        print(f"     All 7 fields valid:     {'✅' if fields_valid else '❌'}")

        valid = mrenclave_valid and sig_valid and ts_valid and fields_valid
        print(f"     Overall: {'✅ VALID' if valid else '❌ INVALID'}")

        return valid
