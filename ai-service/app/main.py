from __future__ import annotations

import numpy as np
import torch
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE

from .etl import run_etl
from .insights import health_report
from .schemas import DetectRequest, DriftRequest, GenerateRequest, HealthRequest, InterpolateRequest, LatentRequest, TrainRequest, TrajectoryRequest
from .trainer import load_model, train_lstm_vae, get_training_progress

app = FastAPI(title="Battery AI Service", version="1.0.0")


def _resolve_data_root(data_root: str) -> str:
    """Resolve data_root relative to repo root so local launch cwd does not matter."""
    candidate = Path(data_root)
    if candidate.exists():
        return str(candidate)

    repo_root = Path(__file__).resolve().parents[2]
    repo_relative = (repo_root / data_root).resolve()
    if repo_relative.exists():
        return str(repo_relative)

    # Fall back to the original value so downstream validation can report details.
    return data_root


def _recon_and_latent_scores(model: torch.nn.Module, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = torch.tensor(X, dtype=torch.float32)
    with torch.no_grad():
        x_hat, mu, _logvar = model(x)
    recon_err = torch.mean((x - x_hat) ** 2, dim=(1, 2)).cpu().numpy()
    latent_dist = torch.norm(mu, dim=1).cpu().numpy()
    return recon_err, latent_dist


def _latent_vectors(model: torch.nn.Module, X: np.ndarray) -> np.ndarray:
    x = torch.tensor(X, dtype=torch.float32)
    with torch.no_grad():
        mu, _ = model.encode(x)
    return mu.cpu().numpy()


@app.get("/healthz")
def ping() -> dict:
    return {"status": "ok"}


@app.post("/train")
def train(payload: TrainRequest) -> dict:
    try:
        resolved_root = _resolve_data_root(payload.data_root)
        etl = run_etl(resolved_root, payload.window_size, payload.scaler)
        result = train_lstm_vae(
            X_train=etl.X_train,
            X_test=etl.X_test,
            window_size=payload.window_size,
            hidden_dim=payload.hidden_dim,
            latent_dim=payload.latent_dim,
            epochs=payload.epochs,
            batch_size=payload.batch_size,
        )
        return {"etl": etl.meta, "training": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Training failed: {exc}") from exc


@app.post("/generate")
def generate(payload: GenerateRequest) -> dict:
    model = load_model()
    latent_dim = model.latent_dim

    z = torch.randn(payload.samples, latent_dim)
    if payload.mode == "accelerated":
        z = z * 1.6
    elif payload.mode == "noisy":
        z = z + 0.4 * torch.randn_like(z)

    with torch.no_grad():
        generated = model.decode(z).cpu().numpy()

    # Conditional generation: temperature-aware scenario control.
    if payload.temp_condition is not None:
        generated[:, :, 2] = payload.temp_condition

    return {
        "mode": payload.mode,
        "samples": int(payload.samples),
        "temp_condition": payload.temp_condition,
        "trajectories": generated.tolist(),
    }


@app.post("/detect")
def detect(payload: DetectRequest) -> dict:
    etl = run_etl(_resolve_data_root(payload.data_root), payload.window_size)
    model = load_model()

    recon_err, latent_dist = _recon_and_latent_scores(model, etl.X)
    anomaly_score = recon_err + 0.1 * latent_dist

    threshold = payload.threshold if payload.threshold is not None else float(np.percentile(anomaly_score, 95))
    labels = (anomaly_score > threshold).astype(int)

    return {
        "threshold": threshold,
        "anomaly_score": anomaly_score.tolist(),
        "labels": labels.tolist(),
        "reconstruction_error": recon_err.tolist(),
        "latent_distance": latent_dist.tolist(),
    }


def _health_core(payload: HealthRequest) -> dict:
    etl = run_etl(_resolve_data_root(payload.data_root), payload.window_size)
    model = load_model()

    eval_set = etl.X_test if len(etl.X_test) > 0 else etl.X
    recon_err, latent_dist = _recon_and_latent_scores(model, eval_set)
    anomaly_score = recon_err + 0.1 * latent_dist
    threshold = float(np.percentile(anomaly_score, 95))

    report = health_report(anomaly_score, threshold)
    report["threshold"] = threshold
    report["average_reconstruction_error"] = float(np.mean(recon_err))
    report["average_latent_distance"] = float(np.mean(latent_dist))
    report["evaluation_split"] = "test" if len(etl.X_test) > 0 else "all"
    report["stages_seen"] = etl.meta.get("stages_seen", [])

    return report


@app.get("/health")
def health_get(data_root: str = Query("./raw"), window_size: int = Query(50)) -> dict:
    payload = HealthRequest(data_root=data_root, window_size=window_size)
    return _health_core(payload)


@app.post("/health")
def health_post(payload: HealthRequest) -> dict:
    return _health_core(payload)


@app.post("/latent")
def latent(payload: LatentRequest) -> dict:
    etl = run_etl(_resolve_data_root(payload.data_root), payload.window_size)
    model = load_model()
    Z = _latent_vectors(model, etl.X)

    sample = Z[: payload.max_points]
    if payload.method == "tsne":
        emb = TSNE(n_components=2, init="pca", learning_rate="auto", perplexity=30).fit_transform(sample)
    else:
        emb = PCA(n_components=2).fit_transform(sample)

    return {
        "method": payload.method,
        "points": emb.tolist(),
    }


@app.post("/interpolate")
def interpolate(payload: InterpolateRequest) -> dict:
    model = load_model()
    z1 = torch.randn(1, model.latent_dim)
    z2 = torch.randn(1, model.latent_dim)

    alphas = torch.linspace(0.0, 1.0, payload.steps).view(-1, 1)
    z_path = (1 - alphas) * z1 + alphas * z2

    with torch.no_grad():
        seq = model.decode(z_path).cpu().numpy()

    return {
        "steps": payload.steps,
        "trajectories": seq.tolist(),
    }


@app.post("/drift")
def drift(payload: DriftRequest) -> dict:
    etl = run_etl(_resolve_data_root(payload.data_root), payload.window_size)
    model = load_model()
    Z = _latent_vectors(model, etl.X)

    labels = etl.stage_labels
    unique_stages = sorted(set(int(x) for x in labels.tolist()))
    centroids = []
    for s in unique_stages:
        points = Z[labels == s]
        if len(points) == 0:
            continue
        centroids.append({"stage": s, "centroid": points.mean(axis=0)})

    drifts = []
    for i in range(1, len(centroids)):
        prev = np.asarray(centroids[i - 1]["centroid"])
        curr = np.asarray(centroids[i]["centroid"])
        drifts.append(
            {
                "from_stage": centroids[i - 1]["stage"],
                "to_stage": centroids[i]["stage"],
                "distance": float(np.linalg.norm(curr - prev)),
            }
        )

    return {
        "stages": [c["stage"] for c in centroids],
        "drift": drifts,
    }


@app.post("/trajectory")
def trajectory(payload: TrajectoryRequest) -> dict:
    etl = run_etl(_resolve_data_root(payload.data_root), payload.window_size)
    # Use representative capacity point per sequence for smooth trend view.
    capacity = etl.X[:, -1, 3]
    points = [{"x": int(i), "y": float(v)} for i, v in enumerate(capacity.tolist())]
    stage_points = [{"x": int(i), "stage": int(s)} for i, s in enumerate(etl.stage_labels.tolist())]
    return {"capacity_curve": points, "stage_points": stage_points, "meta": etl.meta}


@app.get("/progress")
def get_progress() -> dict:
    """Get current training progress."""
    return get_training_progress()
