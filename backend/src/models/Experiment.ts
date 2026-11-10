import mongoose, { Schema, type InferSchemaType } from "mongoose";

const experimentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true, default: null },
    datasetId: { type: Schema.Types.ObjectId, ref: "Dataset", required: false, default: null },
    type: { type: String, enum: ["train", "generate", "detect", "analysis", "drift"], required: true },
    status: { type: String, enum: ["queued", "running", "completed", "failed"], default: "queued" },
    params: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, default: null }
  },
  { timestamps: true }
);

export type Experiment = InferSchemaType<typeof experimentSchema>;
export const ExperimentModel = mongoose.model("Experiment", experimentSchema);
