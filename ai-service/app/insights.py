from __future__ import annotations

import numpy as np


def health_report(anomaly_scores: np.ndarray, threshold: float) -> dict:
    count = int((anomaly_scores > threshold).sum())
    ratio = float(count / max(1, len(anomaly_scores)))

    health_score = int(np.clip(100 - ratio * 100, 0, 100))
    if health_score >= 80:
        risk_level = "low"
    elif health_score >= 50:
        risk_level = "medium"
    else:
        risk_level = "high"

    remaining_cycles = int(max(0, round(500 * (health_score / 100))))

    recommendations = [
        "Avoid high temperature operation",
        "Reduce aggressive fast charging",
        "Increase periodic diagnostics",
    ]
    if risk_level == "low":
        recommendations = recommendations[:2]

    return {
        "health_score": health_score,
        "risk_level": risk_level,
        "remaining_cycles": remaining_cycles,
        "anomalies_detected": count,
        "recommendations": recommendations,
    }
