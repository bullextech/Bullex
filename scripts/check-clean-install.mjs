// Isolated, lock-preserving install/build check; working node_modules are never used.
// Invoke with: node scripts/check-clean-install.mjs
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(tmpdir(), "css-clean-install-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: source })
  .toString().split("\0").filter(Boolean);
const keep = file => !file.split("/").some(part =>
  ["node_modules", "dist", ".generated", "generated_docs", "generated-artifacts"].includes(part));
const inputs = files.filter(file => keep(file) && (
  !file.includes("/") ||
  /^(client|server|shared|script|scripts|public|attached_assets)\//.test(file) ||
  file.startsWith("artifacts/mockup-sandbox/")
));
const sandboxPrefix = "artifacts/mockup-sandbox/";
const env = { ...process.env };
delete env.NODE_PATH; // Do not borrow global/working-tree modules.
delete env.NODE_OPTIONS;

function run(command, args, cwd, log, extraEnv = {}, expectedFailure = false) {
  console.log(`[${path.basename(cwd)}] ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const childEnv = { ...env };
    for (const [key, value] of Object.entries(extraEnv)) {
      // Windows environment names are case-insensitive. Otherwise an inherited
      // NPM_CONFIG_CACHE can win over npm_config_cache in Node's spawn handling.
      if (process.platform === "win32") {
        for (const existing of Object.keys(childEnv)) {
          if (existing.toLowerCase() === key.toLowerCase()) delete childEnv[existing];
        }
      }
      childEnv[key] = value;
    }
    const child = spawn(command, args, {
      cwd, env: childEnv,
      // npm.cmd needs the Windows command interpreter.
      shell: process.platform === "win32" && command === npm,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let stdout = "";
    child.stdout.on("data", data => { output += data; stdout += data; });
    child.stderr.on("data", data => { output += data; });
    child.on("error", reject);
    child.on("close", async code => {
      try {
        await writeFile(log, output);
        if (expectedFailure) {
          assert.ok(Number.isInteger(code) && code > 0, `Expected a nonzero failure, got ${code}; see ${log}`);
          console.log(`Expected native rejection confirmed; log: ${log}`);
          resolve(stdout);
        } else if (code !== 0) {
          console.error(output);
          reject(new Error(`${command} ${args.join(" ")} exited ${code}; see ${log}`));
        } else {
          console.log(`Passed; log: ${log}`);
          if (command === process.execPath || args[0] === "audit") console.log(output.trim());
          resolve(stdout);
        }
      } catch (error) { reject(error); }
    });
  });
}

async function checkNativeFailures(name, cwd) {
  const checker = path.join(source, "scripts/check-native-css.cjs");
  const rejectNative = (label, extraEnv) => run(process.execPath, [checker], cwd,
    path.join(temporary, `${name}-${label}.log`), extraEnv, true);
  await rejectNative("forced-wasi", { NAPI_RS_FORCE_WASI: "true" });
  const fromTree = createRequire(path.join(cwd, "package.json"));
  const suffix = `${process.platform}-${process.arch}` + (
    process.platform === "win32" ? "-msvc" :
    process.platform === "linux" ? (process.report.getReport().header.glibcVersionRuntime ? "-gnu" : "-musl") : "");
  for (const [parent, nativeName] of [
    ["@tailwindcss/oxide", `@tailwindcss/oxide-${suffix}`],
    ["lightningcss", `lightningcss-${suffix}`],
  ]) {
    const binding = createRequire(fromTree.resolve(parent)).resolve(nativeName);
    assert.ok(binding.startsWith(path.join(cwd, "node_modules") + path.sep));
    assert.equal(path.extname(binding), ".node");
    // Never load bindings in this coordinator: Windows locks loaded DLLs.
    // Every probe is a fresh process, so module caches cannot hide removal.
    const hidden = `${binding}.unavailable`;
    await rename(binding, hidden);
    try {
      await rejectNative(`missing-${parent === "lightningcss" ? "lightningcss" : "oxide"}`);
    } finally {
      await rename(hidden, binding);
    }
  }
  console.log(`[${name}] Forced WASI and both missing native bindings failed as required.`);
}

async function checkTree(name, entries, checkScript) {
  const cwd = path.join(temporary, name);
  await mkdir(cwd);
  for (const [input, relative] of entries) {
    const destination = path.join(cwd, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(source, input), destination);
  }
  const manifests = ["package.json", "package-lock.json"];
  const before = await Promise.all(manifests.map(file => readFile(path.join(cwd, file))));
  const cache = path.join(temporary, `${name}-cache`);
  await mkdir(cache); // A newly created directory cannot contain cached packages.
  // Leave registry/firewall settings intact; include both build tools and native optionals.
  const installEnv = { npm_config_cache: cache };
  const command = (args, label, extraEnv) => run(npm, args, cwd, path.join(temporary, `${name}-${label}.log`), { ...installEnv, ...extraEnv });
  const selectedCache = await command(["config", "get", "cache"], "cache");
  assert.equal(path.resolve(selectedCache.trim()), cache, `${name} npm selected a foreign cache`);
  console.log(`[${name}] Isolated npm cache selected: ${cache}`);
  await command(["ci", "--include=dev", "--include=optional"], "ci");
  await run(process.execPath, [path.join(source, "scripts/check-native-css.cjs")], cwd,
    path.join(temporary, `${name}-native.log`));
  await checkNativeFailures(name, cwd);
  await command(["ls", "--all"], "dependencies");
  await command(["audit", "--audit-level=low"], "audit");
  // The sandbox build generates src/.generated/mockup-components.ts for tsc.
  await command(["run", "build"], "build", { NODE_ENV: "production", PORT: "5001", BASE_PATH: "/__mockup/" });
  await command(["run", checkScript], "types");
  for (let i = 0; i < manifests.length; i++) {
    assert.deepEqual(await readFile(path.join(cwd, manifests[i])), before[i], `${name} ${manifests[i]} changed`);
  }
  console.log(`[${name}] Manifest and lock unchanged.`);
}

console.log(`Node ${process.version}, npm ${execFileSync(npm, ["--version"], { shell: process.platform === "win32" }).toString().trim()}`);
console.log(`Platform: ${process.platform}/${process.arch}; glibc: ${process.report.getReport().header.glibcVersionRuntime ?? "not glibc"}`);
console.log(`Fresh copies, caches, and logs: ${temporary}`);
try {
  // Separate siblings prevent the sandbox from resolving dependencies from the root install.
  await checkTree("root", inputs.map(file => [file, file]), "check");
  await checkTree("sandbox", inputs.filter(file => file.startsWith(sandboxPrefix))
    .map(file => [file, file.slice(sandboxPrefix.length)]), "typecheck");
  console.log("Both clean installs, native compiler checks, dependency checks, type checks, and builds passed.");
  await rm(temporary, { recursive: true, force: true });
  console.log("Temporary installs and caches removed.");
} catch (error) {
  console.error(`Failed; temporary copies and logs retained for diagnosis: ${temporary}`);
  throw error;
}
