from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd
from scipy.io import loadmat
from sklearn.preprocessing import MinMaxScaler, StandardScaler

from .config import PROCESSED_DIR, SCALER_PATH

FEATURE_COLUMNS = ["voltage", "current", "temperature", "capacity"]
SUPPORTED = {".mat", ".xls", ".xlsx"}
TRAIN_STAGES = {0, 10, 20}
TEST_STAGES = {30, 40, 50}


@dataclass
class ETLResult:
    X: np.ndarray
    X_train: np.ndarray
    X_test: np.ndarray
    stage_labels: np.ndarray
    meta: dict


def _flatten_numeric_array(value: object) -> np.ndarray:
    arr = np.asarray(value).squeeze()
    if arr.dtype.kind not in {"i", "f"}:
        arr = pd.to_numeric(pd.Series(arr.ravel()), errors="coerce").to_numpy()
    return arr.astype(np.float32)


def _extract_stage(path: Path) -> int | None:
    name = path.stem.upper()
    patterns = [
        r"OCV(?P<v>-?\d+)",
        r"FUDS-(?P<v>N?\d+)",
        r"US06-FUDS-(?P<v>N?\d+)",
        r"DST-(?P<v>N?\d+)",
    ]
    for pat in patterns:
        match = re.search(pat, name)
        if match:
            raw = match.group("v")
            if raw.startswith("N"):
                return -int(raw[1:])
            return int(raw)
    return None


def _capacity_from_current(current: np.ndarray, dt_seconds: np.ndarray | float = 1.0) -> np.ndarray:
    if isinstance(dt_seconds, float):
        dt = np.full_like(current, dt_seconds, dtype=np.float32)
    else:
        dt = np.asarray(dt_seconds, dtype=np.float32)
        if len(dt) != len(current):
            dt = np.full_like(current, 1.0, dtype=np.float32)

    # Ah approximation via cumulative integral of |I| dt / 3600.
    q = np.cumsum(np.abs(current) * dt) / 3600.0
    return q.astype(np.float32)


def _extract_from_mat(path: Path) -> pd.DataFrame:
    data = loadmat(path, squeeze_me=True)
    keys = {k.lower(): k for k in data.keys()}

    def pick(candidates: Iterable[str]) -> np.ndarray | None:
        for c in candidates:
            k = keys.get(c)
            if k is not None:
                return _flatten_numeric_array(data[k])
        return None

    voltage = pick(["voltage", "v", "vol"])
    current = pick(["current", "i", "curr"])
    temperature = pick(["temperature", "temp", "t"])
    capacity = pick(["capacity", "cap", "q"])
    time_vec = pick(["time", "timestamp", "t_sec"])

    arrays = [voltage, current, temperature]
    if any(a is None for a in arrays):
        candidates: list[np.ndarray] = []
        for v in data.values():
            arr = np.asarray(v)
            if arr.ndim == 2 and arr.shape[1] >= 3 and np.issubdtype(arr.dtype, np.number):
                candidates.append(arr.astype(np.float32))
        if not candidates:
            raise ValueError(f"No compatible V/I/T fields in {path}")
        mat = candidates[0]
        voltage, current, temperature = mat[:, 0], mat[:, 1], mat[:, 2]
        if mat.shape[1] >= 4:
            capacity = mat[:, 3]

    min_len = min(len(voltage), len(current), len(temperature))
    voltage = voltage[:min_len]
    current = current[:min_len]
    temperature = temperature[:min_len]
    if capacity is not None:
        capacity = capacity[:min_len]

    if capacity is None:
        if time_vec is not None and len(time_vec) >= min_len:
            t = time_vec[:min_len]
            dt = np.diff(t, prepend=t[0])
            dt[dt <= 0] = np.median(dt[dt > 0]) if np.any(dt > 0) else 1.0
            capacity = _capacity_from_current(current, dt)
        else:
            capacity = _capacity_from_current(current, 1.0)

    df = pd.DataFrame(
        {
            "voltage": voltage,
            "current": current,
            "temperature": temperature,
            "capacity": capacity,
        }
    )
    return df.dropna().reset_index(drop=True)


def _extract_from_excel(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path)
    lower_cols = {c.lower(): c for c in df.columns}

    def pick(cands: Iterable[str]) -> str | None:
        for c in cands:
            for col in lower_cols:
                if c in col:
                    return lower_cols[col]
        return None

    v_col = pick(["voltage", "volt"])
    i_col = pick(["current", "curr"])
    t_col = pick(["temp", "temperature"])
    c_col = pick(["capacity", "cap"])
    time_col = pick(["time", "sec", "second", "timestamp"])

    if not all([v_col, i_col, t_col]):
        numeric = df.select_dtypes(include=[np.number])
        if numeric.shape[1] < 3:
            raise ValueError(f"Expected >=3 numeric columns in {path}")
        voltage = numeric.iloc[:, 0].to_numpy(dtype=np.float32)
        current = numeric.iloc[:, 1].to_numpy(dtype=np.float32)
        temperature = numeric.iloc[:, 2].to_numpy(dtype=np.float32)
        capacity = numeric.iloc[:, 3].to_numpy(dtype=np.float32) if numeric.shape[1] >= 4 else None
        time_values = numeric.iloc[:, 4].to_numpy(dtype=np.float32) if numeric.shape[1] >= 5 else None
    else:
        voltage = pd.to_numeric(df[v_col], errors="coerce").to_numpy(dtype=np.float32)
        current = pd.to_numeric(df[i_col], errors="coerce").to_numpy(dtype=np.float32)
        temperature = pd.to_numeric(df[t_col], errors="coerce").to_numpy(dtype=np.float32)
        capacity = pd.to_numeric(df[c_col], errors="coerce").to_numpy(dtype=np.float32) if c_col else None
        time_values = pd.to_numeric(df[time_col], errors="coerce").to_numpy(dtype=np.float32) if time_col else None

    min_len = min(len(voltage), len(current), len(temperature))
    voltage = voltage[:min_len]
    current = current[:min_len]
    temperature = temperature[:min_len]
    if capacity is not None:
        capacity = capacity[:min_len]

    if capacity is None or np.all(np.isnan(capacity)):
        if time_values is not None and len(time_values) >= min_len:
            t = time_values[:min_len]
            dt = np.diff(t, prepend=t[0])
            dt[dt <= 0] = np.median(dt[dt > 0]) if np.any(dt > 0) else 1.0
            capacity = _capacity_from_current(current, dt)
        else:
            capacity = _capacity_from_current(current, 1.0)

    frame = pd.DataFrame(
        {
            "voltage": voltage,
            "current": current,
            "temperature": temperature,
            "capacity": capacity,
        }
    )
    return frame.dropna().reset_index(drop=True)


def read_battery_file(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".mat":
        return _extract_from_mat(path)
    if path.suffix.lower() in {".xls", ".xlsx"}:
        return _extract_from_excel(path)
    raise ValueError(f"Unsupported file type: {path}")


def build_sequences(arr: np.ndarray, window: int) -> np.ndarray:
    seq = []
    for idx in range(0, len(arr) - window + 1):
        seq.append(arr[idx : idx + window])
    if not seq:
        return np.empty((0, window, arr.shape[1]), dtype=np.float32)
    return np.stack(seq).astype(np.float32)


def run_etl(data_root: str, window_size: int = 50, scaler: str = "minmax") -> ETLResult:
    root = Path(data_root)
    files = [p for p in root.rglob("*") if p.suffix.lower() in SUPPORTED]
    if not files:
        raise FileNotFoundError(f"No supported data files found under {data_root}")

    # Build chronological degradation trajectory from stage-labeled files.
    staged_frames: list[tuple[int, Path, pd.DataFrame]] = []
    unlabeled_frames: list[tuple[Path, pd.DataFrame]] = []

    for fp in files:
        try:
            frame = read_battery_file(fp)
            if len(frame) < window_size:
                continue
            stage = _extract_stage(fp)
            if stage is None:
                unlabeled_frames.append((fp, frame))
            else:
                staged_frames.append((stage, fp, frame))
        except Exception:
            continue

    if staged_frames:
        staged_frames.sort(key=lambda x: x[0])
        ordered = [(s, str(p), f) for s, p, f in staged_frames]
    else:
        ordered = [(0, str(p), f) for p, f in sorted(unlabeled_frames, key=lambda x: str(x[0]))]

    if not ordered:
        raise ValueError("No valid files produced enough rows for sequence creation")

    combined = pd.concat([f for _, _, f in ordered], axis=0, ignore_index=True)
    scaler_obj = MinMaxScaler() if scaler == "minmax" else StandardScaler()
    scaled = scaler_obj.fit_transform(combined[FEATURE_COLUMNS]).astype(np.float32)
    joblib.dump(scaler_obj, SCALER_PATH)

    seq_blocks: list[np.ndarray] = []
    seq_stage_labels: list[int] = []
    cursor = 0
    file_stats = []

    for stage, path, frame in ordered:
        segment = scaled[cursor : cursor + len(frame)]
        cursor += len(frame)
        sequences = build_sequences(segment, window_size)
        if len(sequences) == 0:
            continue
        seq_blocks.append(sequences)
        seq_stage_labels.extend([stage] * len(sequences))
        file_stats.append({"file": path, "stage": stage, "rows": int(len(frame)), "sequences": int(len(sequences))})

    X = np.concatenate(seq_blocks, axis=0)
    stage_labels = np.asarray(seq_stage_labels, dtype=np.int32)

    train_mask = np.isin(stage_labels, list(TRAIN_STAGES))
    test_mask = np.isin(stage_labels, list(TEST_STAGES))

    # Fallback if stage bins are unavailable in the source files.
    if not np.any(train_mask):
        train_count = int(len(X) * 0.6)
        train_mask = np.zeros(len(X), dtype=bool)
        train_mask[:train_count] = True
    if not np.any(test_mask):
        test_mask = ~train_mask

    X_train = X[train_mask]
    X_test = X[test_mask]

    out_path = PROCESSED_DIR / f"processed_stage_w{window_size}_{scaler}.npz"
    np.savez_compressed(out_path, X=X, X_train=X_train, X_test=X_test, stage_labels=stage_labels)

    return ETLResult(
        X=X,
        X_train=X_train,
        X_test=X_test,
        stage_labels=stage_labels,
        meta={
            "files_used": len(file_stats),
            "rows_total": int(sum(x["rows"] for x in file_stats)),
            "sequence_count": int(X.shape[0]),
            "train_sequences": int(len(X_train)),
            "test_sequences": int(len(X_test)),
            "window_size": window_size,
            "feature_count": int(X.shape[2]),
            "stages_seen": sorted({int(x["stage"]) for x in file_stats}),
            "file_stats": file_stats,
            "processed_path": str(out_path),
        },
    )
