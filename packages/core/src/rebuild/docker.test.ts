import { describe, expect, it } from "vitest";
import { type ContainerSpec, dockerRunArgs } from "./docker.js";

const spec: ContainerSpec = {
  name: "releaseproof-abc-build",
  image: "node:22-bookworm",
  volume: "releaseproof-abc",
  network: "none",
  env: { RP_COMMIT: "deadbeef", RP_REPOSITORY: "https://github.com/o/r" },
  argv: ["bash", "-c", "echo hi"],
  timeoutMs: 1000,
  memory: "4g",
  pidsLimit: 4096,
  user: "1000:1000",
  workdir: "/work",
};

describe("dockerRunArgs", () => {
  it("applies every hardening flag and mounts only the named volume", () => {
    const args = dockerRunArgs(spec);
    expect(args.slice(0, 2)).toEqual(["run", "--rm"]);
    for (const pair of [
      ["--user", "1000:1000"],
      ["--cap-drop", "ALL"],
      ["--security-opt", "no-new-privileges"],
      ["--pids-limit", "4096"],
      ["--memory", "4g"],
      ["--network", "none"],
      ["--workdir", "/work"],
      ["--volume", "releaseproof-abc:/work"],
      ["-e", "RP_COMMIT=deadbeef"],
      ["-e", "RP_REPOSITORY=https://github.com/o/r"],
    ]) {
      const found = args.some((arg, i) => arg === pair[0] && args[i + 1] === pair[1]);
      expect(found, pair.join(" ")).toBe(true);
    }
    // No bind mounts, no privileged flag, no host network.
    expect(args.filter((a) => a === "--volume" || a === "-v")).toHaveLength(1);
    expect(args.join(" ")).not.toMatch(/--privileged|host\.docker|--network host|:\/work:rw/);
    // The image comes right before the command.
    expect(args.slice(-4)).toEqual(["node:22-bookworm", "bash", "-c", "echo hi"]);
  });

  it("mounts the volume read-only when asked", () => {
    expect(dockerRunArgs({ ...spec, volumeReadOnly: true })).toContain("releaseproof-abc:/work:ro");
  });

  it("adds capabilities back only when a stage asks, after dropping all", () => {
    expect(dockerRunArgs(spec)).not.toContain("--cap-add");
    const args = dockerRunArgs({ ...spec, capAdd: ["CHOWN"] });
    const drop = args.indexOf("--cap-drop");
    expect(args.slice(drop, drop + 4)).toEqual(["--cap-drop", "ALL", "--cap-add", "CHOWN"]);
  });
});
