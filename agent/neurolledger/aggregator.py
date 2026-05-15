"""
Multi-Krum + Coordinate-wise Trimmed Mean aggregation.
Fully deterministic — anyone with the gradient CIDs can reproduce.
"""
import numpy as np
import hashlib
import json
from typing import List, Dict, Tuple


def multi_krum_select(gradients: np.ndarray, f: int = 0) -> Tuple[List[int], np.ndarray]:
    """
    Multi-Krum: for each gradient i, compute sum of squared distances
    to its (n - f - 2) nearest neighbors. Select the (n - f) with lowest scores.

    f = number of Byzantine agents tolerated. For demo, f=0 means keep all.
    Returns: (selected_indices, scores)
    """
    n = len(gradients)
    if n <= 2 or f >= n - 2:
        return list(range(n)), np.zeros(n)

    k = n - f - 2  # neighbors to count
    scores = np.zeros(n)

    for i in range(n):
        dists = []
        for j in range(n):
            if i != j:
                dists.append(float(np.sum((gradients[i] - gradients[j]) ** 2)))
        dists.sort()
        scores[i] = sum(dists[:k])

    selected = sorted(np.argsort(scores)[:n - f].tolist())
    return selected, scores


def trimmed_mean(gradients: np.ndarray, trim_fraction: float = 0.0) -> np.ndarray:
    """Coordinate-wise trimmed mean. trim_fraction=0 means plain mean."""
    n = len(gradients)
    k = int(n * trim_fraction)
    if k == 0:
        return gradients.mean(axis=0)
    sorted_g = np.sort(gradients, axis=0)
    return sorted_g[k:n - k].mean(axis=0)


def aggregate(
    update_hashes: List[str],
    delta_ws: List[np.ndarray],
    delta_bs: List[float],
    f_tolerated: int = 0,
    trim: float = 0.0,
) -> Dict:
    """
    Full aggregation pipeline. Returns a dict with:
      - selected_indices: which agents were kept by Krum
      - krum_scores: per-agent Krum score
      - new_delta_w, new_delta_b: the global update
      - aggregation_hash: deterministic SHA256, reproducible by anyone with the CIDs
      - trace: full computation trace for TEE attestation
    """
    grads = np.stack(delta_ws)  # (n, 64)
    selected, scores = multi_krum_select(grads, f=f_tolerated)

    selected_grads = grads[selected]
    selected_biases = np.array([delta_bs[i] for i in selected])

    new_delta_w = trimmed_mean(selected_grads, trim_fraction=trim)
    new_delta_b = float(trimmed_mean(selected_biases.reshape(-1, 1), trim_fraction=trim)[0])

    trace = {
        "algorithm": "MultiKrum+TrimmedMean",
        "n_agents": len(update_hashes),
        "f_tolerated": f_tolerated,
        "trim_fraction": trim,
        "update_hashes_sorted": sorted(update_hashes),
        "krum_scores": [float(s) for s in scores],
        "selected_indices": selected,
        "output_w_sha256": hashlib.sha256(new_delta_w.tobytes()).hexdigest(),
        "output_b_value": new_delta_b,
    }

    canonical = json.dumps(trace, sort_keys=True, separators=(',', ':')).encode()
    aggregation_hash = "0x" + hashlib.sha256(canonical).hexdigest()

    return {
        "selected_indices": selected,
        "krum_scores": scores.tolist(),
        "new_delta_w": new_delta_w,
        "new_delta_b": new_delta_b,
        "aggregation_hash": aggregation_hash,
        "trace": trace,
    }
