/**
 * Port of domain/apikeys/dto/ApiKeysResponseDTO. Lombok generated `isOpenaiKeyPresent()` getters
 * for the `isXxxKeyPresent` booleans, so Jackson emitted `openaiKeyPresent`, ... (no `is` prefix).
 */
export interface ApiKeysResponseDTO {
  openaiKeyPresent: boolean;
  mistralKeyPresent: boolean;
  googleKeyPresent: boolean;
  anthropicKeyPresent: boolean;
  grokKeyPresent: boolean;
  ollamaKeyPresent: boolean;
  deepseekKeyPresent: boolean;
  huggingfaceKeyPresent: boolean;
  llamaKeyPresent: boolean;
}

/** `new ApiKeysResponseDTO()` / builder defaults: every flag false. */
export function create(init: Partial<ApiKeysResponseDTO> = {}): ApiKeysResponseDTO {
  return {
    openaiKeyPresent: false,
    mistralKeyPresent: false,
    googleKeyPresent: false,
    anthropicKeyPresent: false,
    grokKeyPresent: false,
    ollamaKeyPresent: false,
    deepseekKeyPresent: false,
    huggingfaceKeyPresent: false,
    llamaKeyPresent: false,
    ...init,
  };
}
