import { test } from "node:test";
import assert from "node:assert/strict";
import { trackEvent } from "../../client/src/lib/analytics";

test("analytics is safe without a browser or tracker, and tolerates tracker failures", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    assert.doesNotThrow(() => trackEvent("kyc_submitted"));
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    assert.doesNotThrow(() => trackEvent("kyc_submitted"));
    const calls: unknown[] = [];
    window.umami = { track: (...args) => { calls.push(args); } };
    trackEvent("enquiry_created", { location: "public_enquiry" });
    assert.deepEqual(calls, [["enquiry_created", { location: "public_enquiry" }]]);
    window.umami = { track: () => { throw new Error("offline"); } };
    assert.doesNotThrow(() => trackEvent("kyc_submitted"));
    window.umami = { track: () => Promise.reject(new Error("offline")) };
    trackEvent("kyc_submitted");
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    Reflect.deleteProperty(globalThis, "window");
    if (original) Object.defineProperty(globalThis, "window", original);
  }
});