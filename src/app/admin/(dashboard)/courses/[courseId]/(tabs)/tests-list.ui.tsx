"use client";

import { Search } from "lucide-react";
import { Input } from "src/components/ui/input";
import { pluralize } from "src/lib/pluralize";
import {
  TestsChip,
  useTestsList,
  useTestsListActions,
} from "./tests-list.state";
import { TestRowView, TestsColumnHeader } from "./tests-table.ui";

const CHIPS: { chip: TestsChip; label: string }[] = [
  { chip: TestsChip.All, label: "All" },
  { chip: TestsChip.NeedsGrading, label: "Needs grading" },
  { chip: TestsChip.NotReleased, label: "Not released" },
  { chip: TestsChip.Practice, label: "Practice" },
];

/**
 * Every test of the course with search and filter chips. The heading, chips,
 * search and column header stay pinned while the rows scroll; the phone's
 * 56 px top bar is sticky too, so the block sits just under it there.
 */
export function AllTestsSection() {
  const { query, chip, total, counts, visible } = useTestsList();
  const { setQuery, setChip } = useTestsListActions();

  return (
    <section aria-label="All tests" className="grid gap-0">
      <div
        data-testid="all-tests-pinned"
        className="sticky top-14 z-10 grid gap-2.5 bg-background pt-1 md:top-0"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="whitespace-nowrap text-[17px] font-semibold">
            All tests{" "}
            <span className="font-medium text-muted-foreground">({total})</span>
          </h2>
          <span className="whitespace-nowrap text-[13px] text-muted-foreground">
            Newest first
          </span>
          {total > 0 && (
            <>
              <fieldset
                aria-label="Filter tests"
                className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0 md:ml-auto"
              >
                {CHIPS.map((item) => (
                  <button
                    key={item.chip}
                    type="button"
                    aria-pressed={chip === item.chip}
                    onClick={() => setChip(item.chip)}
                    className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden ${
                      chip === item.chip
                        ? "border-foreground bg-foreground text-background"
                        : "bg-card hover:bg-muted"
                    }`}
                  >
                    {item.label}
                    <span
                      className={
                        chip === item.chip
                          ? "opacity-80"
                          : "text-muted-foreground"
                      }
                    >
                      {counts[item.chip]}
                    </span>
                  </button>
                ))}
              </fieldset>
              <div className="relative block w-full md:w-60">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
                />
                <Input
                  type="search"
                  aria-label="Search tests"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${total} ${pluralize(total, "test")}`}
                  className="h-8 pl-8"
                />
              </div>
            </>
          )}
        </div>
        {total > 0 && (
          <div className="rounded-t-xl border border-b-0 bg-background">
            <TestsColumnHeader />
          </div>
        )}
      </div>
      {total === 0 && (
        <p className="text-sm text-muted-foreground">No tests yet.</p>
      )}
      {total > 0 && (
        <div className="rounded-b-xl border bg-card md:border-t-0">
          {visible.map((row) => (
            <TestRowView key={row.testId} row={row} line={row.meta} showTags />
          ))}
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tests match
            </p>
          )}
        </div>
      )}
    </section>
  );
}
