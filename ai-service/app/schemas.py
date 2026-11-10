from pydantic import BaseModel
from typing import Literal


class TrainRequest(BaseModel):
    data_root: str = "./raw"
    window_size: int = 50
    latent_dim: int = 16
    hidden_dim: int = 64
    epochs: int = 20
    batch_size: int = 64
    scaler: Literal["minmax", "zscore"] = "minmax"


class GenerateRequest(BaseModel):
    samples: int = 10
    mode: Literal["normal", "accelerated", "noisy"] = "normal"
    window_size: int = 50
    temp_condition: float | None = None


class DetectRequest(BaseModel):
    data_root: str = "./raw"
    window_size: int = 50
    threshold: float | None = None


class HealthRequest(BaseModel):
    data_root: str = "./raw"
    window_size: int = 50


class LatentRequest(BaseModel):
    data_root: str = "./raw"
    window_size: int = 50
    method: Literal["pca", "tsne"] = "pca"
    max_points: int = 500


class InterpolateRequest(BaseModel):
    steps: int = 10


class DriftRequest(BaseModel):
    data_root: str = "./raw"
    window_size: int = 50


class TrajectoryRequest(BaseModel):
    data_root: str = "./raw"
    window_size: int = 50
