// What the InterchangeWeb service runs: `node C:\Interchange\launch.cjs`.
//
// Loads C:\Interchange\interchange.env (the node's secrets, never in a release
// folder) and starts the standalone Next server of whichever release
// C:\Interchange\current points at. Modelled on the LMS's launcher
// (connected-suite bridge/lms-node/launch.cjs).
//
// TZ=UTC because the Registry ran in UTC on Vercel and was written there; the
// server's own clock is EAT, and the app must not notice the move.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;

/** KEY=VALUE lines; quotes stripped; # comments and blanks skipped. The env file wins. */
function loadEnv(file) {
  if (!fs.existsSync(file)) throw new Error(`launch: ${file} is missing - run install.ps1 -App`);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    let v = m[2];
    if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

loadEnv(process.env.INTERCHANGE_ENV_FILE || path.join(root, "interchange.env"));
process.env.NODE_ENV = "production";
process.env.TZ = "UTC";
// "localhost", not "127.0.0.1" — the LMS's trap: standalone hands HOSTNAME to the
// router while its render server falls back to "localhost", and when they differ
// every internal rewrite looks external. Node then binds ::1, so IIS, deploy and
// check all call localhost:3200.
process.env.HOSTNAME = "localhost";
process.env.PORT = process.env.PORT || "3200";
process.env.NEXT_TELEMETRY_DISABLED = "1";
// The renderer must use the browser on this machine, never inflate a Linux
// serverless one (lib/reports/render.ts).
process.env.INTERCHANGE_PDF_SERVERLESS = process.env.INTERCHANGE_PDF_SERVERLESS || "off";

const app = fs.realpathSync(path.join(root, "current"));
if (!fs.existsSync(path.join(app, "server.js"))) throw new Error(`launch: no server.js in ${app}`);
process.env.INTERCHANGE_RELEASE = path.basename(app);
process.chdir(app);
console.log(`[launch] ${new Date().toISOString()} release ${process.env.INTERCHANGE_RELEASE} on localhost:${process.env.PORT}`);
require(path.join(app, "server.js"));
