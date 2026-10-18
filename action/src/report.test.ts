import type { CheckReport } from "@releaseproof/core";
import { describe, expect, it } from "vitest";
import { fenceFor, ISSUE_BODY_LIMIT, issueTitle, renderMarkdown } from "./report.js";

function report(status: CheckReport["verdict"]["status"], exitCode: 0 | 1 | 2): CheckReport {
  return {
    package: {
      name: "x",
      version: "1.0.0",
      origin: "published",
      registry: "https://registry.npmjs.org/",
      sha512: "ab".repeat(32),
      files: 3,
    },
    provenance: {
      status: "missing",
      problems: [],
      warnings: [],
      mismatches: [],
      publishAttestation: { status: "missing" },
    },
    source: undefined,
    rebuild: undefined,
    diff: undefined,
    verdict: {
      status,
      exitCode,
      summary: `${status} summary`,
      reasons: [],
      findings:
        status === "matches-source"
          ? []
          : [{ id: "file-added", severity: "high", title: "t", detail: "d" }],
      counts: {
        critical: 0,
        high: status === "matches-source" ? 0 : 1,
        medium: 0,
        low: 0,
        info: 0,
      },
    },
    durationMs: 1,
  };
}

describe("fenceFor", () => {
  it("is always longer than any backtick run in the content", () => {
    expect(fenceFor("plain")).toBe("```");
    expect(fenceFor("has ``` inside")).toBe("````");
    expect(fenceFor("has ````` five")).toBe("``````");
  });
});

describe("renderMarkdown", () => {
  it("puts the whole text report inside a code block with the verdict heading", () => {
    const md = renderMarkdown(
      report("differs-from-source", 1),
      "report text\n<img src=x onerror=alert(1)>\n",
      {
        runUrl: "https://github.com/o/r/actions/runs/1",
        reportPath: "releaseproof-report.json",
      },
    );
    expect(
      md.startsWith(
        "## 🚨 DIFFERS FROM SOURCE — x@1.0.0\n\ndiffers-from-source summary\n\nFindings: 1 high\n\n```text\nreport text\n<img src=x onerror=alert(1)>\n\n```\n",
      ),
    ).toBe(true);
    expect(md).toContain("Workflow run: https://github.com/o/r/actions/runs/1");
    expect(md).toContain("Full JSON report: `releaseproof-report.json`");
  });

  it("widens the fence when the report contains backticks", () => {
    const md = renderMarkdown(report("matches-source", 0), "a ``` b");
    expect(md).toContain("````text\na ``` b\n````");
    expect(md).toContain("Findings: none");
  });

  it("truncates to the issue body limit and says so", () => {
    const huge = "x".repeat(ISSUE_BODY_LIMIT * 2);
    const md = renderMarkdown(report("could-not-verify", 2), huge);
    expect(md.length).toBeLessThanOrEqual(ISSUE_BODY_LIMIT);
    expect(md).toContain("… truncated; the JSON report has everything");
    expect(md.trimEnd().endsWith('"safe".')).toBe(true);
  });
});

describe("issueTitle", () => {
  it("names the package and the verdict", () => {
    expect(issueTitle(report("differs-from-source", 1))).toBe(
      "releaseproof: x@1.0.0 DIFFERS FROM SOURCE",
    );
    expect(issueTitle(report("could-not-verify", 2))).toBe(
      "releaseproof: x@1.0.0 COULD NOT VERIFY",
    );
  });
});
