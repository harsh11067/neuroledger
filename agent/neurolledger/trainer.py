"""
NeuroLedger — Local Trainer Module (Day 3)

Trains a simple CNN on MNIST (medical imaging stand-in).
Computes gradient delta and SHA256 update_hash.
"""

import hashlib
import io
import time
from dataclasses import dataclass, field
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Subset


# ═══════════════════════════════════════════════════════════
#  Model Architecture — Simple CNN (Medical Imaging Stand-in)
# ═══════════════════════════════════════════════════════════

class MedicalCNN(nn.Module):
    """
    Simple CNN for MNIST digit classification.
    Serves as a stand-in for medical imaging models.
    Architecture is intentionally small for demo speed.
    """

    def __init__(self, num_classes: int = 10):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.fc2 = nn.Linear(128, num_classes)
        self.dropout = nn.Dropout(0.25)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = x.view(-1, 32 * 7 * 7)
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x


# ═══════════════════════════════════════════════════════════
#  Gradient Delta — The core federated learning artifact
# ═══════════════════════════════════════════════════════════

@dataclass
class GradientDelta:
    """Represents a gradient delta ready for encryption and upload."""
    round_id: int
    agent_id: str
    delta_bytes: bytes          # Serialized tensor bytes
    update_hash: str            # SHA256 hex digest
    model_version: int          # Base model round
    timestamp: int              # Unix UTC
    norm_pre_clip: float        # Gradient norm before clipping
    norm_post_clip: float       # Gradient norm after clipping
    training_loss: float        # Final training loss
    training_accuracy: float    # Final training accuracy
    val_accuracy: float         # Validation accuracy
    num_samples: int            # Training samples used
    epochs: int                 # Epochs trained


# ═══════════════════════════════════════════════════════════
#  Local Trainer — Hospital-side training loop
# ═══════════════════════════════════════════════════════════

class LocalTrainer:
    """
    Hospital-side local training loop.
    Trains on private patient data (simulated MNIST subset).
    Produces gradient delta with SHA256 hash.
    """

    def __init__(
        self,
        agent_id: str,
        hospital_name: str,
        device: str = "cpu",
        max_gradient_norm: float = 10.0,
        learning_rate: float = 0.01,
        batch_size: int = 64,
    ):
        self.agent_id = agent_id
        self.hospital_name = hospital_name
        self.device = torch.device(device)
        self.max_gradient_norm = max_gradient_norm
        self.learning_rate = learning_rate
        self.batch_size = batch_size

        # Initialize model
        self.model = MedicalCNN().to(self.device)
        self.prev_global_weights: Optional[dict] = None
        self.prev_delta: Optional[torch.Tensor] = None

    def load_global_weights(self, weights_bytes: bytes) -> None:
        """Load global model weights from bytes."""
        buffer = io.BytesIO(weights_bytes)
        state_dict = torch.load(buffer, map_location=self.device, weights_only=True)
        self.model.load_state_dict(state_dict)
        self.prev_global_weights = {
            k: v.clone() for k, v in self.model.state_dict().items()
        }

    def get_model_weights_bytes(self) -> bytes:
        """Serialize current model weights to bytes."""
        buffer = io.BytesIO()
        torch.save(self.model.state_dict(), buffer)
        return buffer.getvalue()

    def _create_synthetic_data(
        self,
        num_samples: int = 1000,
        digit_subset: Optional[list] = None,
    ) -> Tuple[DataLoader, DataLoader]:
        """
        Create synthetic MNIST-like data for demo.
        Each hospital gets a biased subset (simulates different patient populations).
        """
        # Generate synthetic 28x28 images with simple patterns
        torch.manual_seed(hash(self.agent_id) % (2**32))

        if digit_subset is None:
            digit_subset = list(range(10))

        images = []
        labels = []
        for i in range(num_samples):
            label = digit_subset[i % len(digit_subset)]
            # Create a simple pattern based on label
            img = torch.randn(1, 28, 28) * 0.3
            # Add distinctive pattern per label
            row_start = (label * 2) % 20
            col_start = (label * 3) % 20
            img[0, row_start:row_start+8, col_start:col_start+8] += 1.0 + label * 0.1
            images.append(img)
            labels.append(label)

        images = torch.stack(images)
        labels = torch.tensor(labels, dtype=torch.long)

        # Split 80/20
        split = int(0.8 * num_samples)
        train_dataset = torch.utils.data.TensorDataset(images[:split], labels[:split])
        val_dataset = torch.utils.data.TensorDataset(images[split:], labels[split:])

        train_loader = DataLoader(train_dataset, batch_size=self.batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=self.batch_size, shuffle=False)

        return train_loader, val_loader

    def train_local(
        self,
        round_id: int,
        epochs: int = 5,
        num_samples: int = 1000,
        digit_subset: Optional[list] = None,
    ) -> GradientDelta:
        """
        Run local training and produce a gradient delta.

        Steps:
        1. Store pre-training weights (global model)
        2. Train for N epochs on local data
        3. Compute delta = new_weights - global_weights
        4. Clip gradient norm
        5. Serialize and hash → update_hash = SHA256(delta_bytes)

        Returns:
            GradientDelta with all metadata
        """
        print(f"\n{'='*60}")
        print(f"  [{self.hospital_name}] Training Round {round_id}")
        print(f"{'='*60}")

        # Store global weights before training
        global_state = {
            k: v.clone() for k, v in self.model.state_dict().items()
        }

        # Create data loaders
        train_loader, val_loader = self._create_synthetic_data(
            num_samples=num_samples,
            digit_subset=digit_subset,
        )

        # Train
        optimizer = torch.optim.SGD(
            self.model.parameters(),
            lr=self.learning_rate,
            momentum=0.9,
        )
        criterion = nn.CrossEntropyLoss()

        self.model.train()
        final_loss = 0.0
        correct = 0
        total = 0

        for epoch in range(epochs):
            epoch_loss = 0.0
            epoch_correct = 0
            epoch_total = 0

            for batch_imgs, batch_labels in train_loader:
                batch_imgs = batch_imgs.to(self.device)
                batch_labels = batch_labels.to(self.device)

                optimizer.zero_grad()
                outputs = self.model(batch_imgs)
                loss = criterion(outputs, batch_labels)
                loss.backward()
                optimizer.step()

                epoch_loss += loss.item() * batch_imgs.size(0)
                _, predicted = outputs.max(1)
                epoch_correct += predicted.eq(batch_labels).sum().item()
                epoch_total += batch_imgs.size(0)

            avg_loss = epoch_loss / epoch_total
            acc = epoch_correct / epoch_total
            print(f"  Epoch {epoch+1}/{epochs} — Loss: {avg_loss:.4f}, Acc: {acc:.4f}")
            final_loss = avg_loss
            correct = epoch_correct
            total = epoch_total

        training_accuracy = correct / total if total > 0 else 0.0

        # Evaluate on validation set
        val_accuracy = self._evaluate(val_loader)
        print(f"  Validation accuracy: {val_accuracy:.4f}")

        # Compute gradient delta
        delta_dict = {}
        for key in global_state:
            delta_dict[key] = self.model.state_dict()[key] - global_state[key]

        # Flatten delta for norm computation
        flat_delta = torch.cat([v.flatten() for v in delta_dict.values()])
        norm_pre_clip = float(torch.norm(flat_delta).item())

        # Clip gradient norm
        if norm_pre_clip > self.max_gradient_norm:
            scale = self.max_gradient_norm / norm_pre_clip
            for key in delta_dict:
                delta_dict[key] = delta_dict[key] * scale
            flat_delta = flat_delta * scale

        norm_post_clip = float(torch.norm(flat_delta).item())
        print(f"  Gradient norm: {norm_pre_clip:.4f} → {norm_post_clip:.4f} (clipped)")

        # Cosine similarity check with previous delta
        if self.prev_delta is not None:
            cos_sim = F.cosine_similarity(
                flat_delta.unsqueeze(0),
                self.prev_delta.unsqueeze(0),
            ).item()
            print(f"  Cosine similarity with prev delta: {cos_sim:.4f}")
            if cos_sim < -0.8:
                print(f"  ⚠️ WARNING: Gradient reversal detected (cos_sim={cos_sim:.4f})")

        self.prev_delta = flat_delta.clone()

        # Serialize delta
        buffer = io.BytesIO()
        torch.save(delta_dict, buffer)
        delta_bytes = buffer.getvalue()

        # SHA256 hash — "0x" + 64 hex chars (66 chars total, matches on-chain format)
        update_hash = "0x" + hashlib.sha256(delta_bytes).hexdigest()
        timestamp = int(time.time())

        print(f"\n  📦 Gradient Delta:")
        print(f"     Size: {len(delta_bytes):,} bytes")
        print(f"     update_hash: {update_hash}")
        print(f"     timestamp: {timestamp}")

        return GradientDelta(
            round_id=round_id,
            agent_id=self.agent_id,
            delta_bytes=delta_bytes,
            update_hash=update_hash,
            model_version=round_id - 1,
            timestamp=timestamp,
            norm_pre_clip=norm_pre_clip,
            norm_post_clip=norm_post_clip,
            training_loss=final_loss,
            training_accuracy=training_accuracy,
            val_accuracy=val_accuracy,
            num_samples=num_samples,
            epochs=epochs,
        )

    def _evaluate(self, data_loader: DataLoader) -> float:
        """Evaluate model on a dataset."""
        self.model.eval()
        correct = 0
        total = 0

        with torch.no_grad():
            for batch_imgs, batch_labels in data_loader:
                batch_imgs = batch_imgs.to(self.device)
                batch_labels = batch_labels.to(self.device)
                outputs = self.model(batch_imgs)
                _, predicted = outputs.max(1)
                correct += predicted.eq(batch_labels).sum().item()
                total += batch_labels.size(0)

        self.model.train()
        return correct / total if total > 0 else 0.0

    def evaluate_model_weights(self, weights_bytes: bytes, val_loader: DataLoader) -> float:
        """Evaluate arbitrary weights on local validation set without modifying the trainer's model."""
        temp_model = MedicalCNN().to(self.device)
        buffer = io.BytesIO(weights_bytes)
        state_dict = torch.load(buffer, map_location=self.device, weights_only=True)
        temp_model.load_state_dict(state_dict)
        temp_model.eval()

        correct = 0
        total = 0
        with torch.no_grad():
            for batch_imgs, batch_labels in val_loader:
                batch_imgs = batch_imgs.to(self.device)
                batch_labels = batch_labels.to(self.device)
                outputs = temp_model(batch_imgs)
                _, predicted = outputs.max(1)
                correct += predicted.eq(batch_labels).sum().item()
                total += batch_labels.size(0)

        return correct / total if total > 0 else 0.0
