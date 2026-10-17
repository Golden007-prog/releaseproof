/**
 * A failure of the tool or its environment (network, registry, Docker…), as opposed to a
 * verdict about the package. The CLI maps it to exit code 2.
 */
export class ToolError extends Error {
  override readonly name = "ToolError";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
