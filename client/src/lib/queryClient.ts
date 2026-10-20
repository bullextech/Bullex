import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Robust multipart/file upload helper.
 *
 * Wraps a FormData POST with:
 *  - `credentials: "include"` so the session cookie is always sent,
 *  - an AbortController timeout so a stalled request fails with an actionable
 *    error instead of an infinite "processing…" spinner,
 *  - friendly messaging for the common Replit-preview case where the embedded
 *    preview pane blocks the session cookie (401/403) — the fix is to open the
 *    app in a full browser tab.
 *
 * Throws an Error on any failure; returns the ok Response otherwise.
 */
export async function uploadFormData(
  url: string,
  formData: FormData,
  timeoutMs = 60000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Your session isn't active in this view. Open the app in a full browser tab (not the embedded preview), sign in, then upload again.",
        );
      }
      const body = await res.json().catch(() => ({} as any));
      throw new Error(body.message || `Upload failed (${res.status})`);
    }
    return res;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(
        "Upload timed out. Open the app in a full browser tab (not the embedded preview), check your connection, and try again.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
