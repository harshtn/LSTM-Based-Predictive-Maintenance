import { Router, type Request, type Response } from "express";
import { aiClient } from "../services/aiClient.js";
import { ExperimentModel } from "../models/Experiment.js";
import { ModelModel } from "../models/Model.js";

export const modelRouter = Router();

modelRouter.post("/train", async (req: Request, res: Response) => {
  const params = req.body || {};

  try {
    // Validate required parameters
    if (!params.data_root) {
      return res.status(400).json({ error: "Missing required parameter: data_root" });
    }

    const exp = await ExperimentModel.create({
      userId: req.userId || null,
      datasetId: params.datasetId || null,
      type: "train",
      status: "running",
      params,
      error: null
    });

    try {
      // Training can run for several minutes; do not enforce the default HTTP timeout here.
      const response = await aiClient.post("/train", params, { timeout: 0 });
      const training = response.data?.training || {};
      const versionPath = String(training.model_version_path || training.model_path || "unknown");
      const version = versionPath.split(/[/\\]/).pop()?.replace(".pt", "") || `${Date.now()}`;

      await ModelModel.create({
        userId: req.userId || null,
        name: "lstm-vae",
        version,
        modelPath: String(training.model_path || ""),
        metrics: {
          train: training.train_metrics || null,
          test: training.test_metrics || null,
        },
        metadata: {
          modelVersionPath: training.model_version_path || null,
          etl: response.data?.etl || {},
        },
      });

      exp.status = "completed";
      await exp.save();
      return res.json({ experimentId: exp.id, ...response.data });
    } catch (aiError: any) {
      exp.status = "failed";
      exp.error = aiError.message || String(aiError);
      await exp.save();
      const message =
        aiError.response?.data?.error ||
        aiError.response?.data?.detail ||
        aiError.response?.data?.message ||
        aiError.message ||
        "AI service training failed";
      return res.status(500).json({ error: message, experimentId: exp.id });
    }
  } catch (error: any) {
    const message = error.message || "Failed to create experiment";
    return res.status(500).json({ error: message });
  }
});

modelRouter.post("/generate", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/generate", req.body || {});
    return res.json(response.data);
  } catch (error: any) {
    const message = error.response?.data?.error || error.message || "Generation failed";
    return res.status(500).json({ error: message });
  }
});

modelRouter.post("/detect", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/detect", req.body || {});
    return res.json(response.data);
  } catch (error: any) {
    const message = error.response?.data?.error || error.message || "Detection failed";
    return res.status(500).json({ error: message });
  }
});

modelRouter.post("/latent", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/latent", req.body || {});
    return res.json(response.data);
  } catch (error: any) {
    const message = error.response?.data?.error || error.message || "Latent analysis failed";
    return res.status(500).json({ error: message });
  }
});

modelRouter.post("/interpolate", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/interpolate", req.body || {});
    return res.json(response.data);
  } catch (error: any) {
    const message = error.response?.data?.error || error.message || "Interpolation failed";
    return res.status(500).json({ error: message });
  }
});

modelRouter.post("/drift", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/drift", req.body || {});
    return res.json(response.data);
  } catch (error: any) {
    const message = error.response?.data?.error || error.message || "Drift analysis failed";
    return res.status(500).json({ error: message });
  }
});

modelRouter.post("/trajectory", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/trajectory", req.body || {});
    return res.json(response.data);
  } catch (error: any) {
    const message = error.response?.data?.error || error.message || "Trajectory analysis failed";
    return res.status(500).json({ error: message });
  }
});

modelRouter.get("/progress", async (_req: Request, res: Response) => {
  try {
    const response = await aiClient.get("/progress", { timeout: 10000 });
    return res.json(response.data);
  } catch (error: any) {
    const message =
      error.response?.data?.error ||
      error.response?.data?.detail ||
      error.message ||
      "Failed to get training progress";
    return res.status(500).json({ error: message });
  }
});
