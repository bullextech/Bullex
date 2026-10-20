# Dependency audit disposition — 2026-10-19

## Clean-checkout install verification

Run the repeatable check from a Git checkout (no working install required):

```sh
node scripts/check-clean-install.mjs
```

It copies Git-listed build inputs (including non-ignored new source files) into
two separate sibling directories under the OS temporary directory. It does not
copy `node_modules`, build output, generated preview modules, or generated
documents. Each tree gets its own initially empty npm cache and runs:

1. Create each empty cache and confirm `npm config get cache` selects that exact
   directory, then `npm ci --include=dev --include=optional`, with the existing registry/firewall
   settings and normal lifecycle scripts. No registry replacement, `--force`,
   `--ignore-scripts`, `--legacy-peer-deps`, or WASI workaround is used.
2. `scripts/check-native-css.cjs` against that tree. It requires the host-specific
   Oxide and Lightning CSS `.node` binaries, checks their versions against their
   parents and the lock, and actually scans HTML and transforms CSS. The normal
   loaders are exercised too. Fresh-process negative checks also force WASI and
   temporarily remove each binary in turn, restoring it in `finally`. Each must
   exit nonzero. The coordinator never loads the binaries itself, so Windows DLL
   locking cannot prevent these probes. A missing native binding, foreign install
   resolution, custom binding path, forced WASI, or compiler exception fails.
3. `npm ls --all` and `npm audit --audit-level=low`. Any nonzero exit fails;
   audit findings are not suppressed or converted into a passing result.
4. `npm run build` in each tree, then root `npm run check` / sandbox
   `npm run typecheck`. Sandbox build uses `PORT=5001` and
   `BASE_PATH=/__mockup/`; it generates the preview import map before typecheck.
   Running sandbox typecheck alone before the first build/dev start fails
   because that generated module does not exist yet.
5. Byte-for-byte comparison of each copied manifest and lock against its
   pre-install content. Successful temporary installs/caches/logs are removed;
   failure retains them and prints their location for diagnosis.

The root and sandbox are intentionally not parent/child installs: a missing
sandbox dependency cannot be supplied accidentally by root `node_modules`.
Existing working installs, manifests, locks, and build outputs are untouched.
The script clears `NODE_PATH`/`NODE_OPTIONS` for child processes but retains npm's
registry/security configuration. Requires Git, Node and npm on PATH.

### Platform evidence and developer checks

| Host / native suffix | Status |
| --- | --- |
| Linux x64 glibc (`linux-x64-gnu`), deployment architecture | Both fresh installs and builds verified on Node 20.20.0, npm 10.8.2, glibc 2.40 |
| macOS Apple Silicon (`darwin-arm64`) | Intended native-machine check; not executed here |
| macOS Intel (`darwin-x64`) | Intended native-machine check; not executed here |
| Windows x64 (`win32-x64-msvc`) | Native run attempted 2026-10-20; blocked during package installation; native execution/builds/typechecks are **not verified** |
| Linux arm64 / musl, Windows arm64 | Lock entries exist; not deployment targets or verified developer platforms in this check |

For the Linux check, both trees selected and executed
`@tailwindcss/oxide-linux-x64-gnu@4.3.3` and
`lightningcss-linux-x64-gnu@1.32.0`. Root installed 600 packages; sandbox installed
241 packages. Both complete dependency trees were valid, and both fresh npm
audits reported **zero vulnerabilities**. Both production builds and both type
checks passed. The existing root CJS `import.meta` warning remains; it was not
an install/native compiler failure. Working manifests and locks also retained
their original SHA-256 checksums. Negative checks in an isolated install
confirmed that a forced WASI setting and removing either native binary each
produce a nonzero failure rather than being silently skipped.

Completion validation exposed a legacy test helper importing Tailwind 3's removed
`tailwindcss/nesting` and `tailwindcss/loadConfig` entry points. The helper now
uses the installed native Tailwind compiler and Lightning CSS nesting optimizer,
with typography, variant, nesting, theme-declaration and parser-version checks.
Reviewed v4 output hashes replace the obsolete v3 compiler hashes; no production
stylesheet, theme, dependency version or lock was changed for this correction.

On each intended developer host, use a native Node release supported by Vite
(Node 20.19+ or 22.12+; this verification used Node 20.20.0/npm 10.8.2), then run
the same command above from a clean checkout. Require both installs, native
execution checks, audits, builds, and typechecks to pass before claiming that
platform is verified. Use the native architecture of Node, not Rosetta or an
emulated process when checking Apple Silicon. `npm --os` / `--cpu` can inspect
package selection but cannot prove that a foreign native binary executes.
Linux glibc success does not establish musl or a minimum glibc version.
Build tools are dev dependencies: do not omit them or optional dependencies
before building a deployment. Do not delete/regenerate locks to conceal an
install failure.

### Native Windows attempt — 2026-10-20 (blocked, not a pass)

The separate GitHub branch `verification/windows-clean-install` runs
`.github/workflows/windows-clean-install.yml` on `windows-2022`, without merging
or deploying anything. Actions are pinned to commit hashes, checkout credentials
are not retained, job permissions are read-only, npm caches are not shared, and
failure transcripts/logs are uploaded with a 14-day retention period.

Real host/runtime evidence from
[the native Windows run](https://github.com/bullextech/Bullex/actions/runs/39406519652):

- Microsoft Windows Server 2022 Datacenter, version `10.0.20348`, 64-bit.
- GitHub runner image `win22`, image version `20261012.333.1`.
- Git `2.56.0.windows.2`, native x64 Node `20.20.0`, npm `10.8.2`.
- `node scripts/check-clean-install.mjs` reported `win32/x64`.
- `npm.cmd config get cache` selected the isolated root cache even with an
  inherited uppercase `NPM_CONFIG_CACHE`. The runner now replaces
  case-insensitive environment-name collisions before spawning Windows children.
- `npm.cmd ci --include=dev --include=optional` ran, but npm aborted with
  `npm error Exit handler never called!`. Its launcher reported exit zero;
  the following native check correctly stopped with `MODULE_NOT_FOUND` for
  `@tailwindcss/oxide`. This is an incomplete install, not successful native
  loading. No WASI fallback was accepted.

Both unchanged lockfiles contain resolved tarball URLs on
`package-firewall.replit.local` and `package-firewall.replit.internal`.
[The follow-up registry preflight](https://github.com/bullextech/Bullex/actions/runs/39406968426)
confirmed `ENOTFOUND` for **both** private hosts on that native Windows runner;
`registry.npmjs.org` resolved successfully. It failed before installing anything
and retained its evidence artifact. A public
GitHub-hosted Windows runner must have approved access to these hosts before the
locked installation can work. The workflow now checks DNS for **both HTTP and
HTTPS** registry URLs before installing, rather than rewriting private URLs,
changing registries, regenerating locks, or disabling the package firewall.
DNS success alone would not prove HTTP access or package-firewall enforcement.
An external GitHub audit is not evidence of Replit's network-level protections.

The test branch is a compilation snapshot of the current build sources,
manifests, locks, and imported assets. Unrelated uploaded documents, tutorial
assets, and large public runtime videos were deliberately not added to Git
history. It is not a deployment or a check of runtime media availability.
Windows Git checkout line-ending conversion changes text-file SHA-256 values
relative to a Linux checkout; preservation checks compare each tree against its
own pre-install bytes, not a different host's working-tree hashes.

**Still required:** an approved native Windows x64 runner that can resolve and
reach the locked registry hosts, followed by a complete successful run of both
installs, both native checks and negative probes, both dependency checks/audits,
both builds/typechecks, manifest comparisons, and successful cleanup. None of
those unexecuted Windows stages is claimed as passing.

The updated verifier did complete on Linux x64/glibc `2.40` with Node
`20.20.0`/npm `10.8.2`: both isolated caches, both native compilers, all six
negative probes, both dependency trees/audits (zero vulnerabilities), both
builds/typechecks, unchanged copied manifests/locks, and temporary cleanup passed.
The original working manifests and locks are unchanged.


## Build-tool crash-risk remediation

Rechecked the published advisory and npm registry before changing tooling:
braces **3.0.3**, micromatch **4.0.8** and fast-glob **3.3.3** are still the
latest releases; GHSA-vfj7-8cjw-p6xm still lists **no patched version**.
An unpublished upstream fix is not a suitable dependency pin.

The root app now uses Tailwind **4.3.3** with its maintained Vite plugin rather
than Tailwind 3's PostCSS scanner/chokidar 3 chain. The sandbox already used
Tailwind 4; its matching compiler/plugin were updated to the same patch release.
Sandbox discovery uses an iterative Node filesystem traversal, retaining sorted
nested `.tsx` imports, hidden/private-file exclusions, and the dedicated
chokidar 4 watcher. Symlinks are intentionally not traversed (including cycles);
both discovery and watching follow this policy. No current mockups use symlinks.

Compatibility styles preserve the existing palette, border radii, shadows,
blur scales, outlines, ring defaults, hover behavior, sibling spaces/dividers,
CSS-variable shorthand in Radix wrappers, and animation/transform composition.
In particular, the native v4 translate/rotate/scale properties must not compound
the legacy transform used by `tailwindcss-animate`. The source scan is explicitly
limited to the main client entry/source tree, not the nested artifact.
The chart indicator uses explicit `var()` syntax for its dynamic colors.

This migration uses Tailwind 4's documented browser floor: Safari 16.4+,
Chrome 111+, Firefox 128+. The sandbox already had that requirement. Older
browsers are not claimed to be supported by the migrated main app.

## Scope and fixes

Audited the root app and `artifacts/mockup-sandbox`, including both lockfiles.
No forced audit fixes, schema-code changes, or styling-framework migration were used.
The selector parser uses a tested, consumer-scoped cross-major override described below.

- Express 5.3.0 brings proxy-addr 2.0.8 and body-parser 2.3.0. Removed the
  existing global body-parser 1.x override, which forced Express 5 onto an older
  parser major. The proxy advisory requires a mapped IPv6 trust-subnet
  configuration; this app instead trusts one proxy hop. Patch applied regardless.
- Multer 2.4.0 addresses multipart field-name crashes, aborted disk-upload leaks,
  and asynchronous-filter size-limit bypass. The app uses memory storage and
  synchronous filters, but malicious field names are reachable.
- Both application upload configurations now bound numeric field-array indexes
  to 100 and nesting to 10. Multer's new array-index protection defaults to
  Infinity, so upgrading alone does not activate it. Existing file-size limits
  remain unchanged.
- Raised compatible transitive security floors for brace-expansion (2.1.7),
  ip-address (10.7.4), qs (6.16.1), Browserslist (4.29.3), source-map-js (1.2.2),
  and postcss-selector-parser (6.1.4). Updated sandbox Browserslist,
  baseline-browser-mapping and source-map-js too.

## Remaining findings

| Audit | Before | Initial remediation | After selector-parser fix |
| --- | --- | --- | --- |
| Root npm audit | 1 critical, 11 high, 4 moderate | 0 critical, 5 high, 4 moderate | 0 critical, 7 high, 0 moderate |
| Sandbox npm audit | 5 high, 1 moderate | 3 high | 3 high |
| Workspace dependency scanner | 1 critical, 13 high, 11 moderate, 2 low | 0 critical, 2 high, 1 moderate | 0 critical, 2 high, 0 moderate |

These tools count differently: npm also flags affected parent packages, whereas
the workspace scanner reports individual advisories/package versions across
lockfiles. The final workspace findings are:

- **High: braces 3.0.3**, once per lockfile
  ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)).
  No fixed release exists; latest braces, micromatch and fast-glob still carry
  the issue. Root usage is Tailwind 3 source scanning/file watching. Sandbox
  usage is discovery of local mockup source files via a fixed glob. No server
  request handler or browser application imports these pattern parsers.
  Do not pass user-controlled glob patterns to them. Removing the dependency
  requires a tested tooling migration or a maintained upstream fix, not a
  forced install or a severity suppression.

`npm audit --omit=dev` is **not clean**: it reports 6 high and 0 moderate
affected packages. Tailwind is retained by the production-listed
`tailwindcss-animate` peer dependency even though these tools are only used
for builds. This is an installation classification, not evidence of a
request-path import. The current root high findings all trace to braces; npm's
parent/peer attribution changed after the scoped overrides, not because a new
underlying advisory appeared. Separate work covers the tooling migration.


## Initial dependency remediation verification

- `npm run check`: passed.
- `npx tsx --test server/__tests__/dependency-security.test.ts`: six tests passed,
  covering proxy subnet spoofing, hostile query serialization, JSON/form parsing,
  normal uploads, file-size enforcement, and array-index limits.
- `npm run smoke:prod`: build and production CJS startup passed; health endpoint,
  homepage, 143 manifest file references and 843 chunk imports verified.
- `BASE_PATH=/__mockup/ npm --prefix artifacts/mockup-sandbox run build`: passed.
- Restarted main workflow and visually checked the public homepage. Signed-in
  screens were not visually tested.
- Static security scan: no findings. Privacy/dataflow scan could not complete
  because its output failed schema validation; no clean result is claimed.
- Existing CJS `import.meta` build warning remains; production smoke passes.
- Initial full-suite validation passed 533/534 tests; the sole failure was a
  pre-existing development setup gap: the two client-document lookup indexes
  already declared in `shared/schema.ts` were absent. Installed only those two
  indexes additively in development, without modifying schema source or touching
  production. The previously failing three-test file then passed.

Recheck both package trees and the workspace scanner after future changes.
## Selector-parser fix and compatibility evidence

[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
is resolved by **postcss-selector-parser 7.1.6**. Checked current parent releases:
Tailwind 3.4.19 still requires parser `^6.1.2`, and typography 0.5.20 still pins
`6.0.10`. Upgrading these parents alone cannot fix the advisory. Rather than
migrate the styling framework, the root manifest overrides the parser only
under `tailwindcss`, `postcss-nested`, and `@tailwindcss/typography`. All three
installed consumers resolve exactly 7.1.6; the lockfile contains no parser 6.x.
The sandbox uses Tailwind 4 and has no selector-parser dependency to override.
Neither Tailwind config nor the app's PostCSS pipeline was changed.

- `npx tsx --test server/__tests__/css-parser-compat.test.ts`: passed.
  `script/css-compat-fixture.ts` compiles the real application stylesheet and
  theme with fixed content exercising prose tables/lists/code/links,
  `not-prose`, responsive and dark typography, arbitrary selectors and values,
  group/peer/ARIA/data-state variants, and utilities. A second compilation
  exercises Tailwind's nesting adapter, `@apply`, comma lists, attribute values
  containing commas, `:is`, ancestor/sibling selectors, and nested media rules.
  Both generated outputs are byte-identical to their pre-upgrade parser 6.1.4
  baselines, protected by committed SHA-256 assertions. Tests also resolve the
  parser separately from each actual consumer to catch hoisted vulnerable copies.
- `npm run check`: passed.
- `npm run smoke:prod`: passed, including the root client/server build, CJS
  startup, health endpoint, homepage, 143 manifest files and 843 chunk imports.
  The complete production CSS is byte-identical before/after:
  `6b05e00648c338db6dc418e2a2a6ee8805606d7833392c7dbafc8f7861b3504a`.
- `BASE_PATH=/__mockup/ npm --prefix artifacts/mockup-sandbox run build`: passed.
- Before/after desktop screenshots of the representative fixture are identical
  (including image bytes); homepage screenshots preserve layout, branding,
  navigation and controls (live ticker values naturally differ). Signed-in UI
  was not visually verified. Local screenshots and audit output are in the
  ignored `generated-artifacts/selector-parser/` directory, not shipped assets.
- Root and sandbox npm audits and a fresh workspace dependency scan no longer
  report this selector-parser advisory. The workspace scan reports only the
  two known braces findings, one per lockfile.
- Restarted the main workflow and confirmed it serves successfully. Existing
  PostCSS `from`-option and CJS `import.meta` warnings remain unrelated to this
  advisory; neither prevented the builds or production smoke.

## Initial dependency remediation verification

- `npm run check`: passed.
- `npx tsx --test server/__tests__/dependency-security.test.ts`: six tests passed,
  covering proxy subnet spoofing, hostile query serialization, JSON/form parsing,
  normal uploads, file-size enforcement, and array-index limits.
- `npm run smoke:prod`: build and production CJS startup passed; health endpoint,
  homepage, 143 manifest file references and 843 chunk imports verified.
- `BASE_PATH=/__mockup/ npm --prefix artifacts/mockup-sandbox run build`: passed.
- Restarted main workflow and visually checked the public homepage. Signed-in
  screens were not visually tested.
- Static security scan: no findings. Privacy/dataflow scan could not complete
  because its output failed schema validation; no clean result is claimed.
- Existing CJS `import.meta` build warning remains; production smoke passes.
- Initial full-suite validation passed 533/534 tests; the sole failure was a
  pre-existing development setup gap: the two client-document lookup indexes
  already declared in `shared/schema.ts` were absent. Installed only those two
  indexes additively in development, without modifying schema source or touching
  production. The previously failing three-test file then passed.

Recheck both package trees and the workspace scanner after future changes.

### Verification after remediation

- Both lockfiles and installed trees contain **no braces, micromatch or
  fast-glob**. A regression test checks both lockfiles.
- Workspace dependency scan: **0 critical, 0 high, 1 moderate**; the sole
  remaining advisory is the separately scoped selector-parser finding below.
  Root npm audit counts **2 moderate** affected packages; sandbox npm audit
  reports **0 findings**. No audit suppression, source pin or forced unrelated
  major upgrade was used.
- `npm run check`, sandbox `typecheck`, both builds and `npm run smoke:prod`
  passed. The production CJS bundle booted and all 143 manifest references /
  843 chunk imports resolved. The existing server `import.meta` warning remains.
- `npx tsx --test server/__tests__/build-tooling.test.ts`: four tests passed:
  both dependency locks; nested/private/hidden discovery and live
  add/edit/rename/delete; empty directories; main Tailwind source discovery and
  edit/new-import watching. Watchers are closed when the Vite server closes.
- Captured the old generated stylesheet before migration and compared 1,472
  generated utility classes in Chromium in both themes, including classes from
  protected screens. Also compared representative dashboard/form/status-card/
  centered-dialog/gradient fixtures with the **production** stylesheet at 1280px
  and 402px in light/dark mode: identical layout measurements, mean channel
  pixel difference below 0.005/255, no channel differing by more than 3/255.
  Checked focus outlines/rings and hovered buttons as well.
- Restarted both development services and visually checked the homepage and
  sandbox. Full authenticated screens were **not** visually verified; their
  generated classes and representative shared controls were checked without
  bypassing authentication or accessing account data.
- Temporary browser comparison artifacts are excluded from Git and deployment.

The sections below record the **earlier audit baseline**, not current totals.
