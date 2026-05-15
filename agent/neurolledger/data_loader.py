"""
Loads each hospital's UCI dataset. Returns (X_native, y) — native feature dimensions.
The projection to 64-dim happens in model.py.
"""
import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.datasets import load_breast_cancer
import urllib.request
from typing import Tuple, Dict

import json

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Load hospital map (registered names → datasets)
_MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "hospital_map.json")
_HOSPITAL_MAP: Dict[str, Dict] = {}
if os.path.exists(_MAP_PATH):
    with open(_MAP_PATH) as _f:
        _raw = json.load(_f)
        for _name, _cfg in _raw.items():
            _HOSPITAL_MAP[_name] = {
                "dataset_id": _cfg["dataset"],
                "native_dim": _cfg["native_dim"],
                "disease": _cfg.get("disease", ""),
                "wallet_env": _cfg.get("wallet_env", ""),
                "story": _cfg.get("story", ""),
            }

HOSPITAL_REGISTRY: Dict[str, Dict] = {
    "Kerala Rural Hospital": {
        "dataset_id": "uci_heart",
        "disease": "Cardiovascular Disease",
        "region": "APAC",
        "story": "Rural South Asia — high cardiovascular burden",
        "native_dim": 13,
    },
    "NUS Medical Centre": {
        "dataset_id": "pima_diabetes",
        "disease": "Type 2 Diabetes",
        "region": "APAC",
        "story": "Southeast Asia — highest global diabetes prevalence",
        "native_dim": 8,
    },
    "Tokyo General Hospital": {
        "dataset_id": "breast_cancer",
        "disease": "Breast Cancer",
        "region": "APAC",
        "story": "Japan — systematic breast cancer screening programs",
        "native_dim": 30,
    },
    "Bangkok Hospital": {
        "dataset_id": "uci_kidney",
        "disease": "Chronic Kidney Disease",
        "region": "APAC",
        "story": "SE Asia — CKD from diabetes complications",
        "native_dim": 24,
    },
    "Mumbai General Hospital": {
        "dataset_id": "uci_liver",
        "disease": "Liver Disorders",
        "region": "APAC",
        "story": "South Asia — high hepatitis B burden",
        "native_dim": 5,
    },
}


def _download_if_missing(url: str, filename: str) -> str:
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"Downloading {filename}...")
        urllib.request.urlretrieve(url, path)
    return path


def get_hospital_cfg(hospital_name: str) -> Dict:
    """Resolve hospital name to config — supports both registered names and generic names."""
    if hospital_name in HOSPITAL_REGISTRY:
        return HOSPITAL_REGISTRY[hospital_name]
    if hospital_name in _HOSPITAL_MAP:
        return _HOSPITAL_MAP[hospital_name]
    raise KeyError(f"Unknown hospital: {hospital_name!r}. Known: {list(HOSPITAL_REGISTRY) + list(_HOSPITAL_MAP)}")


def load_hospital(hospital_name: str, val_fraction: float = 0.2) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Returns: X_train, y_train, X_val, y_val (native dimensions, scaled)."""
    cfg = get_hospital_cfg(hospital_name)
    ds = cfg["dataset_id"]

    if ds == "uci_heart":
        path = _download_if_missing(
            "https://archive.ics.uci.edu/ml/machine-learning-databases/heart-disease/processed.cleveland.data",
            "heart.csv"
        )
        df = pd.read_csv(path, header=None)
        df = df.replace("?", np.nan).dropna()
        X = df.iloc[:, :13].values.astype(np.float32)
        y = (df.iloc[:, 13].values.astype(float) > 0).astype(np.float32)

    elif ds == "pima_diabetes":
        path = _download_if_missing(
            "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.csv",
            "pima.csv"
        )
        df = pd.read_csv(path, header=None)
        X = df.iloc[:, :8].values.astype(np.float32)
        y = df.iloc[:, 8].values.astype(np.float32)

    elif ds == "breast_cancer":
        data = load_breast_cancer()
        X = data.data.astype(np.float32)
        y = data.target.astype(np.float32)

    elif ds == "uci_kidney":
        path = os.path.join(DATA_DIR, "kidney_disease.csv")
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Place kidney_disease.csv at {path}.\n"
                f"Source: https://archive.ics.uci.edu/dataset/336/chronic+kidney+disease"
            )
        df = pd.read_csv(path)
        df = df.replace("?", np.nan)
        for col in df.select_dtypes(include=[object]).columns:
            df[col] = df[col].astype("category").cat.codes
        df = df.fillna(df.median(numeric_only=True))
        X = df.iloc[:, :-1].values.astype(np.float32)
        y = (df.iloc[:, -1].values > 0).astype(np.float32)
        if X.shape[1] > cfg["native_dim"]:
            X = X[:, :cfg["native_dim"]]

    elif ds == "uci_liver":
        path = _download_if_missing(
            "https://archive.ics.uci.edu/ml/machine-learning-databases/liver-disorders/bupa.data",
            "liver.csv"
        )
        df = pd.read_csv(path, header=None)
        X = df.iloc[:, :5].values.astype(np.float32)
        y = (df.iloc[:, 5].values > 3).astype(np.float32)

    else:
        raise ValueError(f"Unknown dataset_id: {ds}")

    scaler = StandardScaler()
    X = scaler.fit_transform(X).astype(np.float32)

    rng = np.random.default_rng(seed=42)
    idx = rng.permutation(len(X))
    n_val = int(len(X) * val_fraction)
    val_idx, train_idx = idx[:n_val], idx[n_val:]

    return X[train_idx], y[train_idx], X[val_idx], y[val_idx]


def list_hospitals() -> list:
    """Returns all known hospital names (registered names take priority for display)."""
    return list(_HOSPITAL_MAP.keys()) if _HOSPITAL_MAP else list(HOSPITAL_REGISTRY.keys())


# ── Uploaded dataset support ──────────────────────────────────────────────────
# Hospitals can upload their own CSV via the Node Network panel.
# The CSV is processed here and the raw data is deleted after gradient computation.

TEMP_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "..", "tmp", "neuroledger_uploads")


def load_uploaded_dataset(wallet_address: str) -> Tuple[np.ndarray, np.ndarray, dict]:
    """
    Load a hospital-uploaded CSV. Returns (X, y, info_dict).
    Called by runner.py before falling back to UCI datasets.
    The caller must delete the file after gradient computation.
    """
    import json as _json
    safe_addr = wallet_address.lower().replace("0x", "").strip()
    # Try both with and without 0x prefix
    for addr_key in [wallet_address.lower(), safe_addr, f"0x{safe_addr}"]:
        upload_dir = os.path.join(TEMP_BASE, addr_key.replace("/", "").replace("..", ""))
        csv_path = os.path.join(upload_dir, "dataset.csv")
        meta_path = os.path.join(upload_dir, "meta.json")
        if os.path.exists(csv_path):
            break
    else:
        raise FileNotFoundError(f"No uploaded dataset for wallet {wallet_address}")

    with open(meta_path) as f:
        meta = _json.load(f)

    stats = meta.get("stats", {})
    label_idx = stats.get("labelColumnIndex", -1)
    has_header = stats.get("hasHeader", True)

    df = pd.read_csv(csv_path, header=0 if has_header else None)
    df = df.replace(["?", "NA", "na", "N/A", ""], np.nan)

    if label_idx == -1 or label_idx == len(df.columns) - 1:
        X_df = df.iloc[:, :-1]
        y_series = df.iloc[:, -1]
    else:
        cols = list(range(len(df.columns)))
        feature_cols = [c for c in cols if c != label_idx]
        X_df = df.iloc[:, feature_cols]
        y_series = df.iloc[:, label_idx]

    for col in X_df.select_dtypes(include=["object"]).columns:
        X_df[col] = X_df[col].astype("category").cat.codes

    X_df = X_df.fillna(X_df.median(numeric_only=True)).fillna(0)
    X = X_df.values.astype(np.float32)

    y_raw = y_series.fillna(y_series.mode()[0])
    unique_labels = y_raw.unique()

    if len(unique_labels) == 2:
        label_map = {unique_labels[0]: 0, unique_labels[1]: 1}
        y = y_raw.map(label_map).values.astype(np.float32)
    else:
        most_common = y_raw.value_counts().idxmax()
        y = (y_raw != most_common).astype(np.float32).values

    valid_mask = ~np.isnan(y)
    X, y = X[valid_mask], y[valid_mask]

    scaler = StandardScaler()
    X = scaler.fit_transform(X).astype(np.float32)

    info = {
        "source": "uploaded",
        "wallet": wallet_address,
        "hospital_name": meta.get("hospitalName", wallet_address),
        "file_name": meta.get("fileName", "dataset.csv"),
        "n_samples": len(X),
        "n_features": X.shape[1],
        "class_distribution": stats.get("classDistribution", {}),
        "label_column": stats.get("labelColumn", "last"),
    }
    return X, y, info


def delete_uploaded_dataset(wallet_address: str):
    """Delete the uploaded CSV after gradient computation (privacy guarantee)."""
    import shutil as _shutil
    safe_addr = wallet_address.lower().replace("0x", "").strip()
    for addr_key in [wallet_address.lower(), safe_addr, f"0x{safe_addr}"]:
        upload_dir = os.path.join(TEMP_BASE, addr_key.replace("/", "").replace("..", ""))
        csv_path = os.path.join(upload_dir, "dataset.csv")
        if os.path.exists(csv_path):
            os.unlink(csv_path)
            print(f"[privacy] ✓ Dataset deleted: {csv_path}")
            return
    print(f"[privacy] No uploaded dataset found for {wallet_address} (already deleted or never uploaded)")
