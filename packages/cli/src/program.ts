import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };

export function createProgram(): Command {
  return new Command()
    .name("releaseproof")
    .description("Verify that an npm release matches its source before you approve it.")
    .version(pkg.version, "-v, --version");
}
