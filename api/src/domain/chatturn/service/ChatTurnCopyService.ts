/**
 * Port of domain/chatturn/service/ChatTurnCopyService + ChatTurnCopyServiceImpl.
 *
 * `copyAllChatTurnRelatedEntities(ctx, sourceToTargetTurnMap, user, tagsByTurnId)` deep-copies the
 * inputs, model response (with human scores, inference monitoring, LLM scores and their
 * evaluation monitoring / status) and CHAT_TURN tag links of each source turn onto its target
 * turn. Target turns must belong to already-saved chats. Java relied on the target turns being
 * managed entities (flushed at commit); here the target turns are saved (upsert) with their new
 * `modelResponseId` and their `turn_inputs`, in FK order.
 */
import type { Ctx } from "../../../lib/ctx";
import { allIn } from "../../../lib/db";
import * as ChatTurnEntity from "../../../entities/ChatTurn";
import type { ChatTurn } from "../../../entities/ChatTurn";
import * as EvaluationMonitoringEntity from "../../../entities/EvaluationMonitoring";
import type { EvaluationMonitoring } from "../../../entities/EvaluationMonitoring";
import * as EvaluationStatusEntity from "../../../entities/EvaluationStatus";
import type { EvaluationStatus } from "../../../entities/EvaluationStatus";
import * as HumanEvalScoreEntity from "../../../entities/HumanEvalScore";
import type { HumanEvalScore } from "../../../entities/HumanEvalScore";
import * as InferenceMonitoringEntity from "../../../entities/InferenceMonitoring";
import type { InferenceMonitoring } from "../../../entities/InferenceMonitoring";
import * as ModelInputEntity from "../../../entities/ModelInput";
import type { ModelInput } from "../../../entities/ModelInput";
import * as ModelResponseEntity from "../../../entities/ModelResponse";
import type { ModelResponse } from "../../../entities/ModelResponse";
import * as ScoreV2Entity from "../../../entities/ScoreV2";
import type { ScoreV2 } from "../../../entities/ScoreV2";
import { type TagLink, create as createTagLink } from "../../../entities/TagLink";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import * as ChatTurnRepository from "../ChatTurnRepository";
import { loadChatTurns } from "../LoadedChatTurn";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import * as HumanEvalScoreRepository from "../../evaluation/HumanEvalScoreRepository";
import * as ScoreV2Repository from "../../evaluation/ScoreV2Repository";
import * as EvaluationMonitoringRepository from "../../evaluationmonitoring/EvaluationMonitoringRepository";
import * as EvaluationStatusRepository from "../../evaluationstatus/EvaluationStatusRepository";
import * as TagLinkService from "../../tags/TagLinkService";

type UserRef = { id: string | null };

export async function copyAllChatTurnRelatedEntities(
  ctx: Ctx,
  sourceToTargetTurnMap: Map<ChatTurn, ChatTurn>,
  user: UserRef,
  tagsByTurnId: Map<string, TagLink[]> | Record<string, TagLink[]>,
): Promise<void> {
  const entries = [...sourceToTargetTurnMap.entries()];
  if (!entries.length) return;
  const tagsFor = (id: string | null): TagLink[] | undefined =>
    id == null ? undefined : tagsByTurnId instanceof Map ? tagsByTurnId.get(id) : tagsByTurnId[id];

  const sources = await loadChatTurns(ctx.db, entries.map(([s]) => s));
  const monitoringIds = [
    ...new Set(
      sources.flatMap((s) => s.modelResponse?.scores ?? []).map((s) => s.evaluationMonitoringId).filter((x): x is string => !!x),
    ),
  ];
  // score.getEvaluationMonitoring(): not user-scoped.
  const monitorings = new Map(
    (await allIn(ctx.db, (inn) => `SELECT * FROM evaluation_monitoring WHERE id IN ${inn}`, monitoringIds))
      .map(EvaluationMonitoringEntity.fromRow)
      .map((m) => [m.id, m]),
  );
  // targetTurn.getChat().getContainer()
  const targetChatIds = [...new Set(entries.map(([, t]) => t.chatId).filter((x): x is string => !!x))];
  const containerByChat = new Map(
    (await allIn<{ id: string; container_id: string | null }>(
      ctx.db,
      (inn) => `SELECT id, container_id FROM chat WHERE id IN ${inn}`,
      targetChatIds,
    )).map((r) => [r.id, r.container_id]),
  );

  const inputsByTarget: [ChatTurn, ModelInput[]][] = [];
  const responses: ModelResponse[] = [];
  const humanScores: HumanEvalScore[] = [];
  const inferences: InferenceMonitoring[] = [];
  const scores: ScoreV2[] = [];
  const evalMonitorings: EvaluationMonitoring[] = [];
  const statuses: EvaluationStatus[] = [];
  const tagLinks: TagLink[] = [];

  entries.forEach(([, target], i) => {
    const original = sources[i];
    const targetContainerId = (target.chatId && containerByChat.get(target.chatId)) ?? null;
    if (target.id == null) ChatTurnEntity.prePersist(target);

    // copyModelInputs
    inputsByTarget.push([target, original.inputs.map(ModelInputEntity.deepCopy)]);

    // copyModelResponses
    const originalResponse = original.modelResponse;
    if (originalResponse) {
      const newResponse = ModelResponseEntity.deepCopy(originalResponse, targetContainerId);
      ModelResponseEntity.prePersist(newResponse);
      target.modelResponseId = newResponse.id;
      responses.push(newResponse);

      for (const s of originalResponse.humanEvalScores) humanScores.push(HumanEvalScoreEntity.deepCopy(s, newResponse.id));

      if (originalResponse.inferenceMonitoring) {
        const im = InferenceMonitoringEntity.deepCopy(originalResponse.inferenceMonitoring, targetContainerId);
        im.userId = user.id;
        im.containerId = originalResponse.containerId; // as in Java: overrides the target container
        InferenceMonitoringEntity.prePersist(im);
        newResponse.inferenceMonitoringId = im.id;
        inferences.push(im);
      }

      for (const s of originalResponse.scores) {
        const newScore = ScoreV2Entity.deepCopy(s, newResponse.id);
        const em = s.evaluationMonitoringId ? monitorings.get(s.evaluationMonitoringId) : undefined;
        if (em && s.llmEvaluatorId) {
          const newEm = EvaluationMonitoringEntity.deepCopy(em);
          newEm.containerId = targetContainerId;
          newEm.evaluatorId = s.llmEvaluatorId;
          EvaluationMonitoringEntity.prePersist(newEm);
          newScore.evaluationMonitoringId = newEm.id;
          evalMonitorings.push(newEm);
        }
        if (s.evaluationStatus) {
          const status = EvaluationStatusEntity.deepCopy(s.evaluationStatus);
          if (targetContainerId != null) status.containerId = targetContainerId;
          status.userId = user.id;
          status.chatTurnId = target.id;
          EvaluationStatusEntity.prePersist(status);
          newScore.evaluationStatusId = status.id;
          statuses.push(status);
        }
        scores.push(newScore);
      }
    }

    // copyTags
    for (const link of tagsFor(original.id) ?? []) {
      tagLinks.push(
        createTagLink({ tagId: link.tagId, userId: link.userId, targetType: TagLinkTargetType.CHAT_TURN, targetId: target.id }),
      );
    }
  });

  await InferenceMonitoringRepository.saveAll(ctx.db, inferences);
  await ModelResponseRepository.saveAll(ctx.db, responses);
  await ChatTurnRepository.saveAll(ctx.db, entries.map(([, t]) => t));
  const inputStmts = inputsByTarget.flatMap(([t, inputs]) => ChatTurnRepository.saveInputsStmts(ctx.db, t.id as string, inputs));
  for (let i = 0; i < inputStmts.length; i += 50) await ctx.db.batch(inputStmts.slice(i, i + 50));
  await HumanEvalScoreRepository.saveAll(ctx.db, humanScores);
  await EvaluationMonitoringRepository.saveAll(ctx.db, evalMonitorings);
  await EvaluationStatusRepository.saveAll(ctx.db, statuses);
  await ScoreV2Repository.saveAll(ctx.db, scores);
  await TagLinkService.saveAll(ctx, tagLinks);
}
