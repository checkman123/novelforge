import { describe, expect, it } from "vitest";
import { findAdapter, getAdapter, listAdapters } from "@/core/adapters/registry";

describe("adapter registry", () => {
  it("routes ranobes URLs (any known host, with or without www) to the ranobes adapter", () => {
    for (const url of [
      "https://ranobes.top/shadow-slave-v741610-1205249.html",
      "https://www.ranobes.top/some-novel/12345.html",
      "https://ranobes.net/",
    ]) {
      expect(findAdapter(url)?.id).toBe("ranobes");
    }
  });

  it("does not match unsupported or malformed URLs", () => {
    expect(findAdapter("https://example.com/novel.html")).toBeUndefined();
    expect(findAdapter("https://notranobes.top/")).toBeUndefined();
    expect(findAdapter("not a url")).toBeUndefined();
  });

  it("exposes adapters by id", () => {
    expect(getAdapter("ranobes")?.label).toBe("Ranobes");
    expect(listAdapters().length).toBeGreaterThan(0);
  });
});
