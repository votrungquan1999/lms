"use client";

import { createContext, useContext, useReducer } from "react";
import type {
  AnnotationEntry,
  AnnotationPoint,
  AnnotationStroke,
  AnnotationText,
} from "src/lib/annotation-service";
import {
  arrowPoints,
  ellipsePoints,
  type SurfaceSize,
} from "./annotation-shapes";

/** The kind of mark the grader makes next. */
export type MarkTool = "pen" | "circle" | "arrow" | "text";

/** Kinds of mark one Undo can take back, in the order they were made. */
type MarkKind = "stroke" | "text";

/** A text mark being typed: where it goes and what is typed so far. */
export interface TextDraft {
  mediaKey: string;
  point: AnnotationPoint;
  color: string;
  text: string;
}

export interface AnnotationToolState {
  /** The color new marks are made in. */
  color: string;
  /** The kind of mark the grader makes next. */
  tool: MarkTool;
  /** Completed strokes per photo S3 key. */
  entriesByKey: Record<string, AnnotationStroke[]>;
  /** Completed text marks per photo S3 key. */
  textsByKey: Record<string, AnnotationText[]>;
  /** What each photo's marks were made in, so Undo takes back the latest of either kind. */
  historyByKey: Record<string, MarkKind[]>;
  /** The text mark being typed, if any. */
  textDraft: TextDraft | null;
  /** The stroke currently being drawn (between pointer down and up). */
  drawing: {
    mediaKey: string;
    tool: MarkTool;
    /** Where the drag began; shapes are rebuilt from it on every move. */
    origin: AnnotationPoint;
    /** Surface size in pixels, so an arrow head keeps its shape. */
    size: SurfaceSize;
    stroke: AnnotationStroke;
  } | null;
}

interface SetColorAction {
  type: "SET_COLOR";
  color: string;
}
interface SetToolAction {
  type: "SET_TOOL";
  tool: MarkTool;
}
interface StartStrokeAction {
  type: "START_STROKE";
  mediaKey: string;
  point: AnnotationPoint;
  size: SurfaceSize;
}
interface AddPointAction {
  type: "ADD_POINT";
  point: AnnotationPoint;
}
interface EndStrokeAction {
  type: "END_STROKE";
}
interface StartTextAction {
  type: "START_TEXT";
  mediaKey: string;
  point: AnnotationPoint;
}
interface SetTextAction {
  type: "SET_TEXT";
  text: string;
}
interface CommitTextAction {
  type: "COMMIT_TEXT";
}
interface CancelTextAction {
  type: "CANCEL_TEXT";
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
  | SetToolAction
  | StartStrokeAction
  | AddPointAction
  | EndStrokeAction
  | StartTextAction
  | SetTextAction
  | CommitTextAction
  | CancelTextAction
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
  const textsByKey: Record<string, AnnotationText[]> = {};
  const historyByKey: Record<string, MarkKind[]> = {};
  for (const entry of annotations) {
    const strokes = entry.strokes ?? [];
    const texts = entry.texts ?? [];
    entriesByKey[entry.mediaKey] = strokes;
    textsByKey[entry.mediaKey] = texts;
    historyByKey[entry.mediaKey] = [
      ...strokes.map((): MarkKind => "stroke"),
      ...texts.map((): MarkKind => "text"),
    ];
  }
  return {
    color,
    tool: "pen",
    entriesByKey,
    textsByKey,
    historyByKey,
    textDraft: null,
    drawing: null,
  };
}

function appendHistory(
  state: AnnotationToolState,
  mediaKey: string,
  kind: MarkKind,
): Record<string, MarkKind[]> {
  return {
    ...state.historyByKey,
    [mediaKey]: [...(state.historyByKey[mediaKey] ?? []), kind],
  };
}

/** Keeps the typed text as a mark, or drops it when nothing but spaces was typed. */
function commitTextDraft(state: AnnotationToolState): AnnotationToolState {
  const draft = state.textDraft;
  if (!draft) return state;
  const text = draft.text.trim();
  if (!text) return { ...state, textDraft: null };
  const mark: AnnotationText = {
    x: draft.point.x,
    y: draft.point.y,
    text,
    color: draft.color,
  };
  return {
    ...state,
    textDraft: null,
    textsByKey: {
      ...state.textsByKey,
      [draft.mediaKey]: [...(state.textsByKey[draft.mediaKey] ?? []), mark],
    },
    historyByKey: appendHistory(state, draft.mediaKey, "text"),
  };
}

/**
 * Pure reducer for the annotation tool: tracks the active color and tool, the
 * stroke being drawn, the text being typed, and each photo's strokes, texts and
 * undo order. END_STROKE commits a stroke only if it has at least two points (a
 * single click is not a mark).
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

    case "SET_TOOL":
      return { ...state, tool: action.tool };

    case "START_STROKE":
      return {
        ...state,
        drawing: {
          mediaKey: action.mediaKey,
          tool: state.tool,
          origin: action.point,
          size: action.size,
          stroke: { color: state.color, points: [action.point] },
        },
      };

    case "ADD_POINT": {
      if (!state.drawing) return state;
      const { tool, origin, size, stroke } = state.drawing;
      let points: AnnotationPoint[];
      if (tool === "circle") points = ellipsePoints(origin, action.point);
      else if (tool === "arrow")
        points = arrowPoints(origin, action.point, size);
      else points = [...stroke.points, action.point];
      return {
        ...state,
        drawing: { ...state.drawing, stroke: { ...stroke, points } },
      };
    }

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
        historyByKey: appendHistory(state, mediaKey, "stroke"),
      };
    }

    case "START_TEXT":
      return {
        ...commitTextDraft(state),
        textDraft: {
          mediaKey: action.mediaKey,
          point: action.point,
          color: state.color,
          text: "",
        },
      };

    case "SET_TEXT":
      if (!state.textDraft) return state;
      return {
        ...state,
        textDraft: { ...state.textDraft, text: action.text },
      };

    case "COMMIT_TEXT":
      return commitTextDraft(state);

    case "CANCEL_TEXT":
      return { ...state, textDraft: null };

    case "UNDO": {
      const history = state.historyByKey[action.mediaKey] ?? [];
      const latest = history[history.length - 1];
      if (!latest) return state;
      const strokes = state.entriesByKey[action.mediaKey] ?? [];
      const texts = state.textsByKey[action.mediaKey] ?? [];
      return {
        ...state,
        entriesByKey: {
          ...state.entriesByKey,
          [action.mediaKey]:
            latest === "stroke" ? strokes.slice(0, -1) : strokes,
        },
        textsByKey: {
          ...state.textsByKey,
          [action.mediaKey]: latest === "text" ? texts.slice(0, -1) : texts,
        },
        historyByKey: {
          ...state.historyByKey,
          [action.mediaKey]: history.slice(0, -1),
        },
      };
    }

    case "CLEAR":
      return {
        ...state,
        entriesByKey: { ...state.entriesByKey, [action.mediaKey]: [] },
        textsByKey: { ...state.textsByKey, [action.mediaKey]: [] },
        historyByKey: { ...state.historyByKey, [action.mediaKey]: [] },
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
