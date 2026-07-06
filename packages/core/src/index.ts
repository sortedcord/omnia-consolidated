import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(__dirname, "../.env") });

export * from "./attribute.js";
export * from "./entity.js";
export * from "./world.js";
export * from "./repository.js";
