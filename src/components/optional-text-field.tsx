import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";

interface OptionalTextFieldProps {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  rows?: number;
}

/**
 * A labelled, optional multi-line form field: "<label> (optional)" + Textarea.
 * Extracted because this exact shape recurs across the question authoring forms
 * (MC explanation, free-text model answer, free-text explanation, ×2 forms).
 */
export function OptionalTextField({
  id,
  name,
  label,
  placeholder,
  rows = 3,
}: OptionalTextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}{" "}
        <span className="text-xs text-muted-foreground">(optional)</span>
      </Label>
      <Textarea id={id} name={name} placeholder={placeholder} rows={rows} />
    </div>
  );
}
