import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const setup = resolve("scripts/post-merge.sh");

// Exercise the real setup chain without installing packages or touching a DB.
function runSetup(output: string, exitCode = 0, env: Record<string, string> = {}) {
  const bin = mkdtempSync(join(tmpdir(), "post-merge-test-"));
  try {
    writeFileSync(join(bin, "npm"), `#!/bin/bash
if [[ "$*" == "install" ]]; then exit 0; fi
[[ "$*" == "run db:push" ]] || exit 99
# The unattended wrapper must close stdin, even if its caller supplies input.
if read -r answer; then exit 98; fi
printf '%s\\n' "$FAKE_PUSH_OUTPUT"
exit "$FAKE_PUSH_EXIT"
`, { mode: 0o755 });
    return spawnSync("bash", [setup], {
      cwd: tmpdir(), // setup must resolve paths relative to itself
      encoding: "utf8",
      input: "yes\n",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        NODE_ENV: "test",
        REPLIT_DEPLOYMENT: "",
        FAKE_PUSH_OUTPUT: output,
        FAKE_PUSH_EXIT: String(exitCode),
        ...env,
      },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test("post-merge accepts Drizzle completion, including colour and no-op output", () => {
  for (const output of [
    "[✓] Changes applied",
    "[i] No changes detected",
    "[\x1b[32m✓\x1b[39m] Changes applied",
  ]) {
    const result = runSetup(output);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("post-merge rejects zero-exit prompts, empty output and CLI errors", () => {
  for (const output of [
    "Do you want to truncate tfr_recipients table?\n❯ No, add the constraint without truncating the table",
    "Is session created or renamed from another table?",
    "Error: database connection failed",
    "",
    "Not a completion: [✓] Changes applied",
  ]) {
    const result = runSetup(output);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /did not confirm completion/);
  }
});

test("post-merge preserves push failures even with a completion marker", () => {
  for (const code of [2, 124, 137]) {
    const result = runSetup("[✓] Changes applied", code);
    assert.equal(result.status, code);
    assert.match(result.stderr, /setup did not complete/);
  }
});

test("post-merge refuses production execution", () => {
  for (const env of [{ NODE_ENV: "production" }, { REPLIT_DEPLOYMENT: "1" }]) {
    const result = runSetup("[✓] Changes applied", 0, env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /development-only/);
    assert.doesNotMatch(result.stdout, /Changes applied/);
  }
});
