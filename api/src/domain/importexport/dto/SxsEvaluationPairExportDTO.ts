import type { SXSHumanEvalRatingExportDTO } from "./SXSHumanEvalRatingExportDTO";
import { type MessageExportDTO, nonEmpty } from "./message/BaseMessageExportDTO";

/** Port of domain/importexport/dto/SxsEvaluationPairExportDTO (@JsonInclude NON_EMPTY). */
export interface SxsEvaluationPairExportDTO {
  variables?: Record<string, string> | null;
  human_sxs_rating?: SXSHumanEvalRatingExportDTO[] | null;
  expected_output?: string | null;
  chat_a?: MessageExportDTO[] | null;
  chat_b?: MessageExportDTO[] | null;
}

/** `SxsEvaluationPairExportDTO.builder()...build()` serialised with NON_EMPTY, in index order. */
export function build(fields: {
  variables: Record<string, string> | null;
  humanSxsRatings: SXSHumanEvalRatingExportDTO[] | null;
  expectedOutput: string | null;
  chatA: MessageExportDTO[] | null;
  chatB: MessageExportDTO[] | null;
}): SxsEvaluationPairExportDTO {
  return nonEmpty({
    variables: fields.variables,
    human_sxs_rating: fields.humanSxsRatings,
    expected_output: fields.expectedOutput,
    chat_a: fields.chatA,
    chat_b: fields.chatB,
  });
}
