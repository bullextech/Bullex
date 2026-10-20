import test, { after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import { buildAutoChainFailureNotification } from "../routes";

// When the sign endpoint's AUTO_SIGN_CHAIN loop fails to create a child
// document (e.g. a signed SPA failing to create its DLC/PBG/TFR drafts),
// admins must receive an in-app notification naming the parent document and
// the missing child type — while the signing request still succeeds.

const createdNotificationIds: string[] = [];

after(async () => {
  for (const id of createdNotificationIds.reverse()) {
    try { await storage.deleteNotification(id); } catch {}
  }
});

test("buildAutoChainFailureNotification names the parent doc and missing child type", () => {
  const payload = buildAutoChainFailureNotification(
    { id: "doc-1", docType: "SPA", title: "SPA - ACME/GLOBEX" },
    "DLC_MT700",
    "db connection lost",
  );
  assert.equal(payload.type, "auto_chain_failed");
  assert.equal(payload.severity, "alert");
  assert.ok(payload.title.includes("DLC_MT700"), "title should name the missing child type");
  assert.ok(payload.message.includes("SPA"), "message should name the parent doc type");
  assert.ok(payload.message.includes("SPA - ACME/GLOBEX"), "message should name the parent doc title");
  assert.ok(payload.message.includes("DLC_MT700"), "message should name the missing child type");
  assert.ok(payload.message.includes("db connection lost"), "message should carry the error detail");
});

test("payload omits the error suffix when no message is available", () => {
  const payload = buildAutoChainFailureNotification(
    { id: "doc-2", docType: "SPA", title: "SPA - test" },
    "PBG_MT760",
  );
  assert.ok(!payload.message.includes("()"), "no empty parenthetical");
  assert.ok(payload.message.includes("PBG_MT760"));
});

test("the notification payload persists via storage.createNotification (notify path)", async () => {
  const payload = buildAutoChainFailureNotification(
    { id: "doc-3", docType: "SPA", title: "SPA - notify persistence test" },
    "TFR",
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
  assert.equal(found!.type, "auto_chain_failed");
  assert.equal(found!.severity, "alert");
  assert.ok(found!.message.includes("SPA - notify persistence test"));
  assert.ok(found!.message.includes("TFR"));
});
