type AnalyticsEvent =
  | "registration_submitted"
  | "kyc_submitted"
  | "enquiry_created"
  | "trade_created"
  | "document_created"
  | "document_send_requested";

type AnalyticsData = { location?: "registration" | "kyc" | "kyc_register" | "public_enquiry" | "enquiry_form" | "trade_desk" | "document_generator" };

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void | Promise<unknown>;
    };
  }
}

// Only fixed event names and locations: never pass form values or record IDs.
export function trackEvent(name: AnalyticsEvent, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;
  try {
    const result = window.umami?.track(name, data);
    if (result) void Promise.resolve(result).catch(() => {});
  } catch {
    // Analytics must never interrupt a successful user action.
  }
}