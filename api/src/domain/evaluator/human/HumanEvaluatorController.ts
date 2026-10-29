/** Port of domain/evaluator/human/HumanEvaluatorController (`/human-evaluators`). */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../../../env";
import { type LinkedEntityType, LinkedEntityTypeValues } from "../../../enums/LinkedEntityType";
import { HumanEvalRangeDataTypeValues } from "../../../enums/HumanEvalRangeDataType";
import { ScopeTypeValues } from "../../../enums/ScopeType";
import { ScoringMechanismTypeValues } from "../../../enums/ScoringMechanismType";
import { currentUser } from "../../../lib/auth";
import { ctxFromHono } from "../../../lib/ctx";
import { IllegalInputException, NotFoundException } from "../../../lib/errors";
import { queryEnum } from "../../../lib/http";
import { parseJavaDouble } from "../../../util/NumberUtil";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import { bindEnum, bindString, requiredJsonBody } from "../../model/dto/jsonBinding";
import * as HumanEvaluatorService from "./service/HumanEvaluatorService";
import type { HumanCategoryOption } from "./dto/HumanCategoryOption";
import { fromHumanEvalScore } from "./dto/HumanEvalScoreDTO";
import { fromHumanEvaluator } from "./dto/HumanEvaluatorDTO";
import type { HumanRangeOption } from "./dto/HumanRangeOption";

const app = new Hono<AppEnv>();
const ENUMS = "com.planck.planck.enums.";

/** A missing required @RequestParam (MissingServletRequestParameterException → generic 500 handler). */
function requiredParam(c: Context, name: string, javaType: string): string {
  const v = c.req.query(name);
  if (v === undefined) throw new Error(`Required request parameter '${name}' for method parameter type ${javaType} is not present`);
  return v;
}

app.post("/human-evaluators", async (c) => {
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.human.dto.HumanEvaluatorDTO");
  const e = await HumanEvaluatorService.createEvaluator(
    ctxFromHono(c),
    currentUser(c),
    bindString(body.name),
    bindString(body.description),
    bindEnum(body.scoringMechanismType, ScoringMechanismTypeValues, `${ENUMS}ScoringMechanismType`),
    bindString(body.associatedEntityId),
    bindString(body.entityType),
    (body.categories as HumanCategoryOption[] | null | undefined) ?? null,
    bindEnum(body.linkedEntityType, LinkedEntityTypeValues, `${ENUMS}LinkedEntityType`),
  );
  return c.json(fromHumanEvaluator(e), 200);
});

app.get("/human-evaluators/entity/:entityId", async (c) => {
  const list = await HumanEvaluatorService.getEvaluatorsByEntityId(ctxFromHono(c), c.req.param("entityId"));
  return c.json(list.map(fromHumanEvaluator), 200);
});

app.get("/human-evaluators/type/:entityType", async (c) => {
  const entityType = c.req.param("entityType");
  if (!(LinkedEntityTypeValues as string[]).includes(entityType)) {
    throw new IllegalInputException(
      `Invalid value '${entityType}' for parameter 'entityType'. Allowed values are: [${LinkedEntityTypeValues.join(", ")}]`,
    );
  }
  const list = await HumanEvaluatorService.getEvaluatorsByEntityType(ctxFromHono(c), entityType as LinkedEntityType);
  return c.json(list.map(fromHumanEvaluator), 200);
});

/** `{userId}` is ignored: the current user's evaluators are returned. */
app.get("/human-evaluators/users/:userId", async (c) => {
  const list = await HumanEvaluatorService.getUserEvaluators(ctxFromHono(c), currentUser(c));
  return c.json(list.map(fromHumanEvaluator), 200);
});

app.get("/human-evaluators/chat-turns/:chatTurnId/feedback", async (c) => {
  return c.json(await HumanEvaluatorService.getChatTurnFeedbacks(ctxFromHono(c), c.req.param("chatTurnId")), 200);
});

app.delete("/human-evaluators/feedback/:scoreId", async (c) => {
  await HumanEvaluatorService.deleteHumanEvalScoreById(ctxFromHono(c), c.req.param("scoreId"), currentUser(c));
  return c.body(null, 204);
});

app.get("/human-evaluators/:evaluatorId", async (c) => {
  const e = await HumanEvaluatorService.findByIdAndUser(ctxFromHono(c), c.req.param("evaluatorId"), currentUser(c));
  return c.json(fromHumanEvaluator(e), 200);
});

app.get("/human-evaluators", async (c) => {
  const scopeType = queryEnum(c, "scopeType", ScopeTypeValues);
  const scoringMechanismType = queryEnum(c, "scoringMechanismType", ScoringMechanismTypeValues);
  const list = await HumanEvaluatorService.getEvaluators(ctxFromHono(c), currentUser(c), scopeType ?? null, scoringMechanismType ?? null);
  return c.json(list.map(fromHumanEvaluator), 200);
});

/** Creates or updates the user's score for the chat turn's model response (`?score=&notes=`). */
app.post("/human-evaluators/:evaluatorId/chat-turns/:chatTurnId/feedback", async (c) => {
  const raw = requiredParam(c, "score", "Double");
  let score: number | null;
  try {
    score = raw === "" ? null : parseJavaDouble(raw);
  } catch {
    throw new IllegalInputException("Invalid value for parameter 'score'");
  }
  if (score === null) throw new Error("Required request parameter 'score' for method parameter type Double is present but converted to null");
  const notes = c.req.query("notes") ?? null;
  const ctx = ctxFromHono(c);
  const user = currentUser(c);

  const chatTurn = await ChatTurnRepository.findByIdAndUser(ctx.db, c.req.param("chatTurnId"), user.id);
  if (!chatTurn) throw new NotFoundException("ChatTurn not found");
  if (!chatTurn.modelResponseId) throw new NotFoundException("ModelResponse not found");
  const evaluator = await HumanEvaluatorService.findByIdAndUser(ctx, c.req.param("evaluatorId"), user);
  const saved = await HumanEvaluatorService.createChatTurnFeedback(ctx, { id: chatTurn.modelResponseId }, evaluator, user, score, notes);
  return c.json(fromHumanEvalScore(saved, evaluator), 200);
});

app.put("/human-evaluators/:evaluatorId", async (c) => {
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.human.dto.HumanEvaluatorUpdateDTO");
  const e = await HumanEvaluatorService.updateEvaluator(
    ctxFromHono(c),
    c.req.param("evaluatorId"),
    currentUser(c),
    bindString(body.name),
    bindString(body.description),
    bindString(body.comments),
    bindEnum(body.scoringMechanismType, ScoringMechanismTypeValues, `${ENUMS}ScoringMechanismType`),
    bindEnum(body.linkedEntityType, LinkedEntityTypeValues, `${ENUMS}LinkedEntityType`),
  );
  return c.json(fromHumanEvaluator(e), 200);
});

/** `?name=&description=` plus a HumanRangeOption body. */
app.post("/human-evaluators/range", async (c) => {
  const name = requiredParam(c, "name", "String");
  const description = requiredParam(c, "description", "String");
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.human.dto.HumanRangeOption");
  const rangeOption = {
    ...body,
    valueType: bindEnum(body.valueType, HumanEvalRangeDataTypeValues, `${ENUMS}HumanEvalRangeDataType`),
  } as HumanRangeOption;
  const e = await HumanEvaluatorService.createRangeEvaluator(ctxFromHono(c), name, description, rangeOption, currentUser(c));
  return c.json(fromHumanEvaluator(e), 200);
});

app.post("/human-evaluators/:evaluatorId/deprecate", async (c) => {
  const e = await HumanEvaluatorService.deprecateEvaluator(ctxFromHono(c), c.req.param("evaluatorId"), currentUser(c));
  return c.json(fromHumanEvaluator(e), 200);
});

export default app;
