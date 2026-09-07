import Link from "next/link";
import { joinRequestsHref } from "./href";
import type { JoinRequestFilter } from "./join-request-page.type";

interface PaginationControlsProps {
  filter: JoinRequestFilter;
  page: number;
  totalPages: number;
  total: number;
}

/**
 * Full paging controls for the join-request queue — real Previous/Next
 * navigation plus a total, never a truncating "showing first N" cap
 * (D56/R12). Hidden entirely on an empty tab; there's nothing to page.
 */
export function PaginationControls({
  filter,
  page,
  totalPages,
  total,
}: PaginationControlsProps) {
  if (total === 0) {
    return null;
  }

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <nav
      className="flex items-center justify-between gap-4"
      aria-label="Pagination"
    >
      {isFirstPage ? (
        <span className="text-sm text-muted-foreground/50">Previous</span>
      ) : (
        <Link
          href={joinRequestsHref({ filter, page: page - 1 })}
          scroll={false}
          className="text-sm text-foreground hover:underline"
        >
          Previous
        </Link>
      )}

      <p
        data-testid="pagination-info"
        className="text-sm text-muted-foreground"
      >
        Page {page} of {totalPages} ({total} total)
      </p>

      {isLastPage ? (
        <span className="text-sm text-muted-foreground/50">Next</span>
      ) : (
        <Link
          href={joinRequestsHref({ filter, page: page + 1 })}
          scroll={false}
          className="text-sm text-foreground hover:underline"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
