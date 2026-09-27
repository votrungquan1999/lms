"use client";

import { useActionState, useReducer } from "react";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { submitWithoutReset } from "src/lib/submit-without-reset";
import { cn } from "src/lib/utils";
import {
  type ComposeFromPoolsState,
  composeFromPoolsAction,
} from "./compose-from-pools-actions";

/** A pool the teacher can draw questions from, with its current size. */
export interface ComposablePool {
  id: string;
  name: string;
  questionCount: number;
}

interface PoolSelection {
  selected: boolean;
  count: number;
}

type SelectionState = Record<string, PoolSelection>;

type SelectionAction =
  | { type: "toggle"; poolId: string; max: number }
  | { type: "setCount"; poolId: string; count: number; max: number }
  | { type: "reset"; pools: ComposablePool[] };

/** Reducer for the per-pool selection + draw-count state. */
function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  if (action.type === "reset") {
    return buildInitialState(action.pools);
  }

  const current = state[action.poolId] ?? { selected: false, count: 1 };

  if (action.type === "toggle") {
    return {
      ...state,
      [action.poolId]: { ...current, selected: !current.selected },
    };
  }

  const clamped = Math.max(1, Math.min(action.count, action.max));
  return {
    ...state,
    [action.poolId]: { ...current, count: clamped },
  };
}

function buildInitialState(pools: ComposablePool[]): SelectionState {
  const state: SelectionState = {};
  for (const pool of pools) {
    state[pool.id] = {
      selected: false,
      count: Math.min(1, pool.questionCount) || 1,
    };
  }
  return state;
}

/**
 * Client component: "Add from pools" — lets a teacher pick one or more pools
 * and how many questions to draw from each, then composes them into the test.
 */
export function ComposeFromPoolsForm({
  testId,
  courseId,
  pools,
}: {
  testId: string;
  courseId: string;
  pools: ComposablePool[];
}) {
  // Local-only complex state (per-pool selected + count). `createReducerContext`
  // is not available in this project and no cross-component sharing is needed
  // here, so the built-in `useReducer` is the right fit (hooks rule: prefer
  // useReducer over useState for complex local state).
  const [selections, dispatch] = useReducer(
    selectionReducer,
    pools,
    buildInitialState,
  );

  const [state, formAction, isPending] = useActionState<
    ComposeFromPoolsState | null,
    FormData
  >(async (_prevState, rawFormData) => {
    const chosen = pools
      .filter((pool) => selections[pool.id]?.selected)
      .map((pool) => ({ poolId: pool.id, count: selections[pool.id].count }));
    rawFormData.set("selections", JSON.stringify(chosen));
    const result = await composeFromPoolsAction(_prevState, rawFormData);
    if (result.success) {
      dispatch({ type: "reset", pools });
    }
    return result;
  }, null);

  if (pools.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base">Add from Pools</CardTitle>
          <CardDescription>
            No question pools exist yet. Create one in the Question Bank.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Every pool exists but none has a question to draw — the rows are all
  // disabled already, so name the reason instead of leaving it to the refusal.
  const allPoolsEmpty = pools.every((pool) => pool.questionCount === 0);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Add from Pools</CardTitle>
        <CardDescription>
          {allPoolsEmpty
            ? "Your pools have no questions yet. Add questions to a pool before drawing from it."
            : "Draw a fixed set of questions from one or more pools. Copies are frozen into this test at composition."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          onSubmit={submitWithoutReset(formAction)}
          className="space-y-4"
        >
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />

          <ul className="space-y-2">
            {pools.map((pool) => {
              const selection = selections[pool.id];
              const isEmpty = pool.questionCount === 0;
              return (
                <li
                  key={pool.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3",
                    // Not `has-disabled:` — every unticked row's count box is disabled too.
                    isEmpty && "opacity-50",
                  )}
                  data-testid="compose-pool-row"
                >
                  <input
                    type="checkbox"
                    id={`pool-${pool.id}`}
                    checked={selection?.selected ?? false}
                    // A pool ticked before it emptied stays clickable so the
                    // teacher can consciously untick it; only an unticked
                    // empty pool stays disabled.
                    disabled={isEmpty && !selection?.selected}
                    onChange={() =>
                      dispatch({
                        type: "toggle",
                        poolId: pool.id,
                        max: pool.questionCount,
                      })
                    }
                    aria-label={`Select pool ${pool.name}`}
                  />
                  <Label
                    htmlFor={`pool-${pool.id}`}
                    className="min-w-0 flex-1 leading-snug"
                  >
                    <span className="wrap-anywhere">{pool.name}</span>{" "}
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      ({pool.questionCount} available)
                    </span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={pool.questionCount}
                    value={selection?.count ?? 1}
                    disabled={!selection?.selected}
                    onChange={(e) =>
                      dispatch({
                        type: "setCount",
                        poolId: pool.id,
                        count: Number.parseInt(e.target.value, 10) || 1,
                        max: pool.questionCount,
                      })
                    }
                    className="w-20 shrink-0"
                    aria-label={`Count for pool ${pool.name}`}
                  />
                </li>
              );
            })}
          </ul>

          <Button
            type="submit"
            disabled={isPending || allPoolsEmpty}
            className="w-full"
          >
            {isPending ? "Adding…" : "Add from Pools"}
          </Button>
        </form>

        {state?.success && (
          <output className="mt-4 block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message}
          </output>
        )}

        {state && !state.success && (
          <div
            className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
