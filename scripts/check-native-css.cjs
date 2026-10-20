// Run from a package tree after npm ci. No WASI or JavaScript fallback qualifies.
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");

const cwd = process.cwd();
const fromTree = createRequire(path.join(cwd, "package.json"));
assert.ok(!process.env.NAPI_RS_NATIVE_LIBRARY_PATH, "Custom native bindings are not allowed");
assert.ok(!["true", "error"].includes(process.env.NAPI_RS_FORCE_WASI), "WASI is not a native-platform check");
assert.ok(!process.env.CSS_TRANSFORMER_WASM, "Lightning CSS WASM is not a native-platform check");

let target = `${process.platform}-${process.arch}`;
if (process.platform === "linux") {
  assert.ok(["x64", "arm64"].includes(process.arch), `Unsupported check target: ${target}`);
  target += process.report.getReport().header.glibcVersionRuntime ? "-gnu" : "-musl";
} else if (process.platform === "win32") {
  target += "-msvc";
} else {
  assert.equal(process.platform, "darwin", `Unsupported check target: ${target}`);
}

const lock = fromTree("./package-lock.json");
for (const [parent, nativeName] of [
  ["@tailwindcss/oxide", `@tailwindcss/oxide-${target}`],
  ["lightningcss", `lightningcss-${target}`],
]) {
  const parentEntry = fromTree.resolve(parent);
  assert.ok(parentEntry.startsWith(path.join(cwd, "node_modules") + path.sep), `${parent} resolved outside this install`);
  const fromParent = createRequire(parentEntry);
  const bindingPath = fromParent.resolve(nativeName);
  assert.ok(bindingPath.startsWith(path.join(cwd, "node_modules") + path.sep), `${nativeName} resolved outside this install`);
  assert.equal(path.extname(bindingPath), ".node", `${nativeName} must be a native binary`);
  const metadata = fromParent(`${nativeName}/package.json`);
  const parentVersion = lock.packages[`node_modules/${parent}`].version;
  assert.equal(metadata.version, parentVersion, `${nativeName} version mismatch`);
  assert.equal(lock.packages[`node_modules/${nativeName}`].version, metadata.version);
  assert.equal(lock.packages[`node_modules/${nativeName}`].optional, true);
  const binding = fromParent(nativeName); // Throws on missing/incompatible binaries.
  const normal = fromTree(parent);
  if (parent === "@tailwindcss/oxide") {
    assert.equal(normal.Scanner, binding.Scanner, "Oxide loader did not select the native binding");
    const scanner = new normal.Scanner({});
    assert.ok(scanner.scanFiles([{ content: '<div class="flex w-[713px]"></div>', extension: "html" }]).includes("flex"));
  } else {
    // Lightning CSS wraps the native function to support visitor callbacks.
    const options = {
      filename: "native-check.css",
      code: Buffer.from(".native-check { color: red; }"),
      minify: true,
    };
    const result = normal.transform(options);
    assert.deepEqual(result, binding.transform(options), "Lightning CSS wrapper/native output mismatch");
    assert.match(result.code.toString(), /\.native-check/);
  }
  console.log(`${nativeName}@${metadata.version}: native load and execution passed`);
}
