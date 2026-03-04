import { describe, test, expect } from "bun:test";
import { computeReadingTime, loadEbookContent, resolveAuthors } from "../content-utils.js";
import type { AuthorRef } from "../content-utils.js";
import { join, dirname } from "path";

const PROJECT_ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

// ── computeReadingTime ───────────────────────────────────────────────────────

describe("computeReadingTime", () => {
  test("returns 0 for non-existent file", () => {
    expect(computeReadingTime("nonexistent.qmd")).toBe(0);
  });

  test("calculates reading time for intro chapter", () => {
    const path = join(PROJECT_ROOT, "books/finops-playbook/chapters/01-intro.qmd");
    const time = computeReadingTime(path);
    expect(time).toBeGreaterThan(0);
  });

  test("reading time is reasonable (1-60 minutes)", () => {
    const path = join(PROJECT_ROOT, "books/finops-playbook/chapters/01-intro.qmd");
    const time = computeReadingTime(path);
    expect(time).toBeGreaterThanOrEqual(1);
    expect(time).toBeLessThanOrEqual(60);
  });

  test("longer chapters have higher reading time", () => {
    const ch01 = computeReadingTime(
      join(PROJECT_ROOT, "books/finops-playbook/chapters/01-intro.qmd")
    );
    const ch05 = computeReadingTime(
      join(PROJECT_ROOT, "books/finops-playbook/chapters/05-optimization-strategies.qmd")
    );
    // Chapter 05 (SOTA transformed, ~2000 words) should be longer than ch01
    expect(ch05).toBeGreaterThanOrEqual(ch01);
  });
});

// ── loadEbookContent ─────────────────────────────────────────────────────────

describe("loadEbookContent", () => {
  test("returns null for nonexistent slug", () => {
    const result = loadEbookContent(PROJECT_ROOT, "nonexistent-book");
    expect(result).toBeNull();
  });

  test("loads finops-playbook with correct slug", () => {
    const content = loadEbookContent(PROJECT_ROOT, "finops-playbook");
    expect(content).not.toBeNull();
    expect(content!.meta.slug).toBe("finops-playbook");
    expect(content!.meta.title).toBe("The FinOps Playbook");
  });

  test("finops-playbook has 8 chapters", () => {
    const content = loadEbookContent(PROJECT_ROOT, "finops-playbook");
    expect(content!.chapters).toHaveLength(8);
  });

  test("chapters have expected structure", () => {
    const content = loadEbookContent(PROJECT_ROOT, "finops-playbook");
    const ch = content!.chapters![0];
    expect(ch.id).toBeDefined();
    expect(ch.title).toBeDefined();
    expect(ch.difficulty).toBeDefined();
  });

  test("loads k8s-cost-guide with correct slug", () => {
    const content = loadEbookContent(PROJECT_ROOT, "k8s-cost-guide");
    expect(content).not.toBeNull();
    expect(content!.meta.slug).toBe("k8s-cost-guide");
    expect(content!.chapters).toHaveLength(3);
  });

  test("chapters have prerequisites cross-references", () => {
    const content = loadEbookContent(PROJECT_ROOT, "k8s-cost-guide");
    const ch03 = content!.chapters!.find((c) => c.id === "03-kubernetes-cost-optimization-s");
    expect(ch03!.prerequisites).toContain("01-why-kubernetes-cost-optimizati");
    expect(ch03!.prerequisites).toContain("02-understanding-the-kubernetes-c");
  });
});

// ── resolveAuthors ───────────────────────────────────────────────────────────

describe("resolveAuthors", () => {
  const authors: AuthorRef[] = [
    { id: "alice", name: "Alice Smith", title: "Engineer" },
    { id: "bob", name: "Bob Jones", title: "Designer" },
    { id: "charlie", name: "Charlie Lee", title: "PM" },
  ];

  test("resolves matching author IDs", () => {
    const result = resolveAuthors(["alice", "charlie"], authors);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("alice");
    expect(result[1].id).toBe("charlie");
  });

  test("returns empty array for no matching IDs", () => {
    const result = resolveAuthors(["nonexistent"], authors);
    expect(result).toHaveLength(0);
  });

  test("returns empty array for empty authorIds", () => {
    const result = resolveAuthors([], authors);
    expect(result).toHaveLength(0);
  });

  test("preserves order of requested IDs", () => {
    const result = resolveAuthors(["charlie", "alice"], authors);
    expect(result[0].id).toBe("charlie");
    expect(result[1].id).toBe("alice");
  });

  test("skips non-matching IDs silently", () => {
    const result = resolveAuthors(["alice", "nonexistent", "bob"], authors);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("alice");
    expect(result[1].id).toBe("bob");
  });
});
