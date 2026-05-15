"""
Canonical SHA256 helpers for NeuroLedger.
Every hash is real SHA256 of canonical JSON bytes — no bit-shifted zeros.
"""
import hashlib
import json
import numpy as np


def hash_gradient(delta_w: np.ndarray, delta_b: float) -> str:
    """
    Deterministic SHA256 of the gradient bytes.
    Anyone with the same gradient produces the same hash.
    """
    serialized = json.dumps({
        "delta_w": [float(x) for x in delta_w],
        "delta_b": float(delta_b),
        "dtype": "float32",
        "shape": list(delta_w.shape),
    }, sort_keys=True, separators=(',', ':')).encode()
    return "0x" + hashlib.sha256(serialized).hexdigest()


def hash_model(w: np.ndarray, b: float) -> str:
    """SHA256 of global model parameters."""
    serialized = json.dumps({
        "w": [float(x) for x in w],
        "b": float(b),
    }, sort_keys=True, separators=(',', ':')).encode()
    return "0x" + hashlib.sha256(serialized).hexdigest()


def hash_aggregation_trace(trace: dict) -> str:
    """
    Hash the full aggregation trace.
    Inputs: sorted update_hashes, krum scores, included indices, output weights.
    Output: deterministic SHA256 that anyone can reproduce.
    """
    canonical = json.dumps(trace, sort_keys=True, separators=(',', ':')).encode()
    return "0x" + hashlib.sha256(canonical).hexdigest()
