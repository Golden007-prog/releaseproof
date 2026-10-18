import { defineConfig } from "tsup";

// A JavaScript action ships with no node_modules: everything is bundled into one file.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  noExternal: [/.*/],
  plugins: [
    {
      // esbuild labels every bundled file with a "// <path>" comment. pnpm shortens long
      // virtual-store directory names on Windows but not on Linux, so those comments made
      // the bundle differ by platform and CI flagged it as stale. The code itself is
      // identical; drop the comments so the bundle is reproducible everywhere.
      name: "strip-bundled-path-comments",
      renderChunk(code) {
        return { code: code.replace(/^\/\/ (?:\.\.\/)*node_modules\/.*\r?\n/gm, "") };
      },
    },
  ],
  banner: {
    // Bundled CommonJS dependencies may call require() at runtime.
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
