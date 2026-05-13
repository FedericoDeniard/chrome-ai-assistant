export interface AILanguageModel {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  append(input: { role: 'user' | 'assistant'; content: string }[]): Promise<void>;
  destroy(): void;
  clone(): Promise<AILanguageModel>;
  readonly contextWindow: number;
  readonly contextUsage: number;
  readonly inputQuota: number;
  readonly inputUsage: number;
  readonly tokensSoFar?: number;
  readonly tokensLeft?: number;
  addEventListener(event: string, listener: Function): void;
  removeEventListener(event: string, listener: Function): void;
}
