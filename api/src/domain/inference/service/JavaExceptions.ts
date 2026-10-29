import { RuntimeException } from "../../../lib/errors";

/**
 * Java runtime exceptions without a GlobalExceptionHandler entry (NullPointerException,
 * IndexOutOfBoundsException, NoSuchElementException, …) were rendered by the RuntimeException
 * handler as 500 `{ error: <message or null>, type: "RUNTIME_ERROR" }`.
 */
export function javaRuntimeException(message: string | null = null): RuntimeException {
  const e = new RuntimeException(message ?? "");
  if (message == null) (e as { message: string | null }).message = null;
  return e;
}
