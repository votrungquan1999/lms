import { type SubmitEventHandler, startTransition } from "react";

/**
 * Wraps a useActionState action so a submit skips React 19's automatic form
 * reset, which clears uncontrolled fields once the action settles — even when
 * it returns an error. Pass the result to onSubmit and keep
 * action={formAction} on the same <form>: that is what keeps a submit made
 * before hydration out of the URL (no password ever lands in the address bar).
 * @param action - The useActionState action to call with the form's data.
 */
export function submitWithoutReset(
  action: (formData: FormData) => void,
): SubmitEventHandler<HTMLFormElement> {
  return (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // A transition is what makes useActionState report isPending.
    startTransition(() => action(formData));
  };
}
