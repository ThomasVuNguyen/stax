/**
 * Port of domain/datatransfer/DataTransferOperationsController (`/data-transfer`).
 *
 * Error rendering as in Spring:
 * - @Valid violations → 400 INVALID_DATA "…Details: sourceId: Source ID cannot be null., …" (Java
 *   field names, declaration order);
 * - an unknown source_type/target_type → HttpMessageNotReadableException → 500 RUNTIME_ERROR;
 * - same source and target → ResponseStatusException(400, …), which the RuntimeException handler
 *   turned into 500 RUNTIME_ERROR with the message `400 BAD_REQUEST "…"`;
 * - PROJECT → DATASET move → 400 ILLEGAL_INPUT.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ChatTurnContainerType, ChatTurnContainerTypeValues } from "../../enums/ChatTurnContainerType";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { IllegalInputException, InvalidDataException, RuntimeException } from "../../lib/errors";
import { jsonBody } from "../../lib/http";
import type { CopyAllChatsRequestDTO } from "./dto/CopyAllChatsRequestDTO";
import type { CopyChatsRequestDTO } from "./dto/CopyChatsRequestDTO";
import type { CopyChatsResponseDTO } from "./dto/CopyChatsResponseDTO";
import type { CopySelectedChatsRequestDTO } from "./dto/CopySelectedChatsRequestDTO";
import type { MoveChatsRequestDTO } from "./dto/MoveChatsRequestDTO";
import * as DataTransferOperationsService from "./service/DataTransferOperationsService";

const app = new Hono<AppEnv>();

type ValidatedRequest = {
  source_id: string;
  source_type: ChatTurnContainerType;
  target_id: string;
  target_type: ChatTurnContainerType;
};

function checkEnum(name: string, v: unknown): void {
  if (v == null || ChatTurnContainerTypeValues.includes(v as ChatTurnContainerType)) return;
  throw new RuntimeException(
    `JSON parse error: Cannot deserialize value of type \`com.planck.planck.enums.ChatTurnContainerType\` from String "${String(v)}": not one of the values accepted for Enum class: [${ChatTurnContainerTypeValues.join(", ")}]`,
  );
}

/** Bean validation of CopyChatsRequestDTO / MoveAllChatsRequestDTO (+ chat_ids for the subclasses). */
function validate(body: CopyChatsRequestDTO & { chat_ids?: string[] | null }, withChatIds: boolean): ValidatedRequest {
  checkEnum("source_type", body.source_type);
  checkEnum("target_type", body.target_type);
  const errors: string[] = [];
  if (body.source_id == null) errors.push("sourceId: Source ID cannot be null.");
  if (body.source_type == null) errors.push("sourceType: Source type cannot be null.");
  if (body.target_id == null) errors.push("targetId: Target ID cannot be null.");
  if (body.target_type == null) errors.push("targetType: Target type cannot be null.");
  if (withChatIds) {
    const ids = body.chat_ids;
    if (ids == null || ids.length === 0) errors.push("chatIds: List of chat IDs cannot be empty.");
    if (ids != null && (ids.length < 1 || ids.length > 100)) {
      errors.push("chatIds: Number of chat IDs must be between 1 and 100.");
    }
  }
  if (errors.length) throw new InvalidDataException(errors.join(", "));
  return body as ValidatedRequest;
}

function validateMoveType(sourceType: ChatTurnContainerType, targetType: ChatTurnContainerType): void {
  if (sourceType === ChatTurnContainerType.PROJECT && targetType === ChatTurnContainerType.DATASET) {
    throw new IllegalInputException("Moving between PROJECT and DATASET is currently not supported");
  }
}

function validateSourceAndTarget(r: ValidatedRequest): void {
  if (r.source_id === r.target_id && r.source_type === r.target_type) {
    console.warn(`Attempt to copy chats within the same container: ${r.source_id}`);
    throw new RuntimeException('400 BAD_REQUEST "Source and target IDs cannot be the same."');
  }
}

function logCopyResult(response: CopyChatsResponseDTO, userId: string): void {
  if (response.failedToCopyCount > 0 && response.successfullyCopiedCount === 0) {
    console.warn(`Chat copy operation for user '${userId}' resulted in all requested chats failing to copy.`);
  } else {
    console.log(
      `Chat copy operation for user '${userId}' completed. Success: ${response.successfullyCopiedCount}, Failed: ${response.failedToCopyCount}`,
    );
  }
}

app.post("/data-transfer", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const body = await jsonBody<CopySelectedChatsRequestDTO>(c);
  const request = validate(body, true);
  validateSourceAndTarget(request);
  const response = await DataTransferOperationsService.copySelectedChatsFromProjectToProject(
    ctx,
    request.source_id,
    request.target_id,
    body.chat_ids ?? null,
    user,
  );
  logCopyResult(response, user.id);
  return c.json(response, 200);
});

app.post("/data-transfer/all", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const request = validate(await jsonBody<CopyAllChatsRequestDTO>(c), false);
  validateSourceAndTarget(request);
  const response = await DataTransferOperationsService.copyAllChatsFromProjectToProject(
    ctx,
    request.source_id,
    request.target_id,
    user,
  );
  logCopyResult(response, user.id);
  return c.json(response, 200);
});

app.post("/data-transfer/move", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const body = await jsonBody<MoveChatsRequestDTO>(c);
  const request = validate(body, true);
  validateMoveType(request.source_type, request.target_type);
  validateSourceAndTarget(request);
  const response = await DataTransferOperationsService.moveChatsFromSourceToTarget(
    ctx,
    request.source_id,
    request.target_id,
    body.chat_ids ?? null,
    user,
  );
  return c.json(response, 200);
});

/** As in Java, "move all" passes no chat ids, so it always answers "No chat IDs provided to move.". */
app.post("/data-transfer/move/all", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const request = validate(await jsonBody<MoveChatsRequestDTO>(c), false);
  validateMoveType(request.source_type, request.target_type);
  validateSourceAndTarget(request);
  const response = await DataTransferOperationsService.moveChatsFromSourceToTarget(
    ctx,
    request.source_id,
    request.target_id,
    null,
    user,
  );
  return c.json(response, 200);
});

export default app;
