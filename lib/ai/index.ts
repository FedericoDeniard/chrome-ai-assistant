import type { AILanguageModel } from './types';

export type { AILanguageModel } from './types';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  language?: 'en' | 'es';
  acceptImages?: boolean;
}

function buildSessionConfig(options: ChatOptions) {
  const lang = options.language ?? 'es';
  const expectedInputs: any[] = [{ type: 'text', languages: [lang, lang] }];
  if (options.acceptImages) expectedInputs.push({ type: 'image' });
  const expectedOutputs: any[] = [{ type: 'text', languages: [lang] }];
  return { expectedInputs, expectedOutputs, lang };
}

export async function checkAvailability(options: ChatOptions = {}): Promise<'available' | 'downloading' | 'unavailable'> {
  try {
    const { expectedInputs, expectedOutputs, lang } = buildSessionConfig(options);
    const result = await LanguageModel.availability({ expectedInputs, expectedOutputs });
    return result as 'available' | 'downloading' | 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function createSession(options: ChatOptions = {}): Promise<AILanguageModel> {
  const available = await checkAvailability(options);
  if (available === 'unavailable') {
    throw new Error('Prompt API not available');
  }

  const { expectedInputs, expectedOutputs } = buildSessionConfig(options);

  const session = await LanguageModel.create({
    expectedInputs,
    expectedOutputs,
    initialPrompts: [
      { role: 'system' as const, content: options.systemPrompt ?? 'You are a helpful and friendly assistant.' },
    ],
    temperature: options.temperature,
    topK: options.topK,
    monitor(m: EventTarget) {
      m.addEventListener('downloadprogress', (e) => {
        if (e instanceof ProgressEvent) {
          console.log(`Download: ${(e.loaded * 100).toFixed(0)}%`);
        }
      });
    },
  });

  return session as unknown as AILanguageModel;
}
