'use client';

import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  confirmMessage?: string;
  variant?: 'primary' | 'quiet' | 'danger';
};

/**
 * Submit button for the control panel. It adds two things a plain
 * `<button type="submit">` did not do: it says that the write is in flight, and
 * it asks before a delete removes the row for good.
 *
 * A server action form has no client state to hang a confirmation on, so the
 * click is intercepted here. Two details matter. The default action is cancelled
 * before the dialog is even answered, otherwise declining still submits. And
 * the confirmed submit goes back through `requestSubmit`, which fires a submit
 * event on the form rather than a second click on this button, so the
 * interception cannot loop.
 */
export function SubmitButton({
  children,
  pendingLabel,
  confirmMessage,
  variant = 'primary',
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={variant === 'primary' ? 'btn' : `btn btn--${variant}`}
      data-pending={pending ? 'true' : undefined}
      onClick={(event) => {
        if (pending || !confirmMessage) {
          return;
        }

        event.preventDefault();

        if (!window.confirm(confirmMessage)) {
          return;
        }

        event.currentTarget.form?.requestSubmit(event.currentTarget);
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
