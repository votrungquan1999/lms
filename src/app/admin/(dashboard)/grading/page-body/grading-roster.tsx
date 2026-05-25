import Link from "next/link";
import {
  GradingSort,
  type RosterStudentCellModel,
} from "./grading-page-body.type";
import { RosterCell, SortDropdown } from "./grading-roster.ui";
import { gradingHref } from "./href";

interface GradingRosterProps {
  cells: RosterStudentCellModel[];
  basePath: string;
  activeStudentId: string | null;
  sort: GradingSort;
}

/**
 * Renders the roster of student cells in the order they're passed in. Each
 * cell is a `<Link>` to the same page with `?studentId=<id>`. The active
 * cell carries `aria-current="page"` for accessible "you are here" cueing.
 * A sort dropdown above the list lets the user pick the comparator.
 */
export function GradingRoster({
  cells,
  basePath,
  activeStudentId,
  sort,
}: GradingRosterProps) {
  return (
    <div className="space-y-2">
      <SortDropdown basePath={basePath} sort={sort} />
      <ul className="space-y-1">
        {cells.map((cell) => {
          const isActive = cell.id === activeStudentId;
          return (
            <li key={cell.id}>
              <Link
                href={gradingHref({ basePath, studentId: cell.id, sort })}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className="block rounded-sm hover:bg-muted aria-[current=page]:bg-muted"
              >
                <RosterCell cell={cell} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
