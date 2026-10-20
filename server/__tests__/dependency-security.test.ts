import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import test from "node:test";
import express from "express";
import multer from "multer";
import { multipartFieldLimits } from "../upload-limits";

const require = createRequire(`${process.cwd()}/package.json`);

test("proxy trust does not accept arbitrary IPv4 clients through mapped IPv6 subnets", () => {
  // Resolve the copy Express actually uses, not an unrelated hoisted copy.
  const expressRequire = createRequire(require.resolve("express"));
  const proxyaddr = expressRequire("proxy-addr");
  const trust = proxyaddr.compile(["::ffff:10.0.0.0/8"]);
  assert.equal(trust("203.0.113.7"), false);
  assert.equal(proxyaddr.compile(["10.0.0.0/8"])("10.1.2.3"), true);
});

test("query serialization handles attacker-controlled constructor keys", () => {
  const expressRequire = createRequire(require.resolve("express"));
  const qs = expressRequire("qs");
  const parsed = qs.parse("x[constructor][isBuffer]=not-a-function", { plainObjects: true });
  assert.doesNotThrow(() => qs.stringify(parsed));
  assert.throws(() => qs.parse("a[]=1,2,3,4", {
    comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
  }), RangeError);
});

test("upgraded request parsers preserve forms and bounded multipart uploads", async (t) => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.post("/form", (req, res) => res.json(req.body));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { ...multipartFieldLimits, fileSize: 16 },
  });
  app.post("/upload", (req, res) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({ code: err.code });
        return;
      }
      res.json({ size: req.file?.size, note: req.body.note });
    });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
    server.closeAllConnections();
  }));

  await t.test("JSON and nested URL-encoded forms", async () => {
    for (const [contentType, body] of [
      ["application/json", '{"party":{"name":"Example"}}'],
      ["application/x-www-form-urlencoded", "party[name]=Example"],
    ]) {
      const response = await fetch(`${url}/form`, {
        method: "POST", headers: { "Content-Type": contentType }, body,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { party: { name: "Example" } });
    }
  });
  await t.test("normal files upload and oversized files are rejected", async () => {
    for (const size of [4, 32]) {
      const body = new FormData();
      body.append("note", "example");
      body.append("file", new Blob(["x".repeat(size)]), "example.txt");
      const response = await fetch(`${url}/upload`, { method: "POST", body });
      assert.equal(response.status, size === 4 ? 200 : 400);
      assert.deepEqual(await response.json(), size === 4
        ? { size: 4, note: "example" } : { code: "LIMIT_FILE_SIZE" });
    }
  });
  await t.test("oversized multipart array indexes are rejected without crashing", async () => {
    const body = new FormData();
    // Just beyond the configured bound: a regression fails without allocating
    // a multi-billion-entry sparse array and stalling the test process.
    body.append(`items[${multipartFieldLimits.fieldArrayIndexLimit + 1}]`, "x");
    body.append("items[key]", "y");
    const response = await fetch(`${url}/upload`, { method: "POST", body });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "LIMIT_FIELD_ARRAY_INDEX");
  });
});
