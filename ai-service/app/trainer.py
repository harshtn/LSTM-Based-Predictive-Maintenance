from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime
from typing import Optional

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from .config import ARTIFACTS_DIR, MODEL_PATH
from .model import LSTMVAE, vae_loss

# Global training state for progress tracking
_training_state = {
    "running": False,
    "current_epoch": 0,
    "total_epochs": 0,
    "loss": 0.0,
    "recon": 0.0,
    "kl": 0.0,
    "error": None,
}


def validate_training_data(X_train: np.ndarray, X_test: np.ndarray, window_size: int) -> list[str]:
    """Validate training data and return list of errors found."""
    errors = []

    # Error 1: Empty training split
    if len(X_train) == 0:
        errors.append("Training split is empty. Check stage parsing and input data.")

    # Error 2: Invalid shape
    if X_train.ndim != 3:
        errors.append(f"Expected 3D array (batch, seq, features), got shape {X_train.shape}")
    else:
        seq_len = X_train.shape[1]
        if seq_len != window_size:
            errors.append(f"Sequence length {seq_len} does not match window_size {window_size}")
        
        features = X_train.shape[2]
        if features < 2:
            errors.append(f"Expected at least 2 features, got {features}")

    # Error 3: NaN or infinite values
    if np.any(~np.isfinite(X_train)):
        nan_count = np.sum(~np.isfinite(X_train))
        errors.append(f"Training data contains {nan_count} NaN/infinite values")

    if len(X_test) > 0:
        if X_test.ndim != 3:
            errors.append(f"Test data: Expected 3D array, got shape {X_test.shape}")
        elif X_test.shape[1] != window_size:
            errors.append(f"Test data sequence length {X_test.shape[1]} != window_size {window_size}")
        elif X_test.shape[2] != X_train.shape[2]:
            errors.append(f"Test features {X_test.shape[2]} != train features {X_train.shape[2]}")
        
        if np.any(~np.isfinite(X_test)):
            nan_count = np.sum(~np.isfinite(X_test))
            errors.append(f"Test data contains {nan_count} NaN/infinite values")

    return errors


def set_training_progress(epoch: int, total: int, loss: float, recon: float, kl: float, error: Optional[str] = None):
    """Update global training progress state."""
    global _training_state
    _training_state["current_epoch"] = epoch
    _training_state["total_epochs"] = total
    _training_state["loss"] = loss
    _training_state["recon"] = recon
    _training_state["kl"] = kl
    _training_state["error"] = error


def get_training_progress() -> dict:
    """Get current training progress state."""
    global _training_state
    return _training_state.copy()


def train_lstm_vae(
    X_train: np.ndarray,
    X_test: np.ndarray,
    window_size: int,
    hidden_dim: int,
    latent_dim: int,
    epochs: int,
    batch_size: int,
) -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _training_state["running"] = True
    _training_state["error"] = None

    # Validate data before training
    validation_errors = validate_training_data(X_train, X_test, window_size)
    if validation_errors:
        error_msg = " | ".join(validation_errors)
        print(f"VALIDATION ERRORS: {error_msg}")
        _training_state["running"] = False
        _training_state["error"] = error_msg
        raise ValueError(error_msg)

    try:
        tensor_x = torch.tensor(X_train, dtype=torch.float32)
        loader = DataLoader(TensorDataset(tensor_x), batch_size=batch_size, shuffle=True)

        model = LSTMVAE(
            input_dim=X_train.shape[2],
            hidden_dim=hidden_dim,
            latent_dim=latent_dim,
            seq_len=window_size
        ).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

        history = []
        model.train()
        for epoch in range(epochs):
            total_loss = 0.0
            total_recon = 0.0
            total_kl = 0.0
            steps = 0

            try:
                for (batch,) in loader:
                    batch = batch.to(device)
                    optimizer.zero_grad()
                    x_hat, mu, logvar = model(batch)
                    loss, recon, kl = vae_loss(batch, x_hat, mu, logvar)
                    loss.backward()
                    optimizer.step()

                    total_loss += float(loss.item())
                    total_recon += float(recon.item())
                    total_kl += float(kl.item())
                    steps += 1
            except Exception as e:
                error_msg = f"Error in epoch {epoch + 1}: {str(e)}"
                set_training_progress(epoch + 1, epochs, total_loss, total_recon, total_kl, error_msg)
                print(f"TRAINING ERROR: {error_msg}")
                raise

            avg_loss = total_loss / max(steps, 1)
            avg_recon = total_recon / max(steps, 1)
            avg_kl = total_kl / max(steps, 1)

            history.append(
                {
                    "epoch": epoch + 1,
                    "loss": avg_loss,
                    "recon": avg_recon,
                    "kl": avg_kl,
                }
            )

            set_training_progress(epoch + 1, epochs, avg_loss, avg_recon, avg_kl)
            print(f"Epoch {epoch + 1}/{epochs} - loss: {avg_loss:.6f}, recon: {avg_recon:.6f}, kl: {avg_kl:.6f}")

        state = {
            "model_state": model.state_dict(),
            "config": {
                "input_dim": int(X_train.shape[2]),
                "hidden_dim": hidden_dim,
                "latent_dim": latent_dim,
                "seq_len": window_size,
            },
            "train_history": history,
        }
        torch.save(state, MODEL_PATH)

        version = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        version_path = ARTIFACTS_DIR / f"lstm_vae_{version}.pt"
        torch.save(state, version_path)

        summary_path = Path(ARTIFACTS_DIR / "train_summary.json")
        summary_path.write_text(json.dumps({"history": history}, indent=2), encoding="utf-8")

        model.eval()
        with torch.no_grad():
            xtr = torch.tensor(X_train, dtype=torch.float32, device=device)
            xtr_hat, mu_tr, logvar_tr = model(xtr)
            tr_loss, tr_recon, tr_kl = vae_loss(xtr, xtr_hat, mu_tr, logvar_tr)

            test_metrics = None
            if len(X_test) > 0:
                xte = torch.tensor(X_test, dtype=torch.float32, device=device)
                xte_hat, mu_te, logvar_te = model(xte)
                te_loss, te_recon, te_kl = vae_loss(xte, xte_hat, mu_te, logvar_te)
                test_metrics = {
                    "loss": float(te_loss.item()),
                    "recon": float(te_recon.item()),
                    "kl": float(te_kl.item()),
                }

        train_metrics = {
            "loss": float(tr_loss.item()),
            "recon": float(tr_recon.item()),
            "kl": float(tr_kl.item()),
        }

        _training_state["running"] = False
        return {
            "model_path": str(MODEL_PATH),
            "model_version_path": str(version_path),
            "history": history,
            "train_samples": int(len(X_train)),
            "test_samples": int(len(X_test)),
            "train_metrics": train_metrics,
            "test_metrics": test_metrics,
            "device": str(device),
            "validation_passed": True,
        }

    except Exception as e:
        _training_state["running"] = False
        error_msg = f"Training failed: {str(e)}"
        _training_state["error"] = error_msg
        print(f"FATAL ERROR: {error_msg}")
        raise


def load_model() -> LSTMVAE:
    if not MODEL_PATH.exists():
        raise FileNotFoundError("Model not trained yet")

    payload = torch.load(MODEL_PATH, map_location="cpu")
    cfg = payload["config"]
    model = LSTMVAE(
        input_dim=cfg["input_dim"],
        hidden_dim=cfg["hidden_dim"],
        latent_dim=cfg["latent_dim"],
        seq_len=cfg["seq_len"],
    )
    model.load_state_dict(payload["model_state"])
    model.eval()
    return model
