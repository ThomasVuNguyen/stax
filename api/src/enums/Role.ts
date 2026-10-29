export const Role = {
  USER: "USER",
  SYSTEM: "SYSTEM",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Declaration order (`Role.values()`). */
export const RoleValues: Role[] = [Role.USER, Role.SYSTEM];
