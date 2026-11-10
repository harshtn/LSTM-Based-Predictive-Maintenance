import axios from "axios";
import { config } from "../config.js";

export const aiClient = axios.create({
  baseURL: config.aiServiceUrl,
  timeout: 120000
});
