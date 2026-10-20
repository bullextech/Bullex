import { readFile } from "node:fs/promises";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import { fileURLToPath } from "node:url";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

// Deliberately include variants/selectors that exercise all three parser parents.
export const markup = `
<main class="p-6 md:p-8 bg-background text-foreground">
  <article class="prose prose-sm md:prose-lg dark:prose-invert prose-headings:font-bold prose-a:text-primary">
    <h1>Trade document review</h1><p>A paragraph with <a href="#">linked terms</a>,
    <strong>emphasis</strong> and <code>FOB</code>.</p>
    <h2>Delivery terms</h2><ul><li>First shipment</li><li>Second shipment</li></ul>
    <blockquote><p>Confirm the agreed specifications.</p></blockquote>
    <table><thead><tr><th>Product</th><th>Quantity</th></tr></thead>
    <tbody><tr><td>Commodity</td><td>1,000 MT</td></tr></tbody></table>
    <pre><code>Reference: DEMO-001</code></pre><hr>
    <div class="not-prose"><button class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 disabled:opacity-50">Review terms</button></div>
  </article>
  <div class="group mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 [&>span]:font-semibold">
    <span class="group-hover:text-primary">Responsive utility</span>
    <span class="data-[state=open]:bg-accent aria-selected:text-primary" data-state="open" aria-selected="true">State variants</span>
  </div>
  <div class="fixture-card mt-6"><p class="label">Nested selector</p><a href="#">Nested link</a><span class="child">Nested child</span></div>
  <div class="fixture-peer"><span class="child">Sibling selector</span></div>
  <div class="space-x-2"><span>One</span><span>Two</span></div>
  <input class="peer border border-input rounded-md placeholder:text-muted-foreground" placeholder="Reference">
  <span class="peer-focus:text-primary">Peer variant</span>
  <div class="w-[calc(100%-2rem)] bg-primary/10 supports-[display:grid]:grid">Arbitrary values</div>
</main>`;

export const nestedInput = `
.fixture-card, [data-kind="trade,review"] {
  @apply rounded-md border p-4;
  & > .label, &:is(:hover, :focus-within) a { @apply text-primary; }
  .child & { color: navy; }
  & + .fixture-peer > .child { font-weight: 700; }
  @media (min-width: 768px) {
    & > .label { font-size: 18px; }
  }
}
`;

export async function compileCssFixtures() {
  const source = await readFile(new URL("../client/src/index.css", import.meta.url), "utf8");
  const candidates = new Scanner({}).scanFiles([{ content: markup, extension: "html" }]);
  const options = {
    base: fileURLToPath(new URL("../client/src/", import.meta.url)),
    onDependency() {},
  };
  // Tailwind 4 resolves @config/imports itself; Lightning CSS handles nesting.
  // Do not import the removed v3 PostCSS/nesting/loadConfig entry points.
  const appCompiler = await compile(source, options);
  const nestedCompiler = await compile(`${source}\n${nestedInput}`, options);
  const processCss = (css: string) => postcss([autoprefixer()])
    .process(optimize(css, { minify: false }).code, { from: undefined });
  const app = await processCss(appCompiler.build(candidates));
  const nested = await processCss(nestedCompiler.build(candidates));
  return { app, nested };
}
