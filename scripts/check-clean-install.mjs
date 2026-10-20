// Isolated, lock-preserving install/build check; working node_modules are never used.
// Invoke with: node scripts/check-clean-install.mjs
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function run(command, args, cwd, log, extraEnv = {}) {
  console.log(`[${path.basename(cwd)}] ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, env: { ...env, ...extraEnv },
      // npm.cmd needs the Windows command interpreter.
      shell: process.platform === "win32" && command === npm,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    child.on("error", reject);
    child.on("close", async code => {
      try {
        await writeFile(log, output);
        if (code !== 0) {
          console.error(output);
          reject(new Error(`${command} ${args.join(" ")} exited ${code}; see ${log}`));
        } else {
          console.log(`Passed; log: ${log}`);
          if (command === process.execPath || args[0] === "audit") console.log(output.trim());
          resolve();
        }
      } catch (error) { reject(error); }
    });
  });
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
  // Leave registry/firewall settings intact; include both build tools and native optionals.
  const installEnv = { npm_config_cache: cache };
  const command = (args, label, extraEnv) => run(npm, args, cwd, path.join(temporary, `${name}-${label}.log`), { ...installEnv, ...extraEnv });
  await command(["ci", "--include=dev", "--include=optional"], "ci");
  await run(process.execPath, [path.join(source, "scripts/check-native-css.cjs")], cwd,
    path.join(temporary, `${name}-native.log`));
  await command(["ls", "--all"], "dependencies");
  await command(["audit", "--audit-level=low"], "audit");
  // The sandbox build generates src/.generated/mockup-components.ts for tsc.
  await command(["run", "build"], "build", { NODE_ENV: "production", PORT: "5001", BASE_PATH: "/__mockup/" });
  await command(["run", checkScript], "types");
  for (let i = 0; i < manifests.length; i++) {
    assert.deepEqual(await readFile(path.join(cwd, manifests[i])), before[i], `${name} ${manifests[i]} changed`);
  }
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
