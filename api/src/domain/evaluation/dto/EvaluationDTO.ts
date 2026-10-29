/**
 * Port of domain/evaluation/dto/EvaluationDTO: the payload of the `llm-eval` and `heuristic-eval`
 * queue jobs (Jackson default naming, camelCase). Implements JobIdentifiable through `jobId`.
 */
export interface EvaluationDTO {
  evaluatorId: string | null;
  chatTurnId: string | null;
  chatturnIdB: string | null;
  pairId: string | null;
  modelResponseId: string | null;
  jobId: string | null;
  userId: string | null;
  comments: string | null;
  scoreId: string | null;
  evaluationStatusId: string | null;
  reason: string | null;
  containerId: string | null;
}

/** `new EvaluationDTO()` / builder: every field null unless given. */
export function create(init: Partial<EvaluationDTO> = {}): EvaluationDTO {
  return {
    evaluatorId: null,
    chatTurnId: null,
    chatturnIdB: null,
    pairId: null,
    modelResponseId: null,
    jobId: null,
    userId: null,
    comments: null,
    scoreId: null,
    evaluationStatusId: null,
    reason: null,
    containerId: null,
    ...init,
  };
}
