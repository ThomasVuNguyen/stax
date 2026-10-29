/**
 * Port of feature/exception/FeatureDisabledException. The class lives in lib/errors.ts so the
 * global error handler renders it (404 `{ error: "Path not found", type: "PATH_NOT_FOUND" }`).
 */
export { FeatureDisabledException } from "../../lib/errors";
