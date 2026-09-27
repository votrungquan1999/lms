// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useActionState } from "react";
import { describe, expect, it, vi } from "vitest";
import { submitWithoutReset } from "../submit-without-reset";

/** A form wired exactly as the helper's callers wire theirs. */
function TitleForm({
  action,
}: {
  action: (formData: FormData) => Promise<string>;
}) {
  const [message, formAction, isPending] = useActionState<
    string | null,
    FormData
  >((_prev, formData) => action(formData), null);

  return (
    <form action={formAction} onSubmit={submitWithoutReset(formAction)}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      <button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}

describe("submitWithoutReset", () => {
  it("keeps what was typed once the action settles, and runs the action once with the form's data", async () => {
    // Given a form whose action refuses the submit.
    const user = userEvent.setup();
    const action = vi.fn(async (_formData: FormData) => "Refused");
    render(<TitleForm action={action} />);

    // When the user types and submits.
    await user.type(screen.getByLabelText("Title"), "Algebra");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    // Then the field was not reset — read right after the refusal, since
    // typing again would append to whatever a reset left behind.
    expect(screen.getByLabelText("Title")).toHaveValue("Algebra");
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0].get("title")).toBe("Algebra");
  });

  it("reports the submit as pending until the action settles", async () => {
    // Given an action that stays in flight until released.
    const user = userEvent.setup();
    let release: (message: string) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    render(<TitleForm action={action} />);

    // When the user submits.
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Then the button is disabled while it runs, so a second click can't
    // submit twice, and comes back once the action settles.
    expect(
      await screen.findByRole("button", { name: "Saving…" }),
    ).toBeDisabled();
    release("Saved");
    expect(await screen.findByRole("button", { name: "Save" })).toBeEnabled();
  });
});
