/** Port of domain/inference/outputs/GenerateOutputsStrategy (abstract; all steps are async here). */
export abstract class GenerateOutputsStrategy<T> {
  abstract generateOutputs(ids: string[]): Promise<T>;

  protected abstract validateInputs(): Promise<void>;

  protected abstract duplicateChats(): Promise<void>;

  protected abstract sendToQueue(): Promise<void>;
}
