import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { compileCssFixtures } from "../../script/css-compat-fixture";

// Reviewed native v4 output: layer ordering, 48rem responsive breakpoint,
// grouped :is() nesting expansion, legacy HSL theme and typography selectors.
// These replace the retired v3 compiler hashes, not the visual parity checks.
const baseline = {
  app: "4fe8d76672811599594b988ce45db450d5a54e1145f73aa5752e35b6614c789d",
  nested: "0e8364c97ef1eb6d0d3e91fe9a4ae56f68f08ec705372130e314acaad3db9d03",
};

test("the current native compiler retains typography, variants, utilities and nested selectors", async () => {
  const { app, nested } = await compileCssFixtures();
  assert.deepEqual(app.warnings(), []);
  assert.deepEqual(nested.warnings(), []);
  for (const [name, output] of Object.entries({ app, nested })) {
    const digest = createHash("sha256").update(output.css.replace(/\r\n/g, "\n")).digest("hex");
    assert.equal(digest, baseline[name as keyof typeof baseline], `${name} CSS changed`);
  }
  assert.match(app.css, /\.prose\s/);
  assert.match(app.css, /not-prose/);
  assert.match(app.css, /group-hover/);
  assert.match(app.css, /peer-focus/);
  assert.match(app.css, /aria-selected/);
  assert.match(app.css, /data-\\\[state/);
  assert.match(app.css, /@media \(min-width: 48rem\)/);
  assert.match(nested.css, /:is\(\.fixture-card, \[data-kind="trade,review"\]\) > \.label/);
  assert.match(nested.css, /\[data-kind="trade,review"\]/);
  assert.match(nested.css, /:is\(:hover, :focus-within\)/);
  assert.match(nested.css, /padding: calc\(var\(--spacing\) \* 4\)/);
  assert.match(nested.css, /border-radius: \.375rem/);
  assert.match(nested.css, /color: hsl\(var\(--primary\) \/ 1\)/);
  assert.match(nested.css, /color: navy/);
  assert.match(nested.css, /font-weight: 700/);
  assert.match(nested.css, /font-size: 18px/);
  // The escaped ampersand in the literal "[&>span]" utility name must survive;
  // unexpanded nesting ampersands and @apply directives must not.
  assert.doesNotMatch(nested.css, /@apply|(?<!\\)&/);
});

test("the remaining JavaScript selector-parser consumer resolves the patched version", () => {
  const require = createRequire(`${process.cwd()}/package.json`);
  const consumers = [
    createRequire(require.resolve("@tailwindcss/typography")),
  ];
  for (const consumer of consumers) {
    assert.equal(consumer("postcss-selector-parser/package.json").version, "7.1.6");
  }
});
