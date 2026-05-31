import type { ReactNode } from "react";

/**
 * Consistent page header for student pages: optional breadcrumb, a title, an
 * optional description, and an optional trailing slot (e.g. summary metrics).
 * @param breadcrumb - Optional breadcrumb element rendered above the title.
 * @param title - The page title.
 * @param description - Optional supporting description below the title.
 * @param children - Optional content rendered below the description.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  children,
}: {
  breadcrumb?: ReactNode;
  title: string;
  description?: string | null;
  children?: ReactNode;
}) {
  return (
    <header className="w-full space-y-3">
      {breadcrumb}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </header>
  );
}
