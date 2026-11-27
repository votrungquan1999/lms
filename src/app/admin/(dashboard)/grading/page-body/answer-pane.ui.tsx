import type { ReactNode } from "react";
import { pluralize } from "src/lib/pluralize";

/** Lines in a text; a trailing newline ends the last line instead of adding one. */
function countLines(text: string): number {
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.length - 1 : lines.length;
}

/** A written answer with its line count; `children` sit under it. */
export function FreeTextAnswerBlock({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  const lines = countLines(text);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Student Answer ·{" "}
        <span data-testid="answer-line-count">
          {lines} {pluralize(lines, "line")}
        </span>
      </p>
      <pre className="whitespace-pre-wrap wrap-anywhere rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
        {text}
      </pre>
      {children}
    </div>
  );
}

/** A photo answer under its label. */
export function PhotoAnswerBlock({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Student Answer:
      </p>
      {children}
    </div>
  );
}

/** The folded model answer, saying whether students can see it yet. */
export function ModelAnswerFold({
  text,
  correctAnswersVisible,
}: {
  text: string;
  correctAnswersVisible: boolean;
}) {
  return (
    <details data-testid="model-answer" className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {correctAnswersVisible
          ? "Model answer · students can see it"
          : "Model answer · students see it once correct answers are shown"}
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-sm">{text}</p>
    </details>
  );
}
