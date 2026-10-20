// Production-bundle smoke check.
//
// Boots the built server bundle (`dist/index.cjs`) exactly like the deploy
// runtime does (`NODE_ENV=production node dist/index.cjs`) on a spare port and
// waits until it both logs "serving on port ..." and answers /api/health.
// Fails if the process exits early or never binds the port.
//
// Why: the dev workflow never executes the esbuild CJS bundle, so bundle-only
// startup crashes (e.g. ESM-only `createRequire(import.meta.url)` under
// --format=cjs) previously shipped straight to production and crash-looped the
// deploy. Run this after `npm run build`:
//
//   npm run build && npx tsx script/smoke-prod.ts

import { spawn } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import http from "http";
import path from "path";

const BUNDLE = "dist/index.cjs";
const PORT = parseInt(process.env.SMOKE_PORT || "5099", 10);
const TIMEOUT_MS = 30_000;

function fail(msg: string): never {
  console.error(`[smoke-prod] FAIL: ${msg}`);
  process.exit(1);
}

if (!existsSync(BUNDLE)) {
  fail(`${BUNDLE} not found — run \`npm run build\` first.`);
}

// Simple GET returning status + body, used for /api/health and /.
function get(pathName: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port: PORT, path: pathName, timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`request to ${pathName} timed out`));
    });
  });
}

// Verify "/" serves the built index.html with the app root markup, and that
// every local JS/CSS asset it references actually exists in dist/public.
// Catches a bad client build (blank homepage) that a passing /api/health hides.
async function checkHomepage(): Promise<string> {
  const { status, body } = await get("/");
  if (status !== 200) throw new Error(`"/" returned HTTP ${status}`);
  const looksHtml = /<!doctype html>/i.test(body) || /<html[\s>]/i.test(body);
  if (!looksHtml) throw new Error(`"/" did not return HTML`);
  if (!/<div id="root">/.test(body)) {
    throw new Error(`"/" HTML is missing the app root markup (<div id="root">)`);
  }

  // Collect local script src / stylesheet href references.
  const assets: string[] = [];
  for (const m of body.matchAll(/<script[^>]+src="([^"]+)"/g)) assets.push(m[1]);
  for (const m of body.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)) assets.push(m[1]);
  for (const m of body.matchAll(/<link[^>]+href="([^"]+)"[^>]*rel="stylesheet"/g)) assets.push(m[1]);
  const local = [...new Set(assets)].filter((a) => a.startsWith("/") && !a.startsWith("//"));
  if (local.length === 0) {
    throw new Error(`"/" HTML references no local JS/CSS assets — client build looks broken`);
  }
  const missing = local.filter(
    (a) => !existsSync(path.join("dist/public", a.replace(/^\//, "").split("?")[0])),
  );
  if (missing.length > 0) {
    throw new Error(`referenced assets missing from dist/public: ${missing.join(", ")}`);
  }
  return `"/" served index.html with root markup, ${local.length} referenced asset(s) present`;
}

// Verify every lazy-loaded chunk exists in dist/public, not just the entry
// files index.html references. Two independent sources of truth:
//   1. Vite's build manifest (.vite/manifest.json) — every emitted file plus
//      its imports/dynamicImports/css/assets must resolve on disk.
//   2. The emitted JS chunks themselves — every relative import specifier
//      (static `from"./x.js"` or dynamic `import("./x.js")`) must resolve.
// A build that drops or corrupts a lazy chunk passes the homepage check but
// breaks specific pages after publish; this catches it before deploy.
function checkLazyChunks(): string {
  const pub = "dist/public";
  const missing = new Set<string>();

  // 1. Manifest: collect every referenced output file.
  const manifestPath = path.join(pub, ".vite/manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `${manifestPath} not found — vite build.manifest must be enabled so lazy chunks can be verified`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    { file: string; css?: string[]; assets?: string[]; imports?: string[]; dynamicImports?: string[] }
  >;
  const entries = Object.entries(manifest);
  if (entries.length === 0) throw new Error(`${manifestPath} is empty — client build looks broken`);
  let manifestFiles = 0;
  for (const [key, chunk] of entries) {
    for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) {
      manifestFiles++;
      if (!existsSync(path.join(pub, file))) missing.add(`${file} (from manifest entry ${key})`);
    }
    // imports/dynamicImports are manifest keys; a dangling key means the
    // manifest itself is inconsistent with the build.
    for (const dep of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      if (!manifest[dep]) missing.add(`manifest entry "${dep}" (imported by ${key})`);
    }
  }

  // 2. Emitted chunks: verify each chunk's relative import specifiers resolve.
  const assetsDir = path.join(pub, "assets");
  const jsFiles = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((f) => f.endsWith(".js"))
    : [];
  let importRefs = 0;
  for (const f of jsFiles) {
    const src = readFileSync(path.join(assetsDir, f), "utf8");
    const specs = new Set<string>();
    // Dynamic imports: import("./chunk-xyz.js")
    for (const m of src.matchAll(/import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) specs.add(m[1]);
    // Static imports: from"./chunk-xyz.js" / import"./chunk-xyz.js"
    for (const m of src.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) specs.add(m[1]);
    for (const spec of specs) {
      importRefs++;
      const resolved = path.join(assetsDir, spec.split("?")[0]);
      if (!existsSync(resolved)) missing.add(`${spec} (imported by assets/${f})`);
    }
  }

  if (missing.size > 0) {
    throw new Error(
      `missing lazy-loaded chunk file(s):\n  - ${[...missing].join("\n  - ")}`,
    );
  }
  return `${manifestFiles} manifest file(s) and ${importRefs} chunk import(s) across ${jsFiles.length} JS chunk(s) all resolve`;
}

const child = spawn("node", [BUNDLE], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let sawServing = false;
let done = false;

function finish(code: number, msg: string) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  child.kill("SIGTERM");
  // Force-kill if it ignores SIGTERM.
  setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  if (code === 0) {
    console.log(`[smoke-prod] PASS: ${msg}`);
  } else {
    console.error(`[smoke-prod] FAIL: ${msg}`);
    console.error("── bundle output ──────────────────────────────");
    // Node crash dumps quote the failing source line; in a minified bundle
    // that's a multi-MB line that drowns the actual error message in logs.
    // Truncate each line so the error and stack stay visible.
    const trimmed = (output.trim() || "(no output)")
      .split("\n")
      .map((l) => (l.length > 400 ? `${l.slice(0, 400)}… [line truncated, ${l.length} chars]` : l))
      .join("\n");
    console.error(trimmed);
  }
  process.exit(code);
}

const timer = setTimeout(() => {
  finish(1, `server did not bind port ${PORT} within ${TIMEOUT_MS / 1000}s`);
}, TIMEOUT_MS);

function onOutput(chunk: Buffer) {
  output += chunk.toString();
  if (!sawServing && output.includes(`serving on port ${PORT}`)) {
    sawServing = true;
    // Confirm the port actually answers, not just the log line, then verify
    // the homepage serves the built client.
    (async () => {
      const health = await get("/api/health");
      if (health.status !== 200) {
        throw new Error(`/api/health returned HTTP ${health.status}`);
      }
      const homeMsg = await checkHomepage();
      const chunkMsg = checkLazyChunks();
      finish(0, `bundle booted, bound port ${PORT}, /api/health returned 200; ${homeMsg}; ${chunkMsg}`);
    })().catch((err: Error) => finish(1, err.message));
  }
}

child.stdout.on("data", onOutput);
child.stderr.on("data", onOutput);

child.on("exit", (code, signal) => {
  if (!done) {
    finish(1, `process exited before binding the port (code=${code}, signal=${signal})`);
  }
});
child.on("error", (err) => finish(1, `failed to spawn node: ${err.message}`));
