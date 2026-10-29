/** Port of domain/inference/dto/GenerateTurnBRequestDTO (@JsonNaming SnakeCase). */
export interface GenerateTurnBRequestDTO {
  /** @NotEmpty(message = "modelId is required") */
  model_id?: string | null;
}

/** Bean validation as Spring reported it (MethodArgumentNotValidException "field: message"). */
export function validate(dto: GenerateTurnBRequestDTO): string[] {
  return dto.model_id == null || dto.model_id === "" ? ["modelId: modelId is required"] : [];
}
