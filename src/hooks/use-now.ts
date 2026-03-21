"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current timestamp (ms), updated every animation frame.
 * Useful for deriving time-dependent values (countdowns, elapsed time)
 * without managing separate intervals.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let id: number;
    const tick = () => {
      setNow(Date.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return now;
}
