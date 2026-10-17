import { describe, expect, it } from "vitest";
import { ExitCode } from "./index.js";

describe("ExitCode", () => {
  it("uses 0 only for a clean match", () => {
    expect(ExitCode).toEqual({ Match: 0, Differs: 1, ToolError: 2 });
  });
});
