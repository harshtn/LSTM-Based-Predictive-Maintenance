import mongoose, { Schema, type InferSchemaType } from "mongoose";

const resultSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true, default: null },
    experimentId: { type: Schema.Types.ObjectId, ref: "Experiment", required: true, index: true },
    report: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

export type Result = InferSchemaType<typeof resultSchema>;
export const ResultModel = mongoose.model("Result", resultSchema);
