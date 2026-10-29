/**
 * Not a Java class. JSON builders for the DTOs nested in ChatTurnDTO / ModelResponseDTO that are
 * owned by other packages (model/dto/ModelDTO, analytics/inference/dto/InferenceMonitoringDTO,
 * evaluator/human/dto/HumanEvalScoreDTO, evaluation/dto/LLMEvaluationDTO,
 * evaluation/dto/PointwiseHeuristicEvaluationDTO, evaluation/EvaluationScoreHelper,
 * evaluation/dto/EvaluationPointwiseHeuristicScoreHelper). They work on the graph loaded by
 * chatturn/LoadedChatTurn and reproduce exactly what Jackson wrote for those classes (including
 * the extra properties produced by Lombok getters, e.g. "tagLinkTargetType", "turnPromptTokens",
 * "apiKeyPresent"). Kept here so ChatTurnDTO does not depend on how other packages model loaded
 * relations.
 */
import type { HumanCategoryOptionJson } from "../../../entities/HumanEvaluator";
import type { InferenceMonitoring } from "../../../entities/InferenceMonitoring";
import type { Model } from "../../../entities/Model";
import { isCustomEndpoint } from "../../../entities/Model";
import { EvaluationStatusEnum, EvaluationStatusEnumKey, getValueByKey } from "../../../enums/EvaluationStatusEnum";
import type { ModelProvider } from "../../../enums/ModelProvider";
import type { ModelType } from "../../../enums/ModelType";
import { ScoringMechanismType } from "../../../enums/ScoringMechanismType";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { CATEGORY_PATTERN } from "../../../util/EvaluationPatternUtil";
import { convertJsonStringToList, convertJsonStringToMap } from "../../../util/ObjectMapperUtil";
import { ADDITIONAL_HEADERS, API_KEY_PROPERTY_NAME, DEFAULT_EVALUATOR_CATEGORY_COLOR } from "../../../util/PlanckConstants";
import type { TagDTO } from "../../tags/dto/TagDTO";
import { markTaggable } from "../../tags/dto/Taggable";
import type {
  LoadedHumanEvalScore,
  LoadedPointwiseHeuristicEvaluationScore,
  LoadedScoreV2,
} from "../LoadedChatTurn";

/** java.lang.Double.toString. */
export function javaDoubleToString(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
  if (n === 0) return Object.is(n, -0) ? "-0.0" : "0.0";
  const abs = Math.abs(n);
  if (abs >= 1e-3 && abs < 1e7) {
    const s = String(n);
    return s.includes(".") ? s : `${s}.0`;
  }
  const [mantissa, exp] = n.toExponential().split("e");
  return `${mantissa.includes(".") ? mantissa : `${mantissa}.0`}E${Number(exp)}`;
}

// ---------------------------------------------------------------------------------------------
// model/dto/ModelDTO — the one-argument constructor `new ModelDTO(model)`.

export interface ModelDTO {
  id: string | null;
  name: string | null;
  provider: ModelProvider | null;
  label: string | null;
  nickname: string | null;
  url: string | null;
  tag: string | null;
  description: string | null;
  comments: string | null;
  properties: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  descriptors: Record<string, unknown> | null;
  is_api_key_present: boolean;
  is_deprecated: boolean;
  model_type: ModelType | null;
  release_date: string | null;
  is_custom_endpoint: boolean | null;
  api_key: string | null;
  additional_headers: Record<string, string> | null;
  /** Lombok `isApiKeyPresent()` getter, serialised next to the annotated field. */
  apiKeyPresent: boolean;
  /** Lombok `isDeprecated()` getter, serialised next to the annotated field. */
  deprecated: boolean;
}

export function newModelDTO(model: Model): ModelDTO {
  const custom = isCustomEndpoint(model);
  const dto: ModelDTO = {
    id: model.id,
    name: model.name,
    provider: model.provider,
    label: model.label,
    nickname: model.label,
    url: model.url,
    tag: null,
    description: model.description,
    comments: model.comments,
    properties: convertJsonStringToMap(model.properties),
    pricing: null,
    descriptors: convertJsonStringToMap(model.descriptors),
    is_api_key_present: false,
    is_deprecated: !!model.isDeprecated,
    model_type: model.type,
    release_date: model.releaseDate,
    is_custom_endpoint: custom,
    api_key: null,
    additional_headers: null,
    apiKeyPresent: false,
    deprecated: !!model.isDeprecated,
  };
  if (custom) {
    const props = convertJsonStringToMap(model.properties);
    if (props) {
      if (API_KEY_PROPERTY_NAME in props) dto.api_key = props[API_KEY_PROPERTY_NAME] as string;
      if (ADDITIONAL_HEADERS in props) dto.additional_headers = props[ADDITIONAL_HEADERS] as Record<string, string>;
    }
    dto.is_api_key_present = true;
    dto.apiKeyPresent = true;
  }
  return dto;
}

// ---------------------------------------------------------------------------------------------
// analytics/inference/dto/InferenceMonitoringDTO (Taggable INFERENCE_MONITORING).

export interface InferenceMonitoringDTO {
  id: string | null;
  turn_latency: number | null;
  turn_prompt_tokens: number | null;
  turn_completion_tokens: number | null;
  turn_total_tokens: number | null;
  avg_chat_latency: number | null;
  chat_total_prompt_tokens: number | null;
  chat_total_completion_tokens: number | null;
  chat_total_tokens: number | null;
  tags: TagDTO[] | null;
  /** Field `TurnPromptTokens` + Lombok getter `getTurnPromptTokens()` → a second property. */
  turnPromptTokens: number | null;
}

export function newInferenceMonitoringDTO(im: InferenceMonitoring): InferenceMonitoringDTO {
  return markTaggable(
    {
      id: im.id,
      turn_latency: im.turnTimeTaken,
      turn_prompt_tokens: im.turnPromptTokens,
      turn_completion_tokens: im.turnCompletionTokens,
      turn_total_tokens: im.turnTotalTokens,
      avg_chat_latency: im.avgChatLatency,
      chat_total_prompt_tokens: im.chatTotalPromptTokens,
      chat_total_completion_tokens: im.chatTotalCompletionTokens,
      chat_total_tokens: im.chatTotalTokens,
      tags: null,
      turnPromptTokens: im.turnPromptTokens,
    },
    TagLinkTargetType.INFERENCE_MONITORING,
    im.id,
  );
}

// ---------------------------------------------------------------------------------------------
// evaluator/human/dto/HumanEvalScoreDTO (snake_case, nulls included).

export interface HumanEvalScoreDTO {
  id: string | null;
  created_at: string | null;
  updated_at: string | null;
  score: number | null;
  notes: string | null;
  model_response_id: string | null;
  user_id: string | null;
  human_evaluator_id: string | null;
  category_name: string | null;
}

export function newHumanEvalScoreDTO(score: LoadedHumanEvalScore): HumanEvalScoreDTO {
  let categoryName: string | null = null;
  const evaluator = score.humanEvaluator;
  if (evaluator && evaluator.scoringMechanismType === ScoringMechanismType.CATEGORY) {
    const categories = convertJsonStringToList<HumanCategoryOptionJson>(evaluator.categories);
    for (const c of categories ?? []) {
      if (c.score === score.score) {
        categoryName = c.categoryName;
        break;
      }
    }
  }
  return {
    id: score.id,
    created_at: score.createdAt,
    updated_at: score.updatedAt,
    score: score.score,
    notes: score.notes,
    model_response_id: score.modelResponseId,
    user_id: score.userId,
    human_evaluator_id: score.humanEvaluatorId,
    category_name: categoryName,
  };
}

// ---------------------------------------------------------------------------------------------
// evaluation/EvaluationScoreHelper + LLMEvaluationDTO

export interface LLMEvaluationDTO {
  evaluator_id: string | null;
  score: string | null;
  llmResponse: string | null;
  reasoning: string | null;
  failureReason: string | null;
  category: string | null;
  evaluationStatus: string | null;
  evaluationStatusText: string | null;
  color: string | null;
}

const UNKNOWN_EVALUATOR = "Unknown Evaluator";
const FAILED_KEY = EvaluationStatusEnumKey[EvaluationStatusEnum.FAILED];

function scoreDataString(s: LoadedScoreV2): string | null {
  return s.score != null ? javaDoubleToString(s.score) : null;
}

function matchCategory(llmResponse: string | null, group: 1 | 2): string | null {
  if (llmResponse == null || llmResponse === "") return null;
  const m = new RegExp(CATEGORY_PATTERN.source, CATEGORY_PATTERN.flags.replace("g", "")).exec(llmResponse);
  if (!m) return null;
  return group === 2 ? (m[2] ?? "").trim() : (m[1] ?? null);
}

function resolveColor(outputCategoriesJson: string | null, scoreValue: string | null): string {
  if (outputCategoriesJson == null || scoreValue == null) return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  const categories = convertJsonStringToList<{ value?: unknown; color?: string | null }>(outputCategoriesJson);
  if (categories == null) return DEFAULT_EVALUATOR_CATEGORY_COLOR;
  const hit = categories.find((c) => c.value != null && scoreValue === String(c.value));
  // `.map(getColor).findFirst()` on a null color throws in Java (Optional.of(null)); treat as default.
  return hit?.color ?? DEFAULT_EVALUATOR_CATEGORY_COLOR;
}

/** `new EvaluationScoreHelper(scores)`: the `scores` and `evaluationStatuses` maps. */
export function evaluationScoreMaps(scores: LoadedScoreV2[]): {
  scores: Record<string, string | null>;
  evaluationStatuses: Record<string, string>;
} {
  const out = { scores: {} as Record<string, string | null>, evaluationStatuses: {} as Record<string, string> };
  for (const s of scores) {
    let name = UNKNOWN_EVALUATOR;
    let statusValue = "";
    if (s.evaluationStatus) {
      statusValue = s.evaluationStatus.status != null ? String(s.evaluationStatus.status) : "";
      if (s.llmEvaluator) name = s.llmEvaluator.name ?? "null";
    }
    out.scores[name] = scoreDataString(s) ?? s.llmResponse;
    out.evaluationStatuses[name] = statusValue;
  }
  return out;
}

/** `EvaluationScoreHelper.getLLMScores()`. */
export function getLLMScores(scores: LoadedScoreV2[]): Record<string, LLMEvaluationDTO> {
  const out: Record<string, LLMEvaluationDTO> = {};
  for (const s of scores) {
    if (!s.llmEvaluator) continue;
    const scoreValue = scoreDataString(s);
    const dto: LLMEvaluationDTO = {
      evaluator_id: s.llmEvaluator.id,
      score: scoreValue ?? "NaN",
      llmResponse: s.llmResponse,
      reasoning: matchCategory(s.llmResponse, 2),
      failureReason: null,
      category: matchCategory(s.llmResponse, 1),
      evaluationStatus: "",
      evaluationStatusText: "",
      color: resolveColor(s.llmEvaluator.outputCategories, scoreValue),
    };
    const status = s.evaluationStatus;
    if (status && status.status != null) {
      dto.evaluationStatus = String(status.status);
      if (status.status === FAILED_KEY) {
        if (status.comments != null) {
          dto.failureReason = status.comments;
          if (dto.reasoning == null) dto.reasoning = status.comments;
        } else {
          dto.failureReason = status.reason;
        }
      }
      dto.evaluationStatusText = getValueByKey(status.status);
    }
    out[s.llmEvaluator.name ?? "null"] = dto;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// evaluation/dto/EvaluationPointwiseHeuristicScoreHelper + PointwiseHeuristicEvaluationDTO

export interface PointwiseHeuristicEvaluationDTO {
  evaluator_id: string | null;
  /** Lombok `isMatch()` getter of the `boolean isMatch` field. */
  match: boolean;
  failureReason: string | null;
  evaluationStatus: string | null;
  evaluationStatusText: string | null;
}

/** `new EvaluationPointwiseHeuristicScoreHelper(scores).getEvaluationStatuses()`. */
export function pointwiseHeuristicEvaluationStatuses(
  scores: LoadedPointwiseHeuristicEvaluationScore[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of scores) {
    let name = UNKNOWN_EVALUATOR;
    let statusValue = "";
    if (s.evaluationStatus) {
      statusValue = s.evaluationStatus.status != null ? String(s.evaluationStatus.status) : "";
      if (s.pointwiseEvaluator) name = s.pointwiseEvaluator.name ?? "null";
    }
    out[name] = statusValue;
  }
  return out;
}

/** `EvaluationPointwiseHeuristicScoreHelper.getPointwiseHeuristicScores()`. */
export function getPointwiseHeuristicScores(
  scores: LoadedPointwiseHeuristicEvaluationScore[],
): Record<string, PointwiseHeuristicEvaluationDTO> {
  const out: Record<string, PointwiseHeuristicEvaluationDTO> = {};
  for (const s of scores) {
    if (!s.pointwiseEvaluator) continue;
    const dto: PointwiseHeuristicEvaluationDTO = {
      evaluator_id: s.pointwiseEvaluator.id,
      match: !!s.isMatch,
      failureReason: null,
      evaluationStatus: "",
      evaluationStatusText: "",
    };
    const status = s.evaluationStatus;
    if (status && status.status != null) {
      dto.evaluationStatus = String(status.status);
      if (status.status === FAILED_KEY) dto.failureReason = status.comments ?? status.reason;
      dto.evaluationStatusText = getValueByKey(status.status);
    }
    out[s.pointwiseEvaluator.name ?? "null"] = dto;
  }
  return out;
}
