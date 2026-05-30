---
name: doc-generator templates
description: How to add a new document type to the Bullex document generator (template + DOCX/PDF builders).
---

# Adding a document type to the Bullex doc generator

The doc generator does NOT use structured data for DOCX/PDF — each template produces a single natural-language **content string**, and the file builders re-parse that string with heuristics to infer layout.

**To add a new doc type, wire it in 3 places:**
- `server/documentTemplates.ts`: add a `templates[DOCTYPE]` generator returning the content string. `docType` is free-text, so no schema migration is needed; transient per-template form data can ride inside `productDetails` (e.g. a `tfrData` key/value map).
- `server/documentFileGenerator.ts`: add `isXxxContent` + `buildXxxDocx`/`buildXxxPdf`, then dispatch them in **all 4 points**: `generateDocx`, `generatePdf`, and the regenerate-with-signatures DOCX and PDF branches. Missing one means signed/regenerated output silently falls back to the generic builder.
- `client/src/pages/document-generator.tsx`: docTypes entry, form state, buildPayload, resetForm, and exclude from the generic-form guard.

**Content-string parsing heuristics (order-sensitive):** numbered lines `^\d+\.` → section headings; `Label: value` (label cap ~45 chars) → borderless key/value table; any line containing `|` → real table row (first two cols); `[X]`/`[ ]` → checkbox lines; trailing `:` → bold sub-label. Avoid free-text containing `|` or very long labels in content strings or they misclassify.

**Why / gotcha:** tsx watch sometimes serves a STALE template after editing `documentTemplates.ts` — symptom is generated DOCX/preview containing only the footer/disclaimer (empty content). If output is empty after a template edit, `restart_workflow` before debugging further.
