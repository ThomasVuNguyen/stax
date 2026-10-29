/** Port of user/dto/UserDeletionDTO: the `user-deletion` queue payload (snake_case JSON). */
export interface DeletionStep {
  table_name: string;
}

export interface UserDeletionDTO {
  request_id: string | null;
  user_id: string | null;
  deletion_steps: DeletionStep[];
}
