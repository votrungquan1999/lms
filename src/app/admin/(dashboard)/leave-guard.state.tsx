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

interface LeaveGuardValue {
  /** Whether the page has unsaved work on screen. */
  hasWork: boolean;
  /** Tells the layout whether the page has unsaved work on screen, and what leaving it costs. */
  setHasWork: (hasWork: boolean, message?: string) => void;
  /** Runs `onLeave` now, or after the teacher confirms when work is on screen. */
  requestLeave: (onLeave: () => void) => void;
}

/** Shown when the page does not say what leaving would lose. */
const DEFAULT_LEAVE_MESSAGE =
  "You have unsaved changes on this page. Leaving now discards them.";

const LeaveGuardContext = createContext<LeaveGuardValue>({
  hasWork: false,
  setHasWork: () => {},
  requestLeave: (onLeave) => onLeave(),
});

/**
 * Lets admin pages register unsaved work, and asks before the layout's links
 * or Sign Out leave a page that has some.
 */
export function LeaveGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hasWork, setHasWorkState] = useState(false);
  const [message, setMessage] = useState(DEFAULT_LEAVE_MESSAGE);
  const setHasWork = useCallback(
    (work: boolean, leaveMessage: string = DEFAULT_LEAVE_MESSAGE) => {
      setHasWorkState(work);
      setMessage(leaveMessage);
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
            <AlertDialogDescription>{message}</AlertDialogDescription>
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
