/** Port of domain/pubsub/IScoreService: a queue worker for one EvaluationDTO. */
import type { Ctx } from "../../lib/ctx";
import type { EvaluationDTO } from "../evaluation/dto/EvaluationDTO";

export interface IScoreService {
  process(ctx: Ctx, evaluationDTO: EvaluationDTO): Promise<void>;
}
