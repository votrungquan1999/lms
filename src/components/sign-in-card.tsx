import type { ReactNode } from "react";

/** Brand tile; drawn in CSS because no logo asset exists. */
function LogoTile({ className }: { className: string }) {
  return <div aria-hidden="true" className={`bg-primary ${className}`} />;
}

/** Full-page shell: header bar over a muted canvas holding the card. */
export function SignInShell({
  headerRight,
  children,
}: {
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted">
      <header className="flex h-16 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-3">
          <LogoTile className="size-8 rounded-lg" />
          <span className="font-bold">STEM Venture</span>
        </div>
        {headerRight}
      </header>
      <main className="flex justify-center px-4 py-10">{children}</main>
    </div>
  );
}

/** Centred card with logo tile, the page's single h1 and a subtitle. */
export function SignInCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="w-full max-w-[440px] rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      <div className="flex flex-col items-center text-center">
        <LogoTile className="size-11 rounded-xl" />
        <h1 className="mt-5 text-[26px] font-bold">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** "or" rule between the password form and the Google button. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Google "G" glyph (lucide has none). */
export function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.87 0 3.12.8 3.84 1.48l2.6-2.5A9.6 9.6 0 0 0 12 2.4a9.6 9.6 0 1 0 0 19.2c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.1-.15-1.12Z"
      />
    </svg>
  );
}
