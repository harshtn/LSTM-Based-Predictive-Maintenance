import { Router, type Request, type Response } from "express";
import multer from "multer";
import { DatasetModel } from "../models/Dataset.js";

const upload = multer({ dest: "uploads/" });
export const datasetsRouter = Router();

datasetsRouter.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ message: "file is required" });
    return;
  }

  const dataset = await DatasetModel.create({
    userId: req.userId || null,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    path: req.file.path
  });

  res.status(201).json(dataset);
});

datasetsRouter.get("/uploaded", async (req: Request, res: Response) => {
  const datasets = await DatasetModel.find({}).sort({ createdAt: -1 });
  res.json(datasets);
});
