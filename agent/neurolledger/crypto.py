"""
NeuroLedger — Gradient Encryption Module (Day 4)

AES-256-GCM encryption of gradient deltas.
Per-round key derivation with nonce generation.
"""

import hashlib
import os
import json
import time
from dataclasses import dataclass
from typing import Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass
class EncryptedGradient:
    """An encrypted gradient delta ready for 0G Storage upload."""
    ciphertext: bytes
    nonce: bytes              # 12-byte GCM nonce
    key_id: str               # Identifier for the encryption key
    update_hash: str          # SHA256 of the plaintext gradient
    round_id: int
    agent_id: str
    model_version: int
    timestamp: int
    norm_pre_clip: float
    metadata_json: str        # JSON metadata for storage


class GradientCrypto:
    """
    AES-256-GCM encryption for gradient deltas.

    Security properties:
    - 256-bit key provides 128-bit security level
    - GCM mode provides authenticated encryption (confidentiality + integrity)
    - 12-byte nonce is unique per encryption (random generation)
    - Each round uses a fresh key derived from master key + round_id
    """

    def __init__(self, master_key: bytes = None):
        """
        Initialize with a master key.
        In production: derived via ECDH with TEE public key.
        For demo: deterministic from a seed.
        """
        if master_key is None:
            master_key = os.urandom(32)
        self.master_key = master_key

    def derive_round_key(self, round_id: int) -> bytes:
        """
        Derive a per-round encryption key.
        In production: ECDH(agent_private, TEE_public) + round_id
        For demo: HKDF-like derivation from master key.
        """
        key_material = self.master_key + round_id.to_bytes(8, 'big')
        return hashlib.sha256(key_material).digest()  # 32 bytes = 256 bits

    def encrypt_gradient(
        self,
        gradient_bytes: bytes,
        round_id: int,
        agent_id: str,
        update_hash: str,
        model_version: int = 0,
        norm_pre_clip: float = 0.0,
    ) -> EncryptedGradient:
        """
        Encrypt a gradient delta with AES-256-GCM.

        Args:
            gradient_bytes: Raw gradient delta bytes
            round_id: Current training round
            agent_id: Agent's address/identifier
            update_hash: SHA256 of gradient_bytes (pre-computed)
            model_version: Base model version this delta was computed from
            norm_pre_clip: Gradient norm before clipping

        Returns:
            EncryptedGradient with ciphertext, nonce, and metadata
        """
        # Derive per-round key
        round_key = self.derive_round_key(round_id)
        key_id = hashlib.sha256(round_key).hexdigest()[:16]

        # Generate random nonce (12 bytes for GCM)
        nonce = os.urandom(12)

        # Encrypt with AES-256-GCM
        aesgcm = AESGCM(round_key)

        # Associated data: round + agent (authenticated but not encrypted)
        aad = f"{round_id}:{agent_id}".encode()

        ciphertext = aesgcm.encrypt(nonce, gradient_bytes, aad)

        timestamp = int(time.time())

        # Build metadata JSON
        metadata = {
            "round_id": round_id,
            "agent_id": agent_id,
            "update_hash": update_hash,
            "model_version": model_version,
            "timestamp": timestamp,
            "norm_pre_clip": norm_pre_clip,
            "encryption": {
                "algorithm": "AES-256-GCM",
                "key_id": key_id,
                "nonce_hex": nonce.hex(),
                "plaintext_size": len(gradient_bytes),
                "ciphertext_size": len(ciphertext),
            },
        }

        print(f"\n  🔐 Encryption Complete:")
        print(f"     Algorithm: AES-256-GCM")
        print(f"     Plaintext:  {len(gradient_bytes):,} bytes")
        print(f"     Ciphertext: {len(ciphertext):,} bytes")
        print(f"     Nonce: {nonce.hex()}")
        print(f"     Key ID: {key_id}")

        return EncryptedGradient(
            ciphertext=ciphertext,
            nonce=nonce,
            key_id=key_id,
            update_hash=update_hash,
            round_id=round_id,
            agent_id=agent_id,
            model_version=model_version,
            timestamp=timestamp,
            norm_pre_clip=norm_pre_clip,
            metadata_json=json.dumps(metadata, indent=2),
        )

    def decrypt_gradient(
        self,
        ciphertext: bytes,
        nonce: bytes,
        round_id: int,
        agent_id: str,
    ) -> bytes:
        """
        Decrypt a gradient delta.
        In production: only the TEE can do this (it holds the ECDH private key).
        For demo: we decrypt locally to verify roundtrip.
        """
        round_key = self.derive_round_key(round_id)
        aesgcm = AESGCM(round_key)
        aad = f"{round_id}:{agent_id}".encode()

        plaintext = aesgcm.decrypt(nonce, ciphertext, aad)
        return plaintext

    def verify_roundtrip(
        self,
        original_bytes: bytes,
        encrypted: EncryptedGradient,
    ) -> bool:
        """
        Verify that encryption → decryption produces original bytes.
        Also verify that SHA256 matches.
        """
        decrypted = self.decrypt_gradient(
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.round_id,
            encrypted.agent_id,
        )

        # Check byte-level equality
        bytes_match = decrypted == original_bytes

        # Check hash
        decrypted_hash = hashlib.sha256(decrypted).hexdigest()
        hash_match = decrypted_hash == encrypted.update_hash

        print(f"\n  🔍 Roundtrip Verification:")
        print(f"     Bytes match: {'✅' if bytes_match else '❌'}")
        print(f"     Hash match:  {'✅' if hash_match else '❌'}")
        print(f"     Original hash:  {encrypted.update_hash}")
        print(f"     Decrypted hash: {decrypted_hash}")

        return bytes_match and hash_match
