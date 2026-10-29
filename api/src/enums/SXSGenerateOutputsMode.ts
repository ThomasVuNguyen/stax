export const SXSGenerateOutputsMode = {
  MISSING_ONLY: "MISSING_ONLY",
  MISSING_AND_MATCHING: "MISSING_AND_MATCHING",
  RUN_OR_RERUN: "RUN_OR_RERUN",
  DUPLICATE: "DUPLICATE",
  AUTORESOLVE: "AUTORESOLVE",
} as const;
export type SXSGenerateOutputsMode = (typeof SXSGenerateOutputsMode)[keyof typeof SXSGenerateOutputsMode];

/** Declaration order (`SXSGenerateOutputsMode.values()`). */
export const SXSGenerateOutputsModeValues: SXSGenerateOutputsMode[] = [SXSGenerateOutputsMode.MISSING_ONLY, SXSGenerateOutputsMode.MISSING_AND_MATCHING, SXSGenerateOutputsMode.RUN_OR_RERUN, SXSGenerateOutputsMode.DUPLICATE, SXSGenerateOutputsMode.AUTORESOLVE];
