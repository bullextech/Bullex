// Google Calendar integration (Replit connector "google-calendar").
// Generates an instant, shareable Google Meet link by inserting a short
// calendar event with a hangoutsMeet conference attached. The connector SDK
// injects + refreshes OAuth2 tokens automatically via the proxy.
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export interface InstantMeeting {
  meetUrl: string;
  eventId: string;
  start: string;
  end: string;
  htmlLink?: string;
}

export async function createInstantMeeting(opts?: {
  title?: string;
  durationMinutes?: number;
}): Promise<InstantMeeting> {
  const now = new Date();
  const durationMinutes =
    opts?.durationMinutes && opts.durationMinutes > 0 ? Math.min(opts.durationMinutes, 480) : 60;
  const end = new Date(now.getTime() + durationMinutes * 60 * 1000);
  const requestId = `bullex-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;

  const body = {
    summary: (opts?.title?.trim() || "Bullex Instant Meeting").slice(0, 200),
    description: "Instant meeting created from the Bullex trading platform.",
    start: { dateTime: now.toISOString() },
    end: { dateTime: end.toISOString() },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const response = await connectors.proxy(
    "google-calendar",
    "/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data?.error?.message || `Google Calendar API error (${response.status})`;
    throw new Error(msg);
  }

  const meetUrl: string | undefined =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri;

  if (!meetUrl) {
    throw new Error(
      "Meeting created but no Google Meet link was returned. Ensure Google Meet is enabled for this account.",
    );
  }

  return {
    meetUrl,
    eventId: data.id,
    start: data.start?.dateTime || now.toISOString(),
    end: data.end?.dateTime || end.toISOString(),
    htmlLink: data.htmlLink,
  };
}
