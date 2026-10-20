import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mockupPreviewPlugin } from "../../artifacts/mockup-sandbox/mockupPreviewPlugin";

async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail("File watcher did not produce the expected result within 8s");
}

test("both lockfiles exclude the vulnerable brace/glob dependency chain", async () => {
  for (const file of ["package-lock.json", "artifacts/mockup-sandbox/package-lock.json"]) {
    const lock = JSON.parse(await readFile(file, "utf8"));
    for (const name of Object.keys(lock.packages)) {
      assert.ok(!/node_modules\/(braces|micromatch|fast-glob)(?:\/|$)/.test(name), `${file}: ${name}`);
    }
  }
});

test("mockup discovery and live add/edit/rename/delete work without glob parsers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-tooling-"));
  const directory = path.join(root, "src/components/mockups");
  const generated = path.join(root, "src/.generated/mockup-components.ts");
  await mkdir(path.join(directory, "nested"), { recursive: true });
  await mkdir(path.join(directory, "_private"), { recursive: true });
  await mkdir(path.join(directory, ".hidden"), { recursive: true });
  const source = "export const Preview = () => null;";
  for (const name of ["Zulu.tsx", "nested/Alpha.tsx", "_hidden.tsx", "_private/Skip.tsx", ".hidden/Skip.tsx", "helper.ts"]) {
    await writeFile(path.join(directory, name), source);
  }
  await symlink(directory, path.join(directory, "cycle"));
  const server = await createServer({
    configFile: false, root, logLevel: "silent",
    plugins: [mockupPreviewPlugin()],
    server: { middlewareMode: true, watch: { ignored: ["**/cycle/**"] } },
  });
  const content = () => readFile(generated, "utf8");
  try {
    const initial = await content();
    assert.match(initial, /components\/mockups\/Zulu\.tsx/);
    assert.match(initial, /components\/mockups\/nested\/Alpha\.tsx/);
    assert.ok(initial.indexOf("Zulu") < initial.indexOf("nested/Alpha"), "stable sorted imports");
    assert.doesNotMatch(initial, /_hidden|_private|\.hidden|helper\.ts|cycle/);
    // Let chokidar finish its initial crawl before testing new file events.
    await new Promise(resolve => setTimeout(resolve, 300));
    await writeFile(path.join(directory, "Added.tsx"), source);
    await waitFor(async () => (await content()).includes("Added.tsx"));
    await writeFile(path.join(directory, "Added.tsx"), source + "\n// edited");
    assert.match(await content(), /Added\.tsx/, "edits retain the same discovered import for Vite HMR");
    await rename(path.join(directory, "Added.tsx"), path.join(directory, "Renamed.tsx"));
    await waitFor(async () => {
      const text = await content();
      return text.includes("Renamed.tsx") && !text.includes("Added.tsx");
    });
    await rm(path.join(directory, "Renamed.tsx"));
    await waitFor(async () => !(await content()).includes("Renamed.tsx"));
    await writeFile(path.join(directory, "_Ignored.tsx"), source);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.doesNotMatch(await content(), /_Ignored/);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("empty sandbox directories generate a valid empty module", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "empty-mockups-"));
  const server = await createServer({
    configFile: false, root, logLevel: "silent",
    plugins: [mockupPreviewPlugin()], server: { middlewareMode: true },
  });
  try {
    const result = await readFile(path.join(root, "src/.generated/mockup-components.ts"), "utf8");
    assert.match(result, /export const modules: ModuleMap = \{\s*\};/);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("the main Tailwind pipeline discovers new classes and watches edits", async () => {
  const file = path.resolve(`client/src/tooling-watch-${process.pid}.tsx`);
  const added = path.resolve(`client/src/tooling-added-${process.pid}.tsx`);
  await writeFile(file, 'export const classes = "w-[717px]";');
  const server = await createServer({
    configFile: false, root: path.resolve("client"), logLevel: "silent",
    plugins: [tailwindcss()], server: { middlewareMode: true },
  });
  const css = async () => (await server.transformRequest("/src/index.css?direct"))!.code;
  try {
    const initial = await css();
    assert.match(initial, /717px/, "discover classes in source files");
    assert.match(initial, /\.bg-primary/);
    assert.match(initial, /#dcfce7/i, "keep existing status colors, not v4's replacement palette");
    assert.match(initial, /:not\(\[hidden\]\) ~ :not\(\[hidden\]\)/, "preserve signed-in form spacing");
    assert.match(initial, /translate: none !important/, "avoid double transforms on Radix dialogs");
    assert.doesNotMatch(initial, /@tailwind|@config|@source/, "all compiler directives are consumed");
    await new Promise(resolve => setTimeout(resolve, 300));
    await writeFile(file, 'export const classes = "w-[719px]";');
    await waitFor(async () => (await css()).includes("719px"));
    await writeFile(added, 'export const added = "h-[721px]";');
    await writeFile(file, `import "./${path.basename(added)}"; export const classes = "w-[719px]";`);
    await waitFor(async () => (await css()).includes("721px"));
  } finally {
    await rm(file, { force: true });
    await rm(added, { force: true });
    await server.close();
  }
});
