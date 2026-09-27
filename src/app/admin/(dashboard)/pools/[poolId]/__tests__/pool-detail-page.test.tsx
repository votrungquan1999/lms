// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PoolDetailPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: vi.fn(async () => ({ userId: "admin-1" })),
  })),
}));

describe("Feature: Pool detail page — question preview formatting", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("renders a pool question's content through the markdown renderer, not as raw source", async () => {
    const services = getTestServices();
    const pool = await services.questionPoolService.createPool({
      name: "Pool",
      description: "",
      createdBy: "admin-1",
    });
    await services.poolQuestionService.addPoolQuestion(pool.id, {
      title: "Q1",
      content: "This is **bold** text.",
      createdBy: "admin-1",
    });

    const ui = await PoolDetailPage({
      params: Promise.resolve({ poolId: pool.id }),
    });
    render(ui);

    // Bold renders as an element, not literal asterisks — scoped to the
    // rendered preview, since the edit panel below it legitimately keeps
    // the raw markdown source in its own (unrelated) textarea.
    const strongEl = screen.getByText("bold", { selector: "strong" });
    const preview = strongEl.closest(".prose");
    if (!preview) throw new Error("Expected a rendered markdown preview");
    expect(within(preview as HTMLElement).queryByText(/\*\*bold\*\*/)).toBe(
      null,
    );
  });
});
