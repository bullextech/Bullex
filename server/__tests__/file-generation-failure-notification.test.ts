import test, { after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import { buildFileGenerationFailureNotification, runFileGenerationOrNotify } from "../routes";

// When DOCX/PDF file generation fails — either during pipeline (deal-cascade)
// document creation or during sign-time signature regeneration — admins must
// receive an in-app notification naming the affected document and what failed,
// while the originating request still succeeds.

const createdNotificationIds: string[] = [];

after(async () => {
  for (const id of createdNotificationIds.reverse()) {
    try { await storage.deleteNotification(id); } catch {}
  }
});

test("pipeline_create payload names the doc and states files are missing", () => {
  const payload = buildFileGenerationFailureNotification(
    { id: "doc-1", docType: "SCO", title: "SCO - DEAL-001" },
    "pipeline_create",
    "pdf renderer crashed",
  );
  assert.equal(payload.type, "file_generation_failed");
  assert.equal(payload.severity, "alert");
  assert.equal(payload.module, "documents");
  assert.equal(payload.link, "/documents");
  assert.ok(payload.title.includes("SCO"), "title should name the doc type");
  assert.ok(payload.message.includes("SCO - DEAL-001"), "message should name the doc title");
  assert.ok(/without its DOCX\/PDF files/.test(payload.message), "message should say files are missing");
  assert.ok(payload.message.includes("pdf renderer crashed"), "message should carry the error detail");
});

test("signature_regenerate payload states existing files are stale", () => {
  const payload = buildFileGenerationFailureNotification(
    { id: "doc-2", docType: "SPA", title: "SPA - ACME/GLOBEX" },
    "signature_regenerate",
    "disk full",
  );
  assert.equal(payload.type, "file_generation_failed");
  assert.equal(payload.severity, "alert");
  assert.ok(payload.message.includes("SPA - ACME/GLOBEX"));
  assert.ok(/stale/.test(payload.message), "message should flag stale files");
  assert.ok(payload.message.includes("disk full"));
});

test("payload omits the error suffix when no message is available", () => {
  const payload = buildFileGenerationFailureNotification(
    { id: "doc-3", docType: "LOI", title: "LOI - test" },
    "pipeline_create",
  );
  assert.ok(!payload.message.includes("()"), "no empty parenthetical");
  assert.ok(payload.message.includes("LOI - test"));
});

test("send_email payload states the send silently failed", () => {
  const payload = buildFileGenerationFailureNotification(
    { id: "doc-5", docType: "NCNDA", title: "NCNDA - ACME" },
    "send_email",
    "smtp timeout",
  );
  assert.equal(payload.type, "file_generation_failed");
  assert.ok(/silently failed/.test(payload.message));
  assert.ok(payload.message.includes("NCNDA - ACME"));
  assert.ok(payload.message.includes("smtp timeout"));
});

// Exercise the actual failure path used by the routes: a throwing generator
// must result in a persisted admin notification, and the wrapper must swallow
// the error (so the originating request still succeeds).
test("runFileGenerationOrNotify persists an admin alert when the generator throws", async () => {
  const doc = { id: "doc-6", docType: "SPA", title: "SPA - regen failure path test" };
  const result = await runFileGenerationOrNotify(doc, "signature_regenerate", async () => {
    throw new Error("boom: renderer crashed");
  });
  assert.equal(result, null, "wrapper must swallow the failure and return null");

  const notifications = await storage.getNotifications(50);
  const found = notifications.find(
    (n) => n.type === "file_generation_failed" && n.message.includes("SPA - regen failure path test"),
  );
  assert.ok(found, "a file_generation_failed notification must be persisted");
  createdNotificationIds.push(found!.id);
  assert.equal(found!.severity, "alert");
  assert.ok(found!.message.includes("boom: renderer crashed"), "error detail carried");
  assert.ok(/stale/.test(found!.message), "regenerate context flags stale files");
});

test("runFileGenerationOrNotify passes through on success without notifying", async () => {
  const marker = "success path no-notify marker";
  const result = await runFileGenerationOrNotify(
    { id: "doc-7", docType: "LOI", title: `LOI - ${marker}` },
    "pipeline_create",
    async () => "generated-ok",
  );
  assert.equal(result, "generated-ok");
  const notifications = await storage.getNotifications(50);
  assert.ok(
    !notifications.some((n) => n.message.includes(marker)),
    "no notification should be created on success",
  );
});

test("the payload persists via storage.createNotification (notify path)", async () => {
  const payload = buildFileGenerationFailureNotification(
    { id: "doc-4", docType: "TFR", title: "TFR - persistence test" },
    "signature_regenerate",
    "file generation error",
  );
  const created = await storage.createNotification({
    type: payload.type,
    title: payload.title,
    message: payload.message,
    link: payload.link,
    severity: payload.severity,
    module: payload.module,
  } as any);
  createdNotificationIds.push(created.id);

  const notifications = await storage.getNotifications(50);
  const found = notifications.find((n) => n.id === created.id);
  assert.ok(found, "notification should be retrievable");
  assert.equal(found!.type, "file_generation_failed");
  assert.equal(found!.severity, "alert");
  assert.ok(found!.message.includes("TFR - persistence test"));
});
