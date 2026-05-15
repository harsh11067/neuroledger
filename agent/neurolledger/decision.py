"""
NeuroLedger — Agent Decision Engine (Day 6)

Autonomous post-round decision making.
Evaluates global model, decides ACCEPT/RETRAIN/REJECT, submits on-chain.
"""

import hashlib
import json
import time
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Optional


class Decision(Enum):
    """Agent decision types."""
    ACCEPT = "ACCEPT"
    RETRAIN = "RETRAIN"
    REJECT = "REJECT"


@dataclass
class DecisionRecord:
    """
    A verifiable decision record.
    Stored on 0G Storage, proof_hash anchored on-chain.
    """
    agent_id: str
    round_id: int
    decision: str           # "ACCEPT" | "RETRAIN" | "REJECT"
    improvement: float      # acc_global_new - acc_global_prev
    local_acc: float        # Local model accuracy
    global_acc_new: float   # New global model accuracy on local val set
    global_acc_prev: float  # Previous global model accuracy
    reasoning: str          # Human-readable reasoning
    proof_hash: str = ""    # SHA256 of this record (computed after creation)
    timestamp: int = 0

    def compute_proof_hash(self) -> str:
        """Compute SHA256 of this record for on-chain anchoring."""
        # Create a canonical representation (excluding proof_hash itself)
        canonical = {
            "agent_id": self.agent_id,
            "round_id": self.round_id,
            "decision": self.decision,
            "improvement": self.improvement,
            "local_acc": self.local_acc,
            "global_acc_new": self.global_acc_new,
            "global_acc_prev": self.global_acc_prev,
            "reasoning": self.reasoning,
            "timestamp": self.timestamp,
        }
        canonical_json = json.dumps(canonical, sort_keys=True)
        self.proof_hash = hashlib.sha256(canonical_json.encode()).hexdigest()
        return self.proof_hash

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)

    def to_dict(self) -> dict:
        return asdict(self)


class AgentDecisionEngine:
    """
    Autonomous post-round decision making.
    Runs independently on each agent — no central coordinator.
    Hospital can configure its own thresholds.
    """

    def __init__(
        self,
        agent_id: str,
        hospital_name: str,
        accept_threshold: float = 0.005,    # +0.5% improvement → accept
        retrain_threshold: float = -0.010,   # -1.0% degradation → retrain
        extra_retrain_epochs: int = 3,
    ):
        self.agent_id = agent_id
        self.hospital_name = hospital_name
        self.accept_threshold = accept_threshold
        self.retrain_threshold = retrain_threshold
        self.extra_retrain_epochs = extra_retrain_epochs
        self.prev_global_accuracy: float = 0.0   # Initial baseline (0 so any improvement shows positive delta)
        self.decision_history: list = []

    def evaluate_and_decide(
        self,
        round_id: int,
        local_acc: float,
        global_acc_new: float,
        attestation_valid: bool = True,
    ) -> DecisionRecord:
        """
        Core decision logic.

        Steps:
        1. Verify TEE attestation
        2. Compute improvement delta
        3. Apply decision policy
        4. Build verifiable decision record
        5. Return record for on-chain submission

        Args:
            round_id: Current training round
            local_acc: Local model accuracy on local validation set
            global_acc_new: New global model accuracy on local validation set
            attestation_valid: Whether TEE attestation was verified

        Returns:
            DecisionRecord with proof_hash for on-chain commitment
        """
        print(f"\n{'='*60}")
        print(f"  [{self.hospital_name}] Decision Engine — Round {round_id}")
        print(f"{'='*60}")

        # Step 1: Check attestation
        if not attestation_valid:
            decision = Decision.REJECT
            reasoning = "TEE attestation invalid — refusing unproven model"
            improvement = 0.0
            print(f"  ❌ Attestation INVALID — auto-REJECT")
        else:
            # Step 2: Compute improvement
            improvement = global_acc_new - self.prev_global_accuracy

            print(f"  📊 Accuracy Comparison:")
            print(f"     Local model:         {local_acc:.4f} ({local_acc*100:.2f}%)")
            print(f"     Global model (prev):  {self.prev_global_accuracy:.4f} ({self.prev_global_accuracy*100:.2f}%)")
            print(f"     Global model (new):   {global_acc_new:.4f} ({global_acc_new*100:.2f}%)")
            print(f"     Improvement:          {improvement:+.4f} ({improvement*100:+.2f}%)")
            print(f"     Accept threshold:     {self.accept_threshold:+.4f} ({self.accept_threshold*100:+.2f}%)")
            print(f"     Retrain threshold:    {self.retrain_threshold:+.4f} ({self.retrain_threshold*100:+.2f}%)")

            # Step 3: Decision logic
            if improvement >= self.accept_threshold:
                decision = Decision.ACCEPT
                reasoning = (
                    f"Global model improved by {improvement*100:+.2f}% "
                    f"(threshold: {self.accept_threshold*100:+.2f}%). "
                    f"Adopting new weights."
                )
                self.prev_global_accuracy = global_acc_new
                print(f"\n  ✅ Decision: ACCEPT")
                print(f"     Reason: {reasoning}")

            elif improvement >= self.retrain_threshold:
                decision = Decision.RETRAIN
                reasoning = (
                    f"Global model change {improvement*100:+.2f}% is below accept threshold "
                    f"({self.accept_threshold*100:+.2f}%) but above retrain threshold "
                    f"({self.retrain_threshold*100:+.2f}%). "
                    f"Scheduling {self.extra_retrain_epochs} extra local epochs."
                )
                self.prev_global_accuracy = global_acc_new
                print(f"\n  🔄 Decision: RETRAIN")
                print(f"     Reason: {reasoning}")

            else:
                decision = Decision.REJECT
                reasoning = (
                    f"Global model degraded by {improvement*100:+.2f}% "
                    f"(below retrain threshold: {self.retrain_threshold*100:+.2f}%). "
                    f"Keeping previous model. Flagging round for governance."
                )
                print(f"\n  ❌ Decision: REJECT")
                print(f"     Reason: {reasoning}")

        # Step 4: Build decision record
        record = DecisionRecord(
            agent_id=self.agent_id,
            round_id=round_id,
            decision=decision.value,
            improvement=improvement,
            local_acc=local_acc,
            global_acc_new=global_acc_new,
            global_acc_prev=self.prev_global_accuracy,
            reasoning=reasoning,
            timestamp=int(time.time()),
        )
        record.compute_proof_hash()

        print(f"\n  📋 Decision Record:")
        print(f"     proof_hash: {record.proof_hash}")
        print(f"     timestamp: {record.timestamp}")

        # Track history
        self.decision_history.append(record)

        return record

    def get_decision_summary(self) -> dict:
        """Get a summary of all decisions made by this agent."""
        total = len(self.decision_history)
        accepts = sum(1 for d in self.decision_history if d.decision == "ACCEPT")
        retrains = sum(1 for d in self.decision_history if d.decision == "RETRAIN")
        rejects = sum(1 for d in self.decision_history if d.decision == "REJECT")

        return {
            "agent_id": self.agent_id,
            "hospital_name": self.hospital_name,
            "total_decisions": total,
            "accepts": accepts,
            "retrains": retrains,
            "rejects": rejects,
            "accept_rate": accepts / total if total > 0 else 0,
            "thresholds": {
                "accept": self.accept_threshold,
                "retrain": self.retrain_threshold,
            },
            "current_global_accuracy": self.prev_global_accuracy,
        }
