import { defineConfig } from "tsup";

// A JavaScript action ships with no node_modules: everything is bundled into one file.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  clean: true,
  noExternal: [/.*/],
  banner: {
    // Bundled CommonJS dependencies may call require() at runtime.
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
