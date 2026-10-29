/**
 * Port of domain/pubsub/InferencePublisherService(+Impl).
 *
 * Java order per row: prepare (may duplicate the chat), publish, then create the PENDING
 * InferenceStatus. Here:
 * - without an outbox: prepare, create the PENDING status, then publish (status first so the
 *   queue consumer can never see the message before its status row exists);
 * - with an outbox (bulk paths): prepare + validate now, and `flushOutbox` later creates all
 *   PENDING statuses in batched writes and sends the messages with Queue.sendBatch. This keeps
 *   bulk requests over many rows within the Worker's subrequest / D1 query limits.
 * The message payload is the DTO as it was after preparation (no inference_status_id), as in Java.
 */
import type { Ctx } from "../../lib/ctx";
import { IllegalInputException } from "../../lib/errors";
import { InferenceStatusEnum } from "../../enums/InferenceStatusEnum";
import type { InferenceContext } from "../inference/dto/InferenceContext";
import type { InferenceDTO } from "../inference/dto/InferenceDTO";
import * as InferencePreparationService from "../inference/service/InferencePreparationService";
import type { LoadedChatTurn } from "../inference/service/ChatTurnGraph";
import * as InferenceStatusService from "../inferencestatus/InferenceStatusService";
import * as InferencePubsubDispatcher from "./InferencePubsubDispatcher";
import * as PubsubOutboundInferenceGateway from "./PubsubOutboundInferenceGateway";

export interface InferenceOutbox {
  entries: { dto: InferenceDTO; context: InferenceContext }[];
}

export function newOutbox(): InferenceOutbox {
  return { entries: [] };
}

async function send(
  ctx: Ctx,
  context: InferenceContext,
  dto: InferenceDTO,
  isBulk: boolean,
  outbox?: InferenceOutbox,
): Promise<void> {
  InferencePubsubDispatcher.checkDispatchable(context, isBulk);
  if (outbox) {
    outbox.entries.push({ dto, context });
    return;
  }
  await InferencePreparationService.createInferenceStatus(ctx, dto);
  await InferencePubsubDispatcher.dispatch(ctx, context, isBulk);
}

export async function sendInferenceUsingExistingModel(
  ctx: Ctx,
  chatTurn: LoadedChatTurn | null,
  dto: InferenceDTO,
  outbox?: InferenceOutbox,
): Promise<void> {
  const context = await InferencePreparationService.prepareUsingExistingModel(ctx, chatTurn, dto);
  await send(ctx, context, dto, false, outbox);
}

export async function sendInferenceWithModel(
  ctx: Ctx,
  chatTurn: LoadedChatTurn | null,
  dto: InferenceDTO,
  modelId: string,
  duplicateOnNoResponse: boolean,
  isBulk: boolean,
  outbox?: InferenceOutbox,
): Promise<void> {
  const context = await InferencePreparationService.prepareWithExplicitModel(
    ctx,
    chatTurn,
    dto,
    modelId,
    duplicateOnNoResponse,
  );
  await send(ctx, context, dto, isBulk, outbox);
}

/**
 * Creates the PENDING statuses of every collected entry (setting dto.inference_status_id) and
 * sends their messages in batches. Empties the outbox. Throws if the queue send fails; the
 * entries that were not sent are returned on the error as `unsent`.
 */
export async function flushOutbox(ctx: Ctx, outbox: InferenceOutbox): Promise<void> {
  const entries = outbox.entries.splice(0);
  if (!entries.length) return;
  const { missing } = await InferenceStatusService.createOrUpdateInferenceStatuses(
    ctx,
    entries.map((e) => e.dto),
    InferenceStatusEnum.PENDING,
  );
  const sendable = entries.filter((e) => !missing.includes(e.dto));
  try {
    await PubsubOutboundInferenceGateway.sendInferences(
      ctx,
      sendable.map((e) => e.context.payload),
    );
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { unsent: sendable.map((x) => x.dto) });
  }
  // Java published the message, then failed creating the status of a vanished chat turn.
  if (missing.length) throw new IllegalInputException("Chat turn not found");
}
