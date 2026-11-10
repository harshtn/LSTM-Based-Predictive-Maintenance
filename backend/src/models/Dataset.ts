import mongoose, { Schema, type InferSchemaType } from "mongoose";

const datasetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true, default: null },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true }
  },
  { timestamps: true }
);

export type Dataset = InferSchemaType<typeof datasetSchema>;
export const DatasetModel = mongoose.model("Dataset", datasetSchema);
