export const UserStatus = {
  ACTIVE: "ACTIVE",
  PENDING_DELETION: "PENDING_DELETION",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Declaration order (`UserStatus.values()`). */
export const UserStatusValues: UserStatus[] = [UserStatus.ACTIVE, UserStatus.PENDING_DELETION];
