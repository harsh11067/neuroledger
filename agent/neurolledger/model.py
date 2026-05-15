"""
Logistic regression with shared 64-dim weight space.
Each hospital has a private projection layer (local feature engineering).
Global model = the 64-dim weight vector that gets federated.
"""
import numpy as np
import hashlib
from typing import Tuple

GLOBAL_DIM = 64


class FederatedLogisticRegression:
    """
    Forward:  y = sigmoid(X_local @ P_local @ w_global + b_global)
    where:
      X_local:  hospital's native features (n × native_dim)
      P_local:  private projection (native_dim × 64), seeded by hospital name
      w_global: shared 64-dim weight vector (this is what gets federated)
      b_global: shared bias (1-dim, also federated)
    """

    def __init__(self, hospital_name: str, native_dim: int):
        self.hospital_name = hospital_name
        self.native_dim = native_dim

        # Deterministic local projection — seeded by hospital name
        seed = int(hashlib.sha256(hospital_name.encode()).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)
        self.P_local = rng.standard_normal((native_dim, GLOBAL_DIM)).astype(np.float32) * (1.0 / np.sqrt(native_dim))

        # Global parameters (initialized to zero or loaded from previous round)
        self.w_global = np.zeros(GLOBAL_DIM, dtype=np.float32)
        self.b_global = np.float32(0.0)

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))

    def forward(self, X_native: np.ndarray) -> np.ndarray:
        Z = X_native @ self.P_local  # (n, 64)
        return self._sigmoid(Z @ self.w_global + self.b_global)

    def predict(self, X_native: np.ndarray) -> np.ndarray:
        return (self.forward(X_native) >= 0.5).astype(int)

    def loss(self, X_native: np.ndarray, y: np.ndarray) -> float:
        p = np.clip(self.forward(X_native), 1e-9, 1 - 1e-9)
        return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))

    def accuracy(self, X_native: np.ndarray, y: np.ndarray) -> float:
        return float(np.mean(self.predict(X_native) == y))

    def train_local(self, X_native: np.ndarray, y: np.ndarray,
                    epochs: int = 50, lr: float = 0.1, batch_size: int = 32) -> dict:
        """SGD training. Returns gradient delta in 64-dim global space."""
        w_start = self.w_global.copy()
        b_start = self.b_global

        n = len(X_native)
        Z = X_native @ self.P_local  # precompute projection

        losses = []
        for _ in range(epochs):
            idx = np.random.permutation(n)
            for i in range(0, n, batch_size):
                batch = idx[i:i + batch_size]
                Z_b, y_b = Z[batch], y[batch]

                p = self._sigmoid(Z_b @ self.w_global + self.b_global)
                error = p - y_b

                grad_w = Z_b.T @ error / len(batch)
                grad_b = float(np.mean(error))

                self.w_global -= lr * grad_w
                self.b_global -= lr * grad_b

            losses.append(self.loss(X_native, y))

        delta_w = self.w_global - w_start
        delta_b = float(self.b_global - b_start)

        return {
            "delta_w": delta_w,
            "delta_b": delta_b,
            "loss_history": losses,
            "final_loss": losses[-1],
            "final_accuracy": self.accuracy(X_native, y),
            "n_samples": n,
        }

    def apply_global_update(self, w_global: np.ndarray, b_global: float):
        """After aggregation, load the new global parameters."""
        assert w_global.shape == (GLOBAL_DIM,)
        self.w_global = w_global.astype(np.float32).copy()
        self.b_global = np.float32(b_global)
