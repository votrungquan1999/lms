import type { SetupServer } from "msw/node";
import { buildGradingPrompt } from "src/lib/ai/grading-prompt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startE2eAiMock } from "../e2e-ai-mock";

let server: SetupServer | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
  vi.unstubAllGlobals();
});

describe("e2e AI mock", () => {
  it("fails an AI provider request it has no answer for instead of letting it out", async () => {
    // Given a stand-in for the network the mock would fall through to
    const network = vi.fn(async () => new Response("reached the network"));
    vi.stubGlobal("fetch", network);
    server = startE2eAiMock();

    // When a provider request nobody mocked is sent
    const response = await fetch(
      "https://api.anthropic.com/v1/messages/count_tokens",
      { method: "POST" },
    );

    // Then it is answered with an error and never reaches the network
    expect(response.ok).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });

  it("lets requests to other hosts through untouched", async () => {
    // Given the same stand-in network
    const network = vi.fn(async () => new Response("reached the network"));
    vi.stubGlobal("fetch", network);
    server = startE2eAiMock();

    // When a non-AI request is sent
    const response = await fetch("https://telemetry.example.com/v1/traces");

    // Then it passes through
    expect(await response.text()).toBe("reached the network");
  });

  it("answers a grading prompt with one grade per question, echoing the teacher's regenerate note", async () => {
    // Given the mock and a regenerate prompt for two questions
    server = startE2eAiMock();
    const prompt = buildGradingPrompt(
      ["q-1", "q-2"].map((questionId) => ({
        questionId,
        questionContent: "Explain loops.",
        studentAnswer: "a loop repeats",
        answerId: `a-${questionId}`,
      })),
      { reason: "use a for loop", priorGrades: [] },
    );

    // When the grading call is sent
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    // Then each question gets a grade carrying the note
    const reply = (await response.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    const { grades } = JSON.parse(reply.candidates[0].content.parts[0].text);
    expect(grades.map((g: { questionId: string }) => g.questionId)).toEqual([
      "q-1",
      "q-2",
    ]);
    expect(grades[0].feedback).toContain("use a for loop");
  });
});
