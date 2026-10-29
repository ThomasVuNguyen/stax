import type { CopyChatErrorDetailDTO } from "./CopyChatErrorDetailDTO";

/**
 * Port of domain/datatransfer/dto/MoveChatsResponseDTO (snake_case). The nested
 * CopyChatErrorDetailDTO keeps its own camelCase names.
 */
export interface MoveChatsResponseDTO {
  message: string;
  successfully_moved_count: number;
  failed_to_move_count: number;
  errors: CopyChatErrorDetailDTO[];
}

export function create(
  message: string,
  successfullyMovedCount: number,
  failedToMoveCount: number,
  errors: CopyChatErrorDetailDTO[],
): MoveChatsResponseDTO {
  return {
    message,
    successfully_moved_count: successfullyMovedCount,
    failed_to_move_count: failedToMoveCount,
    errors,
  };
}
