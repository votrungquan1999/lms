// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { StudentCardQuestion } from "../student-question-card.ui";
import { StudentViewList } from "../student-view-list.ui";

/** A photo question with no media, numbered as the card shows it. */
function photoQuestion(id: string, order: number): StudentCardQuestion {
  return {
    id,
    order,
    title: `Photo ${order}`,
    content: "Show your work.",
    type: "image_answer",
    options: [],
    media: [],
  };
}

const MB = 1024 * 1024;

/** Builds a File of the given type whose reported size is `bytes`. */
function fileOf(name: string, type: string, bytes = 10): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

describe("Feature: Student view photo picker follows the student's photo rules", () => {
  // applyAccept off so the browser's own file filter doesn't hide the rule under test
  const setup = () => userEvent.setup({ applyAccept: false });

  it("rejects a file that is not a png, jpeg or webp image", async () => {
    const user = setup();
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);

    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("scan.pdf", "application/pdf"),
    );

    expect(screen.getByText("Unsupported image type")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Selected photos" })).toBeNull();
  });

  it("rejects a photo over 10 MB", async () => {
    const user = setup();
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);

    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("huge.png", "image/png", 11 * MB),
    );

    expect(
      screen.getByText("Each photo must be 10 MB or smaller"),
    ).toBeVisible();
    expect(screen.queryByRole("list", { name: "Selected photos" })).toBeNull();
  });

  it("accepts a photo of exactly 10 MB", async () => {
    const user = setup();
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);

    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("limit.png", "image/png", 10 * MB),
    );

    expect(
      screen.queryByText("Each photo must be 10 MB or smaller"),
    ).toBeNull();
    expect(screen.getByRole("list", { name: "Selected photos" })).toBeVisible();
  });

  it("rejects a fourth photo and keeps the first three", async () => {
    const user = setup();
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);

    await user.upload(screen.getByLabelText("Your photos"), [
      fileOf("a.png", "image/png"),
      fileOf("b.png", "image/png"),
      fileOf("c.png", "image/png"),
    ]);
    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("d.png", "image/png"),
    );

    expect(screen.getByText("You can attach at most 3 photos")).toBeVisible();
    const list = within(screen.getByRole("list", { name: "Selected photos" }));
    expect(list.getAllByRole("listitem")).toHaveLength(3);
    expect(list.queryByText("d.png")).toBeNull();
  });

  it("clears the message once a valid photo is picked", async () => {
    const user = setup();
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);
    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("scan.pdf", "application/pdf"),
    );

    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("ok.png", "image/png"),
    );

    expect(screen.queryByText("Unsupported image type")).toBeNull();
    expect(screen.getByText("ok.png")).toBeVisible();
  });

  it("clears the message when a photo is removed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);
    await user.upload(screen.getByLabelText("Your photos"), [
      fileOf("a.png", "image/png"),
      fileOf("b.png", "image/png"),
      fileOf("c.png", "image/png"),
    ]);
    await user.upload(
      screen.getByLabelText("Your photos"),
      fileOf("d.png", "image/png"),
    );
    expect(screen.getByText("You can attach at most 3 photos")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove a.png" }));

    expect(screen.queryByText("You can attach at most 3 photos")).toBeNull();
  });
});

describe("Feature: several photo questions on one Student view screen", () => {
  it("gives each its own photo input and label", () => {
    render(
      <StudentViewList
        questions={[photoQuestion("q1", 1), photoQuestion("q2", 2)]}
      />,
    );

    const inputs = screen.getAllByLabelText("Your photos");
    expect(inputs).toHaveLength(2);
    expect(new Set(inputs.map((input) => input.id)).size).toBe(2);
  });

  it("keeps a photo picked on one question off the other", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(
      <StudentViewList
        questions={[photoQuestion("q1", 1), photoQuestion("q2", 2)]}
      />,
    );

    await user.upload(
      screen.getAllByLabelText("Your photos")[1],
      fileOf("second.png", "image/png"),
    );

    expect(
      screen.getAllByRole("list", { name: "Selected photos" }),
    ).toHaveLength(1);
    expect(screen.getByText("second.png")).toBeVisible();
  });
});

describe("Feature: Student view width", () => {
  it("reproduces the student page's box, so content wraps at the same width at any window size", () => {
    render(<StudentViewList questions={[photoQuestion("q1", 1)]} />);

    // jsdom has no layout; the classes are the observable
    const region = screen.getByRole("region", { name: "Student view" });
    // Cancels the caller's own p-6, so the box below is the student page's
    expect(region).toHaveClass("-mx-6");
    expect(region.firstElementChild).toHaveClass(
      "mx-auto",
      "w-full",
      "max-w-5xl",
      "p-6",
    );
  });
});
