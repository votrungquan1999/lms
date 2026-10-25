// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  importAiQuestionsAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/admin/courses/course-1/tests/test-1/import-ai",
  unstable_rethrow: vi.fn(),
}));

const signOut = vi.fn();
vi.mock("src/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => signOut(...args) },
}));

import { AdminSidebar } from "src/app/admin/(dashboard)/admin-sidebar";
import { LeaveGuardProvider } from "src/app/admin/(dashboard)/leave-guard.state";
import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

const nextRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeDocxFile(): File {
  return new File(["dummy content"], "questions.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function renderShell() {
  vi.mocked(extractDocx).mockResolvedValue({
    text: "1. Explain photosynthesis.",
    pictures: [],
  });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: "Extracted 1 question(s)",
    questions: [
      { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
    ],
  });
  // Vitest's `next/link` is the pages-router Link; it only handles clicks inside this context.
  return render(
    <RouterContext.Provider value={nextRouter as never}>
      <TooltipProvider>
        <LeaveGuardProvider>
          <SidebarProvider>
            <AdminSidebar email="admin@test" isOwner />
            <ImportAiProvider>
              <ImportAiFilePicker />
              <QuestionPreviewList
                testId="test-1"
                courseId="course-1"
                existingQuestionCount={0}
                answeredStudentCount={0}
              />
            </ImportAiProvider>
          </SidebarProvider>
        </LeaveGuardProvider>
      </TooltipProvider>
    </RouterContext.Provider>,
  );
}

async function renderWithListOnScreen() {
  const user = userEvent.setup();
  renderShell();
  await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
  expect(await screen.findByText("Q1")).toBeInTheDocument();
  return user;
}

describe("Feature: AI document import — leaving through the admin layout with work on screen asks first", () => {
  it("opens the leave dialog instead of following a sidebar link", async () => {
    const user = await renderWithListOnScreen();

    await user.click(screen.getByRole("link", { name: /courses/i }));

    expect(
      await screen.findByRole("alertdialog", { name: /leave this page/i }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(nextRouter.push).not.toHaveBeenCalled();
  });

  it("Stay closes the dialog and keeps the list", async () => {
    const user = await renderWithListOnScreen();
    await user.click(screen.getByRole("link", { name: /courses/i }));

    await user.click(await screen.findByRole("button", { name: "Stay" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Leave goes to the link's page", async () => {
    const user = await renderWithListOnScreen();
    await user.click(screen.getByRole("link", { name: /courses/i }));

    await user.click(await screen.findByRole("button", { name: "Leave" }));

    expect(push).toHaveBeenCalledWith("/admin/courses");
    expect(nextRouter.push).not.toHaveBeenCalled();
  });

  it("asks before Sign Out and signs out only after Leave", async () => {
    const user = await renderWithListOnScreen();

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(
      await screen.findByRole("alertdialog", { name: /leave this page/i }),
    ).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("guards the User Roles link too", async () => {
    const user = await renderWithListOnScreen();

    await user.click(screen.getByRole("link", { name: /user roles/i }));

    expect(
      await screen.findByRole("alertdialog", { name: /leave this page/i }),
    ).toBeInTheDocument();
  });

  it("follows a sidebar link at once when nothing is on screen", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("link", { name: /courses/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(nextRouter.push).toHaveBeenCalled();
  });

  it("says a document still being read is not stopped, only its result thrown away", async () => {
    const user = userEvent.setup();
    renderShell();
    vi.mocked(parseQuestionsAction).mockReturnValueOnce(new Promise(() => {}));
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByRole("status");

    await user.click(screen.getByRole("link", { name: /courses/i }));

    const dialog = await screen.findByRole("alertdialog", {
      name: /leave this page/i,
    });
    expect(dialog).toHaveTextContent(
      "A document still being read is not stopped; its result is thrown away.",
    );
    expect(dialog).not.toHaveTextContent(/stops any document/i);
  });

  it("says a running import carries on in the background when the teacher leaves", async () => {
    const user = await renderWithListOnScreen();
    vi.mocked(importAiQuestionsAction).mockReturnValueOnce(
      new Promise(() => {}),
    );
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await user.click(screen.getByRole("link", { name: /courses/i }));

    const dialog = await screen.findByRole("alertdialog", {
      name: /leave this page/i,
    });
    expect(dialog).toHaveTextContent(
      "Questions are being imported. Leaving won't stop the import; it will finish in the background.",
    );
  });

  it("does not send the teacher to the test page when an import finishes after they left", async () => {
    const user = userEvent.setup();
    const view = renderShell();
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    let finish!: (result: { success: true; message: string }) => void;
    vi.mocked(importAiQuestionsAction).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    view.unmount();

    await act(async () => finish({ success: true, message: "Imported 1" }));

    expect(push).not.toHaveBeenCalled();
  });
});
