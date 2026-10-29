/**
 * Port of domain/project/EvaluationContainerService(+Impl). Signatures mirror Java
 * (`User user` → any `{ id }`); the request-scoped ones also accept the user being omitted
 * (`(ctx, containerId)` → `requireUser(ctx)`), as some callers use that form.
 *
 * Overloads:
 * - `getContainerForUser(user, id)` → `getContainerForUser(ctx, [user,] containerId)` (NotFound
 *   unless the container belongs to the user);
 * - `getContainerForUser(user, id, Class<T>)` → `getContainerForUserOfType(ctx, user, containerId,
 *   type)` where `type` is "PROJECT", "DATASET" or null (= EvaluationContainer, any subtype);
 * - `deleteContainer(user, id)` → `deleteContainer(ctx, [user,] containerId)`;
 * - `deleteContainer(container)` → `deleteContainerEntity(ctx, container)` (acts as the container's
 *   owner, `container.userId`).
 */
import type { Ctx } from "../../lib/ctx";
import { requireUser } from "../../lib/ctx";
import { NotFoundException, RuntimeException } from "../../lib/errors";
import type { EvaluationContainer } from "../../entities/EvaluationContainer";
import type { DataSet } from "../../entities/DataSet";
import type { Project } from "../../entities/Project";
import * as ChatRepository from "../chat/ChatRepository";
import * as ChatService from "../chat/service/ChatService";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as EvaluationMonitoringRepository from "../evaluationmonitoring/EvaluationMonitoringRepository";
import * as ScoreV2Repository from "../evaluation/ScoreV2Repository";
import * as InferenceMonitoringRepository from "../inferencemonitoring/InferenceMonitoringRepository";
import * as JobStatusService from "../job/JobStatusService";
import * as ModelResponseRepository from "../modelresponse/ModelResponseRepository";
import * as EvaluationContainerRepository from "./EvaluationContainerRepository";

type ContainerType = "PROJECT" | "DATASET";
type UserRef = { id: string | null };

/** `(user, id)` or `(id)` argument forms. */
function userAndId(ctx: Ctx, a: UserRef | string, b?: string): [UserRef, string] {
  return typeof a === "string" ? [requireUser(ctx), a] : [a, b as string];
}

export async function getContainerForUserOfType(ctx: Ctx, user: UserRef, containerId: string, type: "PROJECT"): Promise<Project>;
export async function getContainerForUserOfType(ctx: Ctx, user: UserRef, containerId: string, type: "DATASET"): Promise<DataSet>;
export async function getContainerForUserOfType(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  type: ContainerType | null,
): Promise<EvaluationContainer>;
export async function getContainerForUserOfType(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  type: ContainerType | null,
): Promise<EvaluationContainer> {
  const container = await EvaluationContainerRepository.findById(ctx.db, containerId);
  if (!container) throw new NotFoundException("Container not found for id: " + containerId);
  // java.lang.SecurityException / IllegalArgumentException → RuntimeException handler (500).
  if (container.userId !== user.id) {
    throw new RuntimeException("User does not have access to this container.");
  }
  if (type && container.containerType !== type) {
    throw new RuntimeException(
      "Container is not of expected type " + (type === "PROJECT" ? "Project" : "DataSet"),
    );
  }
  return container;
}

export async function getContainerForUser(ctx: Ctx, user: UserRef, containerId: string): Promise<EvaluationContainer>;
export async function getContainerForUser(ctx: Ctx, containerId: string): Promise<EvaluationContainer>;
export async function getContainerForUser(ctx: Ctx, a: UserRef | string, b?: string): Promise<EvaluationContainer> {
  const [user, containerId] = userAndId(ctx, a, b);
  const container = await EvaluationContainerRepository.findByIdAndUser(ctx.db, containerId, user.id as string);
  if (!container) throw new NotFoundException("Container not found for id: " + containerId);
  return container;
}

export async function deleteContainer(ctx: Ctx, user: UserRef, containerId: string): Promise<void>;
export async function deleteContainer(ctx: Ctx, containerId: string): Promise<void>;
export async function deleteContainer(ctx: Ctx, a: UserRef | string, b?: string): Promise<void> {
  const [user, containerId] = userAndId(ctx, a, b);
  const container = await getContainerForUserOfType(ctx, user, containerId, null);
  await deleteContainerEntity(ctx, container);
}

/**
 * Deletes the container and everything that hangs off it, in the Java order. D1 has no
 * transactions, so a failure part-way leaves the already deleted rows deleted.
 */
export async function deleteContainerEntity(ctx: Ctx, container: EvaluationContainer): Promise<void> {
  const db = ctx.db;
  const containerId = container.id as string;
  const ownerId = container.userId as string;

  const chatTurnsToBeDeleted = await ChatTurnRepository.findAllByUserAndChatContainer(db, ownerId, containerId);
  await ChatService.delete(ctx, chatTurnsToBeDeleted);

  // There might be orphan chats, without any turns, which were not deleted above.
  const chatsToBeDeleted = await ChatRepository.findAllByContainer(db, containerId);
  if (chatsToBeDeleted.length) await ChatRepository.deleteAll(db, chatsToBeDeleted);

  await JobStatusService.deleteByProjectIdAndUserId(ctx, containerId, { id: ownerId });
  await ModelResponseRepository.deleteAllByContainer(db, containerId);
  await InferenceMonitoringRepository.clearEvaluationContainerReference(db, containerId);

  // EvaluationMonitoringService.deleteEvaluationMonitoringAndRelatedScores(container, user).
  const monitorings = await EvaluationMonitoringRepository.findEvaluationMonitoringByContainerAndUser(
    db,
    containerId,
    ownerId,
  );
  await ScoreV2Repository.deleteByEvaluationMonitoringIn(
    db,
    monitorings.map((m) => m.id).filter((x): x is string => !!x),
  );
  await EvaluationMonitoringRepository.deleteAll(db, monitorings);

  const numDeleted = await EvaluationContainerRepository.deleteByUserAndId(db, ownerId, containerId);
  if (numDeleted !== 1) throw new NotFoundException(containerId + " can't be found");
}
