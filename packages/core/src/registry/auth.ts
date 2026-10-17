import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { normalizeRegistry } from "./client.js";

/** The key npm uses for per-registry config, e.g. `//registry.npmjs.org/`. */
export function registryKey(registry: string | undefined): string {
  const url = new URL(normalizeRegistry(registry));
  return `//${url.host}${url.pathname}`;
}

function unquote(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'") && value.endsWith(first) && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Finds the `//host/path:_authToken=…` line for the registry in .npmrc text. `${VAR}` is
 * expanded from the environment, as npm does. An exact registry path wins over the host root.
 */
export function parseNpmrcToken(
  contents: string,
  registry: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const exactKey = `${registryKey(registry)}:_authToken`;
  const rootKey = `//${new URL(normalizeRegistry(registry)).host}/:_authToken`;
  let exact: string | undefined;
  let root: string | undefined;
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key !== exactKey && key !== rootKey) {
      continue;
    }
    const value = unquote(line.slice(eq + 1).trim()).replace(
      /\$\{([^}]+)\}/g,
      (_, name: string) => env[name] ?? "",
    );
    if (value === "") {
      continue;
    }
    if (key === exactKey) {
      exact = value;
    } else {
      root = value;
    }
  }
  return exact ?? root;
}

export interface ResolveTokenOptions {
  /** A token given explicitly (CLI flag). Always wins. */
  explicit?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  /** .npmrc files to consult, first match wins. Defaults to project then user config. */
  npmrcPaths?: string[] | undefined;
  /** Injectable file reader, for tests. Returns undefined when the file cannot be read. */
  readFile?: ((file: string) => string | undefined) | undefined;
}

export function defaultNpmrcPaths(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): string[] {
  return [path.join(cwd, ".npmrc"), env.NPM_CONFIG_USERCONFIG ?? path.join(homedir(), ".npmrc")];
}

function readFileOrUndefined(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Resolves the registry token in this order: explicit value, `NPM_TOKEN`, `NODE_AUTH_TOKEN`
 * (what actions/setup-node writes), then `.npmrc` files. Returns undefined when there is none.
 */
export function resolveToken(
  registry: string | undefined,
  options: ResolveTokenOptions = {},
): string | undefined {
  if (options.explicit) {
    return options.explicit;
  }
  const env = options.env ?? process.env;
  if (env.NPM_TOKEN) {
    return env.NPM_TOKEN;
  }
  if (env.NODE_AUTH_TOKEN) {
    return env.NODE_AUTH_TOKEN;
  }
  const read = options.readFile ?? readFileOrUndefined;
  for (const file of options.npmrcPaths ?? defaultNpmrcPaths(env)) {
    const contents = read(file);
    if (contents === undefined) {
      continue;
    }
    const token = parseNpmrcToken(contents, registry, env);
    if (token) {
      return token;
    }
  }
  return undefined;
}
