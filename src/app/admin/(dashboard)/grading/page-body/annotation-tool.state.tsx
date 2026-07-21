"use client";

import { createContext, useContext, useReducer } from "react";
import type {
  AnnotationEntry,
  AnnotationPoint,
  AnnotationStroke,
} from "src/lib/annotation-service";

export interface AnnotationToolState {
  /** The color new strokes are drawn in. */
  color: string;
  /** Completed strokes per photo S3 key. */
  entriesByKey: Record<string, AnnotationStroke[]>;
  /** The stroke currently being drawn (between pointer down and up). */
  drawing: { mediaKey: string; stroke: AnnotationStroke } | null;
}

interface SetColorAction {
  type: "SET_COLOR";
  color: string;
}
interface StartStrokeAction {
  type: "START_STROKE";
  mediaKey: string;
  point: AnnotationPoint;
}
interface AddPointAction {
  type: "ADD_POINT";
  point: AnnotationPoint;
}
interface EndStrokeAction {
  type: "END_STROKE";
}
interface UndoAction {
  type: "UNDO";
  mediaKey: string;
}
interface ClearAction {
  type: "CLEAR";
  mediaKey: string;
}

export type AnnotationToolAction =
  | SetColorAction
  | StartStrokeAction
  | AddPointAction
  | EndStrokeAction
  | UndoAction
  | ClearAction;

/**
 * Builds the tool's initial state from a grade's existing annotations.
 * @param annotations - Previously saved annotation entries (may be empty).
 * @param color - The initial drawing color.
 * @returns The seeded tool state.
 */
export function buildInitialAnnotationState(
  annotations: AnnotationEntry[],
  color: string,
): AnnotationToolState {
  const entriesByKey: Record<string, AnnotationStroke[]> = {};
  for (const entry of annotations) {
    entriesByKey[entry.mediaKey] = entry.strokes;
  }
  return { color, entriesByKey, drawing: null };
}

/**
 * Pure reducer for the annotation drawing tool: tracks the active color, the
 * in-progress stroke, and completed strokes per photo. END_STROKE commits a
 * stroke only if it has at least two points (a single click is not a mark).
 * @param state - Current tool state.
 * @param action - Action to apply.
 * @returns The next tool state.
 */
export function annotationReducer(
  state: AnnotationToolState,
  action: AnnotationToolAction,
): AnnotationToolState {
  switch (action.type) {
    case "SET_COLOR":
      return { ...state, color: action.color };

    case "START_STROKE":
      return {
        ...state,
        drawing: {
          mediaKey: action.mediaKey,
          stroke: { color: state.color, points: [action.point] },
        },
      };

    case "ADD_POINT":
      if (!state.drawing) return state;
      return {
        ...state,
        drawing: {
          ...state.drawing,
          stroke: {
            ...state.drawing.stroke,
            points: [...state.drawing.stroke.points, action.point],
          },
        },
      };

    case "END_STROKE": {
      if (!state.drawing) return state;
      const { mediaKey, stroke } = state.drawing;
      if (stroke.points.length < 2) {
        return { ...state, drawing: null };
      }
      return {
        ...state,
        drawing: null,
        entriesByKey: {
          ...state.entriesByKey,
          [mediaKey]: [...(state.entriesByKey[mediaKey] ?? []), stroke],
        },
      };
    }

    case "UNDO":
      return {
        ...state,
        entriesByKey: {
          ...state.entriesByKey,
          [action.mediaKey]: (state.entriesByKey[action.mediaKey] ?? []).slice(
            0,
            -1,
          ),
        },
      };

    case "CLEAR":
      return {
        ...state,
        entriesByKey: { ...state.entriesByKey, [action.mediaKey]: [] },
      };

    default:
      return state;
  }
}

interface AnnotationToolContextValue extends AnnotationToolState {
  dispatch: React.Dispatch<AnnotationToolAction>;
}

const AnnotationToolContext = createContext<AnnotationToolContextValue | null>(
  null,
);

/**
 * Provider holding the annotation tool state for one student's grading row.
 * @param initialAnnotations - Existing saved annotations to seed from.
 * @param children - Subtree consuming the tool context.
 * @returns The provider element.
 */
export function AnnotationToolProvider({
  initialAnnotations,
  children,
}: {
  initialAnnotations: AnnotationEntry[];
  children: React.ReactNode;
}): React.ReactNode {
  const [state, dispatch] = useReducer(
    annotationReducer,
    buildInitialAnnotationState(initialAnnotations, "#ef4444"),
  );
  return (
    <AnnotationToolContext.Provider value={{ ...state, dispatch }}>
      {children}
    </AnnotationToolContext.Provider>
  );
}

/**
 * Hook exposing the annotation tool state + dispatch. Throws outside provider.
 * @returns The tool state and dispatch.
 */
export function useAnnotationTool(): AnnotationToolContextValue {
  const value = useContext(AnnotationToolContext);
  if (!value) {
    throw new Error(
      "useAnnotationTool must be used within AnnotationToolProvider",
    );
  }
  return value;
}
