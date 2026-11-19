import { readFileSync } from "node:fs";
import { lookupFood } from "../lib/server/usda.js";

const q = readFileSync(0, "utf8");
const response = await lookupFood(q, process.env.USDA_FOODDATA_API_KEY.trim());
process.stdout.write(JSON.stringify(response));
