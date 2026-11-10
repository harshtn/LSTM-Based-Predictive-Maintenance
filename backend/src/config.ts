import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/battery_ai",
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000"
};
