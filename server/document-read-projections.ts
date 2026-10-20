import { getTableColumns, sql } from "drizzle-orm";
import { documents } from "@shared/schema";
import type { LpgStsReviewPage } from "@shared/lpg-sts";

// These projections are for reads only. Mutations must load the full locked
// row so replacing adminChecks can never discard append-only audit history.
const checksArray = sql`CASE WHEN jsonb_typeof(${documents.adminChecks}) = 'array'
  THEN ${documents.adminChecks} ELSE '[]'::jsonb END`;

export const documentBrowseColumns = {
  ...getTableColumns(documents),
  adminChecks: sql<unknown>`CASE WHEN jsonb_typeof(${documents.adminChecks}) = 'array' THEN
    (SELECT coalesce(jsonb_agg(
      CASE WHEN entry->>'key' = 'lpgStsReview'
        THEN jsonb_build_object('key', 'lpgStsReview', 'clearance', entry->'clearance')
        ELSE entry END ORDER BY ordinal), '[]'::jsonb)
     FROM jsonb_array_elements(${checksArray}) WITH ORDINALITY AS checks(entry, ordinal))
    ELSE ${documents.adminChecks} END`,
};

/** Same virtual legacy-clearance append and exclusive offsets as
 * lpgStsReviewPage, but only the requested events cross the database boundary.
 * All fields are selected in one statement, giving state and page one snapshot.
 */
export function lpgStsAuditPageProjection(before?: number) {
  if (before !== undefined && (!Number.isSafeInteger(before) || before < 0)) {
    throw new Error("Invalid history cursor");
  }
  return sql<Pick<LpgStsReviewPage, "history" | "historyTotal" | "nextBefore">>`(
    WITH metadata AS (
      SELECT entry FROM jsonb_array_elements(${checksArray})
        WITH ORDINALITY AS checks(entry, ordinal)
      WHERE entry->>'key' = 'lpgStsReview' ORDER BY ordinal LIMIT 1
    ), stored AS (
      SELECT CASE WHEN jsonb_typeof(entry->'history') = 'array'
        THEN entry->'history' ELSE '[]'::jsonb END AS history,
        nullif(entry->'clearance', 'null'::jsonb) AS clearance
      FROM (SELECT (SELECT entry FROM metadata) AS entry) first_entry
    ), legacy AS (
      SELECT *, clearance IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(history) AS events(event)
        WHERE event->>'type' = 'clearance'
          AND event->'fingerprint' IS NOT DISTINCT FROM clearance->'fingerprint'
          AND event->'reviewedBy' IS NOT DISTINCT FROM clearance->'reviewedBy'
          AND event->'reviewedAt' IS NOT DISTINCT FROM clearance->'reviewedAt'
      ) AS append_clearance FROM stored
    ), bounds AS (
      SELECT *, jsonb_array_length(history) AS stored_count,
        jsonb_array_length(history) + append_clearance::int AS total FROM legacy
    ), page_end AS (
      SELECT *, least(coalesce(${before ?? null}::bigint, total), total)::int AS finish FROM bounds
    ), page_start AS (
      SELECT *, greatest(0, finish - 20) AS start FROM page_end
    )
    SELECT jsonb_build_object(
      'historyTotal', total, 'nextBefore', nullif(start, 0),
      'history', (SELECT coalesce(jsonb_agg(
        CASE WHEN idx < stored_count THEN history->idx
          ELSE jsonb_build_object('type', 'clearance') || clearance END ORDER BY idx),
        '[]'::jsonb) FROM generate_series(start, finish - 1) AS offsets(idx))
    ) FROM page_start
  )`;
}