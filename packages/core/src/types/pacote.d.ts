// pacote ships no type definitions. This declares only what releaseproof uses.
declare module "pacote" {
  namespace pacote {
    interface Options {
      registry?: string;
      fullMetadata?: boolean;
      integrity?: string;
      before?: Date | null;
      /** Per-registry config such as `//registry.npmjs.org/:_authToken`. */
      [key: string]: unknown;
    }

    interface Manifest {
      name: string;
      version: string;
      dist?: Record<string, unknown>;
      gitHead?: string;
      repository?: string | { type?: string; url?: string };
      [key: string]: unknown;
    }

    function manifest(spec: string, opts?: Options): Promise<Manifest>;
    function tarball(spec: string, opts?: Options): Promise<Buffer>;
  }

  export = pacote;
}
