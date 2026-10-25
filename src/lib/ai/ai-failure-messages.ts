/** What went wrong with an AI read, in terms that tell a teacher what to do next. */
export enum AiFailureCause {
  Busy = "busy",
  Timeout = "timeout",
  OutputCap = "output_cap",
  Refusal = "refusal",
  WrongShape = "wrong_shape",
  KeyConfig = "key_config",
  Unknown = "unknown",
}

/**
 * Teacher-facing text per cause. Kept free of SDK imports so server actions and
 * browser code can share it, and never names the AI provider.
 */
export const AI_FAILURE_MESSAGES: Record<AiFailureCause, string> = {
  [AiFailureCause.Busy]:
    "The AI is busy or could not be reached. Please try again in a few minutes.",
  [AiFailureCause.Timeout]:
    "The AI took too long to read this. The document may be too long, so try splitting it into smaller files.",
  [AiFailureCause.OutputCap]:
    "This document has more than the AI can write out in one go. Split it into smaller files and import them one at a time.",
  [AiFailureCause.Refusal]:
    "The AI declined to read this document, and trying again will not help. Edit the document or try a different file.",
  [AiFailureCause.WrongShape]:
    "The AI's answer could not be understood. Trying once more may help.",
  [AiFailureCause.KeyConfig]:
    "The AI service is not set up correctly. Please tell the site owner.",
  [AiFailureCause.Unknown]:
    "Something went wrong while the AI was reading. Please try again, and if it keeps failing, contact the developer.",
};
