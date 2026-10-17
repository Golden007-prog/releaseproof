import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  // core is a private, source-only workspace package: bundle it into the CLI.
  noExternal: ["@releaseproof/core"],
});
