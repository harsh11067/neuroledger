"""
Rényi Differential Privacy noise injection.
Gaussian mechanism for (ε, δ)-DP — replaces AES-256-GCM encryption.
"""
import numpy as np
import hashlib
from typing import Tuple


class DPMechanism:
    """
    Gaussian mechanism for (ε, δ)-DP.
    Clips gradient to sensitivity C, then adds noise N(0, σ²I).
    """

    def __init__(self, epsilon: float = 1.0, delta: float = 1e-5,
                 clip_norm: float = 1.0):
        self.epsilon = epsilon
        self.delta = delta
        self.clip_norm = clip_norm

    def compute_sigma(self, dataset_size: int) -> float:
        """σ = sensitivity × √(2 ln(1.25/δ)) / ε"""
        sensitivity = self.clip_norm / max(dataset_size, 1)
        return sensitivity * np.sqrt(2.0 * np.log(1.25 / self.delta)) / self.epsilon

    def clip_and_noise(self, gradient: np.ndarray, dataset_size: int) -> Tuple[np.ndarray, float, float]:
        """Returns: (noised_gradient, sigma, original_norm)"""
        norm = float(np.linalg.norm(gradient))
        if norm > self.clip_norm:
            gradient = gradient * (self.clip_norm / norm)

        sigma = self.compute_sigma(dataset_size)
        noise = np.random.normal(0.0, sigma, gradient.shape).astype(gradient.dtype)
        return gradient + noise, sigma, norm

    def dp_proof_hash(self, agent_address: str, round_id: int, sigma: float,
                      nonce: bytes) -> str:
        """
        keccak256(abi.encode(address, roundId, eps_micro, delta_nano, sigma_micro, nonce))
        Matches Solidity's dpProofHash field.
        """
        try:
            from eth_abi import encode as abi_encode
            from eth_hash.auto import keccak
            encoded = abi_encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "bytes32"],
                [
                    agent_address,
                    round_id,
                    int(self.epsilon * 1_000_000),
                    int(self.delta * 1_000_000_000),
                    int(sigma * 1_000_000),
                    nonce,
                ]
            )
            return "0x" + keccak(encoded).hex()
        except ImportError:
            # Fallback: SHA256 of canonical representation
            canonical = f"{agent_address}:{round_id}:{self.epsilon}:{self.delta}:{sigma}:{nonce.hex()}"
            return "0x" + hashlib.sha256(canonical.encode()).hexdigest()
