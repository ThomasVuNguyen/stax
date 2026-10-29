import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Base error carrying the HTTP status and the `type` string that the Spring
 * GlobalExceptionHandler put in `{ error, type }` responses.
 */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public type: string,
    message: string,
  ) {
    super(message);
  }
}

// One class per Java exception the frontend can observe. Names match the Java originals.
export class IllegalArgumentException extends HttpError {
  constructor(message = "Illegal argument") {
    super(400, "ILLEGAL_ARGUMENT", message);
  }
}
export class IllegalInputException extends HttpError {
  constructor(message = "Illegal input") {
    super(400, "ILLEGAL_INPUT", message);
  }
}
/**
 * ValidationException / ConstraintViolationException rendered as BadRequestResponse:
 * `{ success: false, message: "Validation faild.", type: "VALIDATION_FAILED", errors }`.
 */
export class ValidationException extends Error {
  constructor(public errors: Record<string, string>[]) {
    super("Validation faild.");
  }
}
/** Bean-validation failures (@Valid / @NotBlank etc.). */
export class InvalidDataException extends HttpError {
  constructor(message: string) {
    super(400, "INVALID_DATA", message);
  }
}
export class ApiKeyIsMissingException extends HttpError {
  constructor(message = "API key is missing") {
    super(400, "API_KEY_MISSING", message);
  }
}
export class DuplicateRecordException extends HttpError {
  constructor(message = "Record already exists") {
    super(400, "RECORD ALREADY EXISTS", message);
  }
}
export class LlmProviderException extends HttpError {
  constructor(message: string) {
    super(400, "LLM_PROVIDER_EXCEPTION", message);
  }
}
export class UserQuotaExceededException extends HttpError {
  constructor(message = "User quota exceeded") {
    super(400, "USER_QUOTA_EXCEEDED", message);
  }
}
export class UserNotFoundException extends HttpError {
  constructor(message = "User not found") {
    super(401, "USER_NOT_FOUND", message);
  }
}
export class GoogleAuthCodeException extends HttpError {
  constructor(message = "Invalid Google auth code") {
    super(401, "INVALID GOOGLE AUTHCODE", message);
  }
}
export class UnauthorizedException extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
  }
}
export class PermissionException extends HttpError {
  constructor(message = "Access denied") {
    super(403, "PERMISSION_DENIED", message);
  }
}
export class UserAccessDeniedException extends HttpError {
  constructor(message = "Access denied") {
    super(403, "USER_ACCESS_DENIED", message);
  }
}
export class UserAccountDisabledException extends HttpError {
  constructor(message = "User account is disabled") {
    super(403, "USER_ACCOUNT_DISABLED", message);
  }
}
export class LlmForbiddenException extends HttpError {
  constructor(message: string) {
    super(403, "LLM_FORBIDDEN_EXCEPTION", message);
  }
}
export class ModelNotFoundException extends HttpError {
  constructor(message = "Model not found") {
    super(404, "MODEL_NOT_FOUND", message);
  }
}
export class MethodNotSupportException extends HttpError {
  constructor(message = "Method not supported") {
    super(405, "METHOD_NOT_SUPPORTED", message);
  }
}
export class EmailAlreadyExistsException extends HttpError {
  constructor(message = "Email already exists") {
    super(409, "EMAIL_EXIST", message);
  }
}
export class EvaluatorNameExistException extends HttpError {
  constructor(message = "Evaluator name already exists") {
    super(409, "EVALUATOR_NAME_EXIST", message);
  }
}
export class ResourceAlreadyExistsException extends HttpError {
  constructor(message = "Resource already exists") {
    super(409, "RESOURCE_ALREADY_EXISTS", message);
  }
}
export class RateLimitExceedException extends HttpError {
  constructor(message = "Rate limit exceeded") {
    super(429, "RATE_LIMIT_EXCEED", message);
  }
}
export class ResourceLimitExceedException extends HttpError {
  constructor(message = "Resource limit exceeded") {
    super(429, "RESOURCE_LIMIT_EXCEED", message);
  }
}
export class LlmRateLimitException extends HttpError {
  constructor(message: string) {
    super(429, "LLM_RATE_LIMIT", message);
  }
}
export class LlmServerException extends HttpError {
  constructor(message: string) {
    super(500, "LLM_SERVER_ERROR", message);
  }
}
export class ResourceDeletionException extends HttpError {
  constructor(message: string) {
    super(500, "RESOURCE_DELETION_FAILED", message);
  }
}
export class RuntimeException extends HttpError {
  constructor(message: string) {
    super(500, "RUNTIME_ERROR", message);
  }
}
export class NotImplementedException extends HttpError {
  constructor(message = "Not implemented") {
    super(501, "NOT_IMPLEMENTED", message);
  }
}
export class LlmEngineOverloadedException extends HttpError {
  constructor(message: string) {
    super(503, "LLM_ENGINE_OVERLOADED", message);
  }
}

/** NotFoundException used a different body shape: `{ success: false, type: "error", message }`. */
export class NotFoundException extends Error {
  constructor(message = "Not found") {
    super(message);
  }
}

/** Raised by job workers when the owning job was stopped (JobStatusStoppedException). */
export class JobStatusStoppedException extends Error {}

export function onError(err: Error, c: Context) {
  if (err instanceof ValidationException) {
    return c.json(
      { success: false, message: err.message, type: "VALIDATION_FAILED", errors: err.errors },
      400,
    );
  }
  if (err instanceof NotFoundException) {
    return c.json({ success: false, type: "error", message: err.message }, 404);
  }
  if (err instanceof HttpError) {
    return c.json({ error: err.message, type: err.type }, err.status);
  }
  console.error(err);
  const details = err.message ? ` Details: ${err.message}` : "";
  return c.json(
    { error: `Unexpected Error: Something went wrong.${details}`, type: "INTERNAL_SERVER_ERROR" },
    500,
  );
}
