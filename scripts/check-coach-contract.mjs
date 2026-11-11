// The coach prompt and JSON schema exist twice — lib/coach-contract.js (browser,
// used when a user brings their own key) and lib/server/coach-handler.js (server,
// owner-funded). The project has no build step, so they cannot share a module.
// This check fails if they drift, which would let the two paths give different
// safety guidance.
//
//   node scripts/check-coach-contract.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientSrc = readFileSync(join(repo, "lib/coach-contract.js"), "utf8");
const serverSrc = readFileSync(join(repo, "lib/server/coach-handler.js"), "utf8");

let failed = false;
const fail = (msg) => { failed = true; console.error(`DRIFT: ${msg}`); };

// Grab a backtick-delimited constant body by name.
function template(src, name) {
  const m = src.match(new RegExp(`${name} = \`([\\s\\S]*?)\``));
  return m ? m[1].trim() : null;
}

// Grab a brace-delimited object literal by name, normalizing whitespace.
function objectLiteral(src, name) {
  const start = src.indexOf(`${name} = {`);
  if (start < 0) return null;
  let i = src.indexOf("{", start), depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  return end < 0 ? null : src.slice(i, end).replace(/\s+/g, " ");
}

const clientPrompt = template(clientSrc, "DEVELOPER_INSTRUCTIONS");
const serverPrompt = template(serverSrc, "DEVELOPER_INSTRUCTIONS");
if (!clientPrompt || !serverPrompt) fail("DEVELOPER_INSTRUCTIONS not found in both files");
else if (clientPrompt !== serverPrompt) fail("DEVELOPER_INSTRUCTIONS differ between client and function");
else console.log("ok:   DEVELOPER_INSTRUCTIONS match");

const clientSchema = objectLiteral(clientSrc, "COACH_SCHEMA");
const serverSchema = objectLiteral(serverSrc, "COACH_SCHEMA");
if (!clientSchema || !serverSchema) fail("COACH_SCHEMA not found in both files");
else if (clientSchema !== serverSchema) fail("COACH_SCHEMA differs between client and function");
else console.log("ok:   COACH_SCHEMA matches");

const clientActions = clientSrc.match(/ACTIONS = \[([^\]]*)\]/)?.[1].replace(/\s+/g, "");
const serverActions = serverSrc.match(/ACTIONS = new Set\(\[([^\]]*)\]/)?.[1].replace(/\s+/g, "");
if (!clientActions || !serverActions) fail("ACTIONS not found in both files");
else if (clientActions !== serverActions) fail(`ACTIONS differ: ${clientActions} vs ${serverActions}`);
else console.log("ok:   ACTIONS match");

console.log(failed ? "\nCONTRACT DRIFT — sync the two copies." : "\nCoach contract in sync.");
process.exit(failed ? 1 : 0);
