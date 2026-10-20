import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { pruneGeneratedDocsCache } from "../documentFileGenerator";

const docsDir = path.join(process.cwd(), "generated_docs");

function makeFile(name: string, bytes: number, ageMs: number): string {
  const p = path.join(docsDir, name);
  fs.writeFileSync(p, Buffer.alloc(bytes, 1));
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(p, t, t);
  return p;
}

test("prune deletes files older than the age limit and keeps fresh ones", () => {
  const oldFile = makeFile("prune-test-old.pdf", 1024, 10 * 24 * 60 * 60 * 1000);
  const freshFile = makeFile("prune-test-fresh.pdf", 1024, 0);
  try {
    // Huge size budget so only the age rule applies.
    pruneGeneratedDocsCache({ maxAgeDays: 7, maxTotalBytes: Number.MAX_SAFE_INTEGER });
    assert.equal(fs.existsSync(oldFile), false, "stale cached file should be deleted");
    assert.equal(fs.existsSync(freshFile), true, "fresh cached file should survive");
  } finally {
    for (const f of [oldFile, freshFile]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
});

test("prune evicts oldest-first when over the size budget", () => {
  // Use fresh files (within age limit) so only the size rule applies.
  const oldest = makeFile("prune-test-budget-oldest.pdf", 512 * 1024, 60 * 60 * 1000);
  const newest = makeFile("prune-test-budget-newest.pdf", 512 * 1024, 0);
  try {
    // Budget of ~600KB: total (>1MB incl. any other cache files) exceeds it, so
    // the oldest file must be evicted first.
    pruneGeneratedDocsCache({ maxAgeDays: 365, maxTotalBytes: 600 * 1024 });
    assert.equal(fs.existsSync(oldest), false, "oldest file should be evicted first");
  } finally {
    for (const f of [oldest, newest]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
});

test("prune skips dot-prefixed logo cache files regardless of age", () => {
  const logoFile = makeFile(".logo-prune-test.png", 256, 400 * 24 * 60 * 60 * 1000);
  try {
    pruneGeneratedDocsCache({ maxAgeDays: 1, maxTotalBytes: 1 });
    assert.equal(fs.existsSync(logoFile), true, "dot-prefixed logo files must never be pruned");
  } finally {
    try { fs.unlinkSync(logoFile); } catch {}
  }
});
