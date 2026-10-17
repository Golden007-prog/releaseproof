#!/usr/bin/env node
import { ExitCode } from "@releaseproof/core";
import { createProgram } from "./program.js";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = ExitCode.ToolError;
}
