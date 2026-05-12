export interface AILanguageModel {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
  clone(): Promise<AILanguageModel>;
  readonly contextWindow: number;
  readonly contextUsage: number;
  addEventListener(event: string, listener: Function): void;
  removeEventListener(event: string, listener: Function): void;
}
