import mongoose, { Schema, type InferSchemaType } from "mongoose";

const modelSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true, default: null },
    name: { type: String, required: true, default: "lstm-vae" },
    version: { type: String, required: true, index: true },
    modelPath: { type: String, required: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export type Model = InferSchemaType<typeof modelSchema>;
export const ModelModel = mongoose.model("Model", modelSchema);
