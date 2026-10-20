import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { lpgReviewQueryOptions } from "../../client/src/pages/document-generator/hooks/lpg-review-query";
import type { Document } from "@shared/schema";
import type { LpgStsReviewPage } from "@shared/lpg-sts";

test("open review refreshes after amendment approval and can re-clear without reopening", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const originalFetch = globalThis.fetch;
  const doc = {
    id: "open-review", docType: "SPA", title: "LPG", content: "Original terms",
    tradeRef: null, enquiryRef: null, parentDocId: null, buyerEmail: null, sellerEmail: null,
  } as Document;
  let state = { cleared: true, expectedFingerprint: "a".repeat(64), history: [] } as unknown as LpgStsReviewPage;
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify(state), { status: 200 });
  };
  const observer = new QueryObserver(client, lpgReviewQueryOptions(doc));
  const unsubscribe = observer.subscribe(() => {});
  const settled = () => new Promise<void>((resolve) => {
    if (observer.getCurrentResult().isSuccess && !observer.getCurrentResult().isFetching) return resolve();
    const stop = observer.subscribe(result => {
      if (result.isSuccess && !result.isFetching) { stop(); resolve(); }
    });
  });
  try {
    await settled();
    assert.equal(observer.getCurrentResult().data?.cleared, true);
    state = { ...state, cleared: false, expectedFingerprint: "b".repeat(64),
      history: [{ type: "invalidation", fingerprint: "a".repeat(64), nextFingerprint: "b".repeat(64),
        occurredAt: "2026-10-03T00:00:00Z", reason: "Amendment approved" }] };
    // Same mounted observer, new saved content from the amendment mutation.
    observer.setOptions(lpgReviewQueryOptions({ ...doc, content: "Approved amended terms" }));
    assert.equal(observer.getCurrentResult().data, undefined, "old clearance is not displayed during refresh");
    await settled();
    assert.equal(observer.getCurrentResult().data?.cleared, false);
    assert.equal(observer.getCurrentResult().data?.history.length, 1);
    assert.equal(observer.getCurrentResult().data?.expectedFingerprint, "b".repeat(64));
    // Saving uses the fresh fingerprint; the existing mutation's prefix
    // invalidation refreshes revision-keyed queries too.
    state = { ...state, cleared: true };
    await client.invalidateQueries({ queryKey: ["/api/documents/open-review/lpg-sts-review"] });
    assert.equal(observer.getCurrentResult().data?.cleared, true);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(url => url === "/api/documents/open-review/lpg-sts-review"));
    for (const field of ["title", "tradeRef", "enquiryRef", "parentDocId", "buyerEmail", "sellerEmail"] as const) {
      assert.notDeepEqual(lpgReviewQueryOptions(doc).queryKey, lpgReviewQueryOptions({ ...doc, [field]: "changed" }).queryKey);
    }
  } finally {
    unsubscribe();
    client.clear();
    globalThis.fetch = originalFetch;
  }
});