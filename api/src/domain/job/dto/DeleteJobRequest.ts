/**
 * Port of domain/job/dto/DeleteJobRequest (JSON `job_ids`). `validate` applies @NotNull and
 * @NoBlankListStrings; Spring reported the Java field name (`jobsId`).
 */
import { checkNoBlankListStrings } from "../../../annotation/NoBlankListStrings";
import { InvalidDataException } from "../../../lib/errors";
import { bindStringList } from "../../model/dto/jsonBinding";

export interface DeleteJobRequest {
  job_ids: (string | null)[] | null;
}

export function fromJson(body: Record<string, unknown>): DeleteJobRequest {
  return { job_ids: bindStringList(body.job_ids) };
}

export function validate(req: DeleteJobRequest): void {
  if (req.job_ids == null) throw new InvalidDataException("jobsId: Job ids can not be empty");
  const err = checkNoBlankListStrings(req.job_ids, "jobsId", "Job ids list contains blank value");
  if (err) throw new InvalidDataException(err);
}
