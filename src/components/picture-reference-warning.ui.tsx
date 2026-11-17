interface PictureReferenceWarningProps {
  /** The warning, or null when every reference resolves. */
  message: string | null;
}

/**
 * Tells the teacher a text names a picture they removed; never blocks saving.
 * @param props - The warning message.
 * @returns The warning line, or null.
 */
export function PictureReferenceWarning({
  message,
}: PictureReferenceWarningProps): React.ReactNode {
  if (!message) return null;
  return <output className="block text-sm text-amber-600">{message}</output>;
}
