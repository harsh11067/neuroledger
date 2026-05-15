"""
NeuroLedger — Hospital Agent Module

The main agent class that orchestrates:
- Local training
- Gradient encryption
- 0G Storage upload
- TEE verification
- Autonomous decisions
"""

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Optional, List

from .trainer import LocalTrainer, GradientDelta, MedicalCNN
from .crypto import GradientCrypto, EncryptedGradient
from .storage import ZeroGStorageClient
from .tee import TEEAggregator, TEEProofBundle
from .decision import AgentDecisionEngine, DecisionRecord, Decision


@dataclass
class AgentConfig:
    """Configuration for a hospital agent."""
    agent_id: str
    hospital_name: str
    region: str
    specialization: str
    num_samples: int = 1000
    digit_subset: Optional[list] = None
    accept_threshold: float = 0.005
    retrain_threshold: float = -0.010
    learning_rate: float = 0.01
    epochs: int = 5
    max_gradient_norm: float = 10.0
    stake: float = 0.01


class HospitalAgent:
    """
    Autonomous Hospital AI Agent.

    Four capabilities:
    1. Local Trainer — trains on private patient data
    2. Gradient Publisher — encrypts and publishes gradients
    3. TEE Verifier — verifies attestation before accepting
    4. Decision Engine — evaluates, decides, submits on-chain
    """

    def __init__(
        self,
        config: AgentConfig,
        storage: ZeroGStorageClient,
        crypto: GradientCrypto,
    ):
        self.config = config
        self.storage = storage
        self.crypto = crypto

        # Initialize sub-components
        self.trainer = LocalTrainer(
            agent_id=config.agent_id,
            hospital_name=config.hospital_name,
            max_gradient_norm=config.max_gradient_norm,
            learning_rate=config.learning_rate,
        )

        self.decision_engine = AgentDecisionEngine(
            agent_id=config.agent_id,
            hospital_name=config.hospital_name,
            accept_threshold=config.accept_threshold,
            retrain_threshold=config.retrain_threshold,
        )

        self.state = "IDLE"
        self.round_history: list = []

    def train_and_submit(self, round_id: int) -> dict:
        """
        Full training + encryption + upload pipeline.

        Returns dict with:
        - gradient_delta: GradientDelta object
        - encrypted: EncryptedGradient object
        - storage_cid: CID from 0G Storage
        - update_hash: SHA256 of gradient
        """
        self.state = "TRAINING"
        print(f"\n{'#'*60}")
        print(f"  AGENT: {self.config.hospital_name}")
        print(f"  STATE: TRAINING → ENCRYPTING → UPLOADING")
        print(f"{'#'*60}")

        # Step 1: Train locally
        delta = self.trainer.train_local(
            round_id=round_id,
            epochs=self.config.epochs,
            num_samples=self.config.num_samples,
            digit_subset=self.config.digit_subset,
        )

        # Step 2: Encrypt gradient
        self.state = "ENCRYPTING"
        encrypted = self.crypto.encrypt_gradient(
            gradient_bytes=delta.delta_bytes,
            round_id=round_id,
            agent_id=self.config.agent_id,
            update_hash=delta.update_hash,
            model_version=delta.model_version,
            norm_pre_clip=delta.norm_pre_clip,
        )

        # Step 3: Upload to 0G Storage
        self.state = "UPLOADING"
        storage_key = f"gradients/round_{round_id:03d}/{self.config.agent_id}/delta.enc"
        storage_cid = self.storage.upload(
            key=storage_key,
            content=encrypted.ciphertext,
            uploader=self.config.agent_id,
        )

        # Upload metadata
        meta_key = f"gradients/round_{round_id:03d}/{self.config.agent_id}/metadata.json"
        self.storage.upload(
            key=meta_key,
            content=encrypted.metadata_json.encode(),
            uploader=self.config.agent_id,
        )

        self.state = "WAITING"

        result = {
            "gradient_delta": delta,
            "encrypted": encrypted,
            "storage_cid": storage_cid,
            "update_hash": delta.update_hash,
            "delta_bytes": delta.delta_bytes,
            "val_accuracy": delta.val_accuracy,
        }

        self.round_history.append(result)
        return result

    def evaluate_and_decide(
        self,
        round_id: int,
        new_global_model_bytes: bytes,
        proof_bundle: TEEProofBundle,
        aggregator: TEEAggregator,
    ) -> DecisionRecord:
        """
        Evaluate global model and make autonomous decision.

        Steps:
        1. Verify TEE attestation
        2. Evaluate new global model on local validation set
        3. Make decision (ACCEPT/RETRAIN/REJECT)
        4. Build verifiable decision record
        """
        self.state = "VERIFYING"

        # Verify attestation
        attestation_valid = aggregator.verify_attestation(proof_bundle)

        # Evaluate new global model on local data
        self.state = "EVALUATING"
        _, val_loader = self.trainer._create_synthetic_data(
            num_samples=self.config.num_samples,
            digit_subset=self.config.digit_subset,
        )

        global_acc_new = self.trainer.evaluate_model_weights(
            new_global_model_bytes, val_loader
        )
        local_acc = self.trainer._evaluate(val_loader)

        # Make decision
        self.state = "DECIDING"
        record = self.decision_engine.evaluate_and_decide(
            round_id=round_id,
            local_acc=local_acc,
            global_acc_new=global_acc_new,
            attestation_valid=attestation_valid,
        )

        # Store decision on 0G Storage
        decision_key = f"decisions/round_{round_id:03d}/{self.config.agent_id}/record.json"
        self.storage.upload_json(
            key=decision_key,
            data=record.to_dict(),
            uploader=self.config.agent_id,
        )

        # If ACCEPT, load new weights
        if record.decision == Decision.ACCEPT.value:
            self.trainer.load_global_weights(new_global_model_bytes)
            print(f"  → Adopted new global weights")
        elif record.decision == Decision.RETRAIN.value:
            print(f"  → Scheduling {self.decision_engine.extra_retrain_epochs} extra epochs before next round")

        self.state = "IDLE"
        return record

    def get_model_weights_bytes(self) -> bytes:
        """Get current model weights as bytes."""
        return self.trainer.get_model_weights_bytes()
