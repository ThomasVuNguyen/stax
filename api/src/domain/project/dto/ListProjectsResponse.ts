/** Port of domain/project/dto/ListProjectsResponse. */
import type { ProjectDTO } from "./ProjectDTO";

export interface ListProjectsResponse {
  projects: ProjectDTO[] | null;
}
