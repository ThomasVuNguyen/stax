/** Port of domain/project/dto/CreateProjectCommand (record). */
import type { EvaluationType } from "../../../enums/EvaluationType";

export interface CreateProjectCommand {
  projectId: string | null;
  name: string | null;
  description: string | null;
  isDefaultProject: boolean;
  type: EvaluationType | null;
}
