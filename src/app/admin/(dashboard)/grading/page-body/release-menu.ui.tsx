"use client";

import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";

export type ReleaseChipTone = "secondary" | "warning" | "success" | "info";

export interface ReleaseMenuEntry {
  label: string;
  onSelect: () => void;
}

interface ReleaseMenuViewProps {
  stateText: string;
  tone: ReleaseChipTone;
  /** Empty when nothing is left to release: the chip stands alone. */
  entries: ReleaseMenuEntry[];
  /** The failure text of the last release, if any. */
  error: string | null;
}

/** "Release" with the test's release state as a chip; a menu of release actions when any are left. */
export function ReleaseMenuView({
  stateText,
  tone,
  entries,
  error,
}: ReleaseMenuViewProps) {
  const chip = (
    <Badge variant={tone} data-testid="release-state">
      {stateText}
    </Badge>
  );
  return (
    <div className="flex items-center gap-2">
      {entries.length === 0 ? (
        <span className="flex items-center gap-2 text-sm">Release {chip}</span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              Release {chip} ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            {entries.map((entry) => (
              <DropdownMenuItem key={entry.label} onSelect={entry.onSelect}>
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
