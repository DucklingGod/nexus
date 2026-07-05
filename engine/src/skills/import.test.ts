import { describe, it, expect, vi, afterEach } from "vitest";
import { searchSkillRepos } from "./import.ts";

afterEach(() => vi.restoreAllMocks());

describe("searchSkillRepos", () => {
  it("queries the agent-skills topic with the keyword and maps repo fields", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      capturedUrl = url;
      return {
        json: async () => ({
          items: [
            { full_name: "acme/pdf-skills", description: "PDF tools", stargazers_count: 42, html_url: "https://github.com/acme/pdf-skills" },
          ],
        }),
      };
    }));
    const { repos } = await searchSkillRepos("pdf");
    expect(decodeURIComponent(capturedUrl)).toContain("topic:agent-skills");
    expect(decodeURIComponent(capturedUrl)).toContain("pdf");
    expect(repos).toEqual([
      { fullName: "acme/pdf-skills", description: "PDF tools", stars: 42, url: "https://github.com/acme/pdf-skills" },
    ]);
  });

  it("defaults to the topic when no query is given", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      capturedUrl = url;
      return { json: async () => ({ items: [] }) };
    }));
    await searchSkillRepos();
    expect(decodeURIComponent(capturedUrl)).toContain("topic:agent-skills");
  });

  it("throws a helpful error when GitHub returns no items (rate-limited)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ message: "API rate limit exceeded" }) })));
    await expect(searchSkillRepos("x")).rejects.toThrow(/rate limit/i);
  });
});
