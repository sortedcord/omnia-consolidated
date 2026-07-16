import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load .env from monorepo root or apps/gui/
const cwd = process.cwd();
const envCandidates = [
  path.resolve(cwd, ".env"),
  path.resolve(cwd, "../../.env"),
];
for (const c of envCandidates) {
  if (fs.existsSync(c) && fs.statSync(c).isFile()) {
    dotenv.config({ path: c });
    break;
  }
}
