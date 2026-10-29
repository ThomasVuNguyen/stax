/**
 * Port of domain/project/dto/CreateProject: a bean-validation group marker interface used by
 * `@Validated(CreateProject.class)` on POST /projects. ProjectDTO declares no constraint in that
 * group, so creating a project performs no bean validation.
 */
export type CreateProject = never;
