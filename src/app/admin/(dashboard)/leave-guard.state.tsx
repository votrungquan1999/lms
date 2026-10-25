"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";

/** What the page is doing in the background, which changes what leaving costs. */
export type LeaveActivity = "idle" | "reading" | "importing";

interface LeaveGuardValue {
  /** Whether the page has unsaved work on screen. */
  hasWork: boolean;
  /** Tells the layout whether the page has unsaved work on screen and what it is busy with. */
  setHasWork: (hasWork: boolean, activity?: LeaveActivity) => void;
  /** Runs `onLeave` now, or after the teacher confirms when work is on screen. */
  requestLeave: (onLeave: () => void) => void;
}

const LeaveGuardContext = createContext<LeaveGuardValue>({
  hasWork: false,
  setHasWork: () => {},
  requestLeave: (onLeave) => onLeave(),
});

export function LeaveGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hasWork, setHasWorkState] = useState(false);
  const [activity, setActivity] = useState<LeaveActivity>("idle");
  const setHasWork = useCallback(
    (work: boolean, busyWith: LeaveActivity = "idle") => {
      setHasWorkState(work);
      setActivity(busyWith);
    },
    [],
  );
  // Held in an object so a function can be stored without React calling it.
  const [pending, setPending] = useState<{ onLeave: () => void } | null>(null);

  const requestLeave = useCallback(
    (onLeave: () => void) => {
      if (hasWork) setPending({ onLeave });
      else onLeave();
    },
    [hasWork],
  );

  return (
    <LeaveGuardContext.Provider value={{ hasWork, setHasWork, requestLeave }}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this page?</AlertDialogTitle>
            <AlertDialogDescription>
              {activity === "importing"
                ? "Questions are being imported. Leaving won't stop the import; it will finish in the background."
                : activity === "reading"
                  ? "Your questions have not been imported yet. Leaving now discards them. A document still being read is not stopped; its result is thrown away."
                  : "Your questions have not been imported yet. Leaving now discards them."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending?.onLeave()}>
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LeaveGuardContext.Provider>
  );
}

/** Safe outside a provider: nothing is guarded and `requestLeave` leaves at once. */
export function useLeaveGuard(): LeaveGuardValue {
  return useContext(LeaveGuardContext);
}
