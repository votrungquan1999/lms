/**
 * Color tone for a graded score, used to tint the grade panel and its score
 * badge. Values intentionally match the semantic Badge variant names so a tone
 * can be looked up directly in {@link SCORE_BADGE_VARIANT}.
 */
export enum ScoreTone {
  Success = "success",
  Warning = "warning",
  Destructive = "destructive",
}

/**
 * Maps a 0–100 score to a color tone by band: success for high scores
 * (>= 80), warning for the middle band (50–79), and destructive for low
 * scores (< 50).
 * @param score - The score to classify, expected in the 0–100 range.
 * @returns The {@link ScoreTone} for the score's band.
 */
export function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return ScoreTone.Success;
  if (score >= 50) return ScoreTone.Warning;
  return ScoreTone.Destructive;
}

/**
 * Border + background classes for the grade panel, keyed by tone. Full class
 * strings (not interpolated) so Tailwind's JIT keeps them.
 */
export const SCORE_PANEL_CLASS: Record<ScoreTone, string> = {
  [ScoreTone.Success]: "border-success/30 bg-success/10",
  [ScoreTone.Warning]: "border-warning/30 bg-warning/15",
  [ScoreTone.Destructive]: "border-destructive/30 bg-destructive/10",
};

/**
 * Badge `variant` to use for the score badge, keyed by tone.
 */
export const SCORE_BADGE_VARIANT: Record<
  ScoreTone,
  "success" | "warning" | "destructive"
> = {
  [ScoreTone.Success]: "success",
  [ScoreTone.Warning]: "warning",
  [ScoreTone.Destructive]: "destructive",
};
