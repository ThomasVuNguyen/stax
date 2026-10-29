import type { CopyChatErrorDetailDTO } from "./CopyChatErrorDetailDTO";

/** Port of domain/datatransfer/dto/CopyChatsResponseDTO (no @JsonNaming: camelCase JSON names). */
export interface CopyChatsResponseDTO {
  message: string;
  successfullyCopiedCount: number;
  failedToCopyCount: number;
  /** original chat id → new chat id */
  copiedChatIdMappings: Record<string, string>;
  errors: CopyChatErrorDetailDTO[];
}

export function create(
  message: string,
  successfullyCopiedCount: number,
  failedToCopyCount: number,
  copiedChatIdMappings: Record<string, string>,
  errors: CopyChatErrorDetailDTO[],
): CopyChatsResponseDTO {
  return { message, successfullyCopiedCount, failedToCopyCount, copiedChatIdMappings, errors };
}
