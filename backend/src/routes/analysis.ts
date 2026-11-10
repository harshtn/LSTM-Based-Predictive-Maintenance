import { Router, type Request, type Response } from "express";
import { aiClient } from "../services/aiClient.js";
import { ExperimentModel } from "../models/Experiment.js";
import { ResultModel } from "../models/Result.js";

export const analysisRouter = Router();

analysisRouter.post("/run", async (req: Request, res: Response) => {
  const params = req.body || {};
  const exp = await ExperimentModel.create({
    userId: req.userId || null,
    datasetId: params.datasetId,
    type: "analysis",
    status: "running",
    params
  });

  try {
    const { data } = await aiClient.get("/health", {
      params: {
        data_root: params.data_root || "./raw",
        window_size: params.window_size || 50,
      },
    });
    exp.status = "completed";
    await exp.save();

    const result = await ResultModel.create({
      userId: req.userId || null,
      experimentId: exp.id,
      report: data
    });

    res.json({ experimentId: exp.id, resultId: result.id, report: data });
  } catch (error) {
    exp.status = "failed";
    await exp.save();
    throw error;
  }
});

analysisRouter.get("/report/:id", async (req: Request, res: Response) => {
  const result = await ResultModel.findById(req.params.id);
  if (!result) {
    res.status(404).json({ message: "Report not found" });
    return;
  }

  res.json(result);
});

analysisRouter.get("/compare", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit || 5);
  const results = await ResultModel.find({}).sort({ createdAt: -1 }).limit(limit);
  const comparison = results.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    health_score: r.report?.health_score ?? null,
    anomalies_detected: r.report?.anomalies_detected ?? null,
    risk_level: r.report?.risk_level ?? null,
    remaining_cycles: r.report?.remaining_cycles ?? null,
  }));
  res.json({ items: comparison });
});
