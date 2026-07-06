import { z } from "zod";
import path from "node:path";

const CoreConfigSchema = z.object({
  OMNIA_DB_PATH: z.string().default(path.join(process.cwd(), "omnia.db")),
});

export const coreConfig = CoreConfigSchema.parse(process.env);
