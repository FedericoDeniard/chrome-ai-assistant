import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { checkAvailability, createSession } from '@/lib/ai';
import type { AILanguageModel, Message } from '@/lib/ai';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Lang } from '@/lib/i18n';
import { t, tpl } from '@/lib/i18n';

function renderMarkdown(text: string): string {
  if (!text) return '';
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

function timestamp(): number {
  return Date.now();
}

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `[${h}:${m}:${s}]`;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  url?: string;
  grabText?: string;
  isImage?: boolean;
}

const LANG_LABELS: Record<Lang, string> = { en: 'EN', es: 'ES' };

const SYSTEM_PROMPTS: Record<Lang, string> = {
  en: 'You are a concise web assistant. Respond based on pasted text or your general knowledge. Be direct and brief.',
  es: 'Sos un asistente web conciso. Respondé basado en texto pegado o tu conocimiento general. Sé directo y breve.',
};

const STORAGE_KEY = 'chat_state';
const GRAB_KEY = 'grabbed_content';
const PAGE_CACHE_KEY = 'page_summary_v2';

interface StoredState {
  messages: StoredMessage[];
  lang: Lang;
  input?: string;
}

interface GrabbedContent {
  html: string;
  selector: string;
  text: string;
  isImage?: boolean;
  imageSrc?: string;
  imageMime?: string;
  imageData?: number[];
}

function saveState(messages: StoredMessage[], lang: Lang, input: string) {
  const data: StoredState = { messages, lang, input };
  browser.storage.local.set({ [STORAGE_KEY]: data }).catch(() => {});
}

function UserPrompt({ lang, url }: { lang: Lang; url?: string }) {
  const path = url ? url : '~';
  return (
    <>
      <span className="prompt-user">{t('you', lang).toLowerCase()}</span>
      <span className="prompt-dim">@</span>
      <span className="prompt-host">{t('user', lang)}</span>
      <span className="prompt-dim">:</span>
      {url ? (
        <a className="prompt-path prompt-path--link" href={url} title={url} target="_blank" rel="noopener">{path}</a>
      ) : (
        <span className="prompt-path">{path}</span>
      )}
      <span className="prompt-char">$</span>
    </>
  );
}

function AIPrompt({ lang, url }: { lang: Lang; url?: string }) {
  const path = url ? url : '~';
  return (
    <>
      <span className="prompt-ai">{t('ai', lang).toLowerCase()}</span>
      <span className="prompt-dim">@</span>
      <span className="prompt-host">{t('assistant', lang)}</span>
      <span className="prompt-dim">:</span>
      {url ? (
        <a className="prompt-path prompt-path--link" href={url} title={url} target="_blank" rel="noopener">{path}</a>
      ) : (
        <span className="prompt-path">{path}</span>
      )}
      <span className="prompt-char">$</span>
    </>
  );
}

interface Props {
  lang: Lang;
  onLangChange: (l: Lang) => void;
}

export default function Chat({ lang, onLangChange }: Props) {
  function BootPrompt() {
    return (
      <>
        <span className="prompt-user">system</span>
        <span className="prompt-dim">@</span>
        <span className="prompt-host">boot</span>
        <span className="prompt-dim">:</span>
        <span className="prompt-path">~</span>
        <span className="prompt-char">$</span>
      </>
    );
  }

  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState('');
  const [grabbedInfo, setGrabbedInfo] = useState<{ text: string; isImage: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [status, setStatus] = useState<'init' | 'ready' | 'error'>('init');
  const [error, setError] = useState('');
  const [contextUsage, setContextUsage] = useState<{ used: number; total: number } | null>(null);
  const [displayCtx, setDisplayCtx] = useState('');
  const [isAnimCtx, setIsAnimCtx] = useState(false);
  const displayCtxRef = useRef('');
  const [overflowMsg, setOverflowMsg] = useState(false);
  const [bootDisplay, setBootDisplay] = useState<{ msg: string; ts: string }[]>([]);
  const [bootCurrent, setBootCurrent] = useState('');
  const overflowRef = useRef(false);
  const rebuildingRef = useRef(false);
  const summarizingRef = useRef(false);
  const sessionRef = useRef<AILanguageModel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bootLogRef = useRef<HTMLDivElement>(null);
  const pageContextRef = useRef<string | null>(null);
  const currentUrlRef = useRef<string>('');
  const pendingImageRef = useRef<Blob | null>(null);
  const hasImageSession = useRef(false);
  const inputRef = useRef(input);
  inputRef.current = input;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);
  const appendedUrlRef = useRef<string | null>(null);
  const pageAppendedRef = useRef(false);
  const bootHistoryRef = useRef<StoredMessage[]>([]);
  const bootedRef = useRef(false);
  const bootLangRef = useRef<Lang | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  function updateContextUsage(tag: string) {
    const s: any = sessionRef.current;
    if (s) {
      const used = s.inputUsage ?? s.contextUsage ?? 0;
      const total = s.inputQuota ?? s.contextWindow ?? 0;
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: [`${tag}: ${used}/${total}`, { inputUsage: s.inputUsage, inputQuota: s.inputQuota, contextUsage: s.contextUsage, contextWindow: s.contextWindow }] }).catch(() => {});
      setContextUsage({ used, total });
    }
  }

  const BOOT_LINES: Record<Lang, string[]> = {
    en: [
      'Mounting kernel modules...',
      'Initializing Gemini Nano runtime...',
      'Loading language model weights...',
      'Calibrating context window...',
      'Establishing content script bridge...',
      'Configuring session parameters...',
      'Starting Prompt API service...',
      'Optimizing token pipeline...',
      'Syncing page context...',
      'Ready.',
    ],
    es: [
      'Montando módulos del kernel...',
      'Inicializando runtime de Gemini Nano...',
      'Cargando pesos del modelo lingüístico...',
      'Calibrando ventana de contexto...',
      'Estableciendo puente con content script...',
      'Configurando parámetros de sesión...',
      'Iniciando servicio Prompt API...',
      'Optimizando pipeline de tokens...',
      'Sincronizando contexto de página...',
      'Listo.',
    ],
  };

  const bootAnimState = useRef({ lineIdx: 0, charIdx: 0, displayed: false, bootDone: false });
  const bootDoneRef = useRef(false);

  function ts() {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}]`;
  }

  useEffect(() => {
    if (status !== 'init') return;
    const lines = BOOT_LINES[lang];
    const state = bootAnimState.current;
    state.lineIdx = 0;
    state.charIdx = 0;
    state.displayed = false;
    state.bootDone = false;
    bootDoneRef.current = false;
    setBootDisplay([]);
    setBootCurrent('');

    const t = setInterval(() => {
      const line = lines[state.lineIdx];

      if (state.displayed) {
        state.lineIdx = (state.lineIdx + 1) % lines.length;
        state.charIdx = 0;
        state.displayed = false;
      }

      if (state.charIdx < line.length) {
        state.charIdx++;
        setBootCurrent(line.slice(0, state.charIdx));
      } else {
        const timeStr = ts();
        setBootDisplay((prev) => {
          const next = [...prev, { msg: line, ts: timeStr }];
          return next.length > 15 ? next.slice(-15) : next;
        });
        state.displayed = true;
      }
    }, 35);

    return () => clearInterval(t);
  }, [status, lang]);

  useLayoutEffect(() => {
    if (bootLogRef.current) {
      bootLogRef.current.scrollTop = bootLogRef.current.scrollHeight;
    }
  }, [bootDisplay, bootCurrent]);

  async function appendPageContext(url: string) {
    if (!sessionRef.current || !pageContextRef.current) return;
    if (appendedUrlRef.current === url && pageAppendedRef.current) return;
    try {
      const s: any = sessionRef.current;
      const content = pageContextRef.current;
      const chunkSize = 2048;
      const chunks = Math.ceil(content.length / chunkSize);
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['append: start', { totalLen: content.length, chunkSize, chunks, remaining: s.inputQuota - s.inputUsage, preview: content.slice(0, 300) }] }).catch(() => {});
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        await s.append([
          { role: 'user', content: chunk },
        ]);
      }
      appendedUrlRef.current = url;
      pageAppendedRef.current = true;
      updateContextUsage('append');
    } catch (e) {
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['append: error', { msg: String(e) }] }).catch(() => {});
    }
  }

  const SUMMARY_LEVELS = [
    { type: 'key-points' as const, length: 'long' as const, chunk: 5000 },
    { type: 'teaser' as const, length: 'long' as const, chunk: 4000 },
    { type: 'tldr' as const, length: 'long' as const, chunk: 3000 },
    { type: 'headline' as const, length: 'long' as const, chunk: 2000 },
    { type: 'tldr' as const, length: 'short' as const, chunk: 1000 },
  ];

  async function recursiveSummarize(text: string, SummarizerAPI: any, outLang: Lang, level = 0, ctx?: string): Promise<string> {
    const cfg = SUMMARY_LEVELS[level] ?? SUMMARY_LEVELS[SUMMARY_LEVELS.length - 1];
    const summarizer = await SummarizerAPI.create({ type: cfg.type, format: 'plain-text', length: cfg.length, outputLanguage: outLang });
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += cfg.chunk) {
      chunks.push(text.slice(i, i + cfg.chunk));
    }
    const summaries: string[] = [];
    for (const chunk of chunks) {
      summaries.push(await summarizer.summarize(chunk, ctx ? { context: ctx } : undefined));
    }
    const combined = summaries.join('\n');
    if (combined.length > cfg.chunk) {
      return recursiveSummarize(combined, SummarizerAPI, outLang, level, ctx);
    }
    return combined;
  }

  async function trySummarize(text: string, SummarizerAPI: any, outLang: Lang, ctx?: string): Promise<string | null> {
    for (let level = 0; level < SUMMARY_LEVELS.length; level++) {
      try {
        const cfg = SUMMARY_LEVELS[level];
        browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['summarize: try level', { level, type: cfg.type, length: cfg.length }] }).catch(() => {});
        const result = await recursiveSummarize(text, SummarizerAPI, outLang, level, ctx);
        browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['summarize: ok', { level, len: result.length }] }).catch(() => {});
        return result;
      } catch (e) {
        browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['summarize: level failed', { level, msg: String(e) }] }).catch(() => {});
      }
    }
    return null;
  }

  async function rebuildSession(overrideMessages?: StoredMessage[], acceptImages?: boolean) {
    browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: start', { rebuilding: rebuildingRef.current }] }).catch(() => {});
    if (rebuildingRef.current) return;
    rebuildingRef.current = true;
    setOverflowMsg(true);
    try {
      const SummarizerAPI = (self as any).Summarizer;
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: SummarizerAPI', { available: !!SummarizerAPI }] }).catch(() => {});
      if (!SummarizerAPI) {
        browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: skip - no Summarizer API'] }).catch(() => {});
        return;
      }

      const avail = await SummarizerAPI.availability();
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: availability', { avail }] }).catch(() => {});
      if (avail === 'unavailable' || avail === 'downloading') {
        browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: skip - not ready', { avail }] }).catch(() => {});
        return;
      }

      const messages = overrideMessages ?? messagesRef.current;
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: messages', { count: messages.length }] }).catch(() => {});
      if (messages.length < 2) {
        browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: skip - too few messages'] }).catch(() => {});
        return;
      }

      const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: summarizing', { len: conversationText.length }] }).catch(() => {});
      const summary = await trySummarize(conversationText, SummarizerAPI, lang);
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: summary result', { ok: !!summary }] }).catch(() => {});

      // Try creating a rebuilt session with summary + last messages + page
      let newSession: AILanguageModel | null = null;

      if (summary && sessionRef.current) {
        const pageContent = pageContextRef.current || await (async () => {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) return null;
          try {
            const md = await browser.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }) as string;
            if (md) {
              pageContextRef.current = md;
              const m = md.match(/^URL: (.+)$/m);
              if (m) currentUrlRef.current = m[1];
              return md;
            }
          } catch {}
          return null;
        })();
        const lastTwo = messages.slice(-2).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        const newPrompts: { role: 'user' | 'assistant'; content: string }[] = [
          { role: 'user' as const, content: `[Previous conversation summary: ${summary}]` },
          ...lastTwo,
        ];
        if (pageContent) {
          newPrompts.push({ role: 'user' as const, content: pageContent });
        }

        try {
          newSession = await createSession({
            systemPrompt: SYSTEM_PROMPTS[lang],
            language: lang,
            history: newPrompts,
            acceptImages,
          });
        } catch {}
      }

      // If the summarized rebuild failed, try minimal: just last user message, no page
      if (!newSession) {
        const lastMsg = messages.slice(-1).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        try {
          newSession = await createSession({
            systemPrompt: SYSTEM_PROMPTS[lang],
            language: lang,
            history: lastMsg,
            acceptImages,
          });
          browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: minimal session created'] }).catch(() => {});
        } catch (e) {
          browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: minimal also failed', { msg: String(e) }] }).catch(() => {});
          return;
        }
      }

      if (!newSession) return;

      sessionRef.current?.destroy();
      sessionRef.current = newSession;
      if (currentUrlRef.current) {
        appendedUrlRef.current = currentUrlRef.current;
        pageAppendedRef.current = true;
      }
      updateContextUsage('rebuild');
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['session: rebuilt'] }).catch(() => {});
    } catch (e) {
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['rebuild: error', { msg: String(e) }] }).catch(() => {});
    } finally {
      rebuildingRef.current = false;
    }
  }

  function buildPrompt(userText: string): string {
    return userText;
  }

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['lifecycle: popup open'] }).catch(() => {});
    return () => { void browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['lifecycle: popup close'] }); };
  }, []);

  useEffect(() => {
    browser.storage.local.get([STORAGE_KEY, GRAB_KEY]).then((result) => {
      const stored = result[STORAGE_KEY] as StoredState | undefined;
      if (stored) {
        setMessages(stored.messages);
        bootHistoryRef.current = stored.messages;
        if (stored.input) setInput(stored.input);
      }

      const grabbed = result[GRAB_KEY] as GrabbedContent | undefined;
      if (grabbed) {
        setGrabbedInfo({ text: grabbed.text, isImage: !!grabbed.isImage });
        if (grabbed.isImage && grabbed.imageData) {
          const uint8 = new Uint8Array(grabbed.imageData);
          pendingImageRef.current = new Blob([uint8], { type: grabbed.imageMime || 'image/png' });
        }
        browser.storage.local.remove(GRAB_KEY);
      }
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (bootedRef.current && bootLangRef.current === lang) return;
    bootLangRef.current = lang;
    let cancelled = false;

    async function boot() {
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['boot: start', { lang }] }).catch(() => {});
      setError('');
      try {
        const avail = await checkAvailability({ language: lang });

        if (avail === 'unavailable') {
          setStatus('error');
          setError(t('ai_unavailable', lang));
          return;
        }

        if (avail === 'downloading') {
          setStatus('error');
          setError(t('downloading', lang));
          return;
        }

        // Fetch current page context and create session
        let pageContent = '';
        let pageUrl = '';
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            const markdown = await browser.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }) as string;
            if (markdown) {
              pageContextRef.current = markdown;
              const m = markdown.match(/^URL: (.+)$/m);
              if (m) {
                pageUrl = m[1];
                currentUrlRef.current = m[1];
                pageContent = markdown;
              }
            }
          } catch {}
        }

        // Create session with history and full page context
        const history = bootHistoryRef.current.map(m => ({ role: m.role, content: m.content }));
        let session;
        try {
          session = await createSession({
            systemPrompt: SYSTEM_PROMPTS[lang],
            language: lang,
            history: pageContent
              ? [...history, { role: 'user' as const, content: pageContent }]
              : history,
          });
        } catch (e: any) {
          if (pageContent && (e?.message?.includes('too large') || e?.name === 'QuotaExceededError')) {
            let summarized = '';
            const cached = await browser.storage.local.get(PAGE_CACHE_KEY).then(r => r[PAGE_CACHE_KEY] as { url: string; text: string } | undefined);
            if (cached?.url === pageUrl) {
              summarized = cached.text;
            } else {
              const SummarizerAPI = (self as any).Summarizer;
              if (SummarizerAPI) {
                const avail = await SummarizerAPI.availability();
                if (avail !== 'unavailable' && avail !== 'downloading') {
                  summarized = await trySummarize(pageContent, SummarizerAPI, lang, 'Be as precise and detailed as possible. Preserve all important information from the page.') ?? '';
                  if (summarized) {
                    browser.storage.local.set({ [PAGE_CACHE_KEY]: { url: pageUrl, text: summarized } }).catch(() => {});
                  }
                }
              }
            }
            if (summarized) {
              try {
                session = await createSession({
                  systemPrompt: SYSTEM_PROMPTS[lang],
                  language: lang,
                  history: [...history, { role: 'user' as const, content: summarized }],
                });
              } catch {}
            }
            if (!session) {
              session = await createSession({
                systemPrompt: SYSTEM_PROMPTS[lang],
                language: lang,
                history,
              });
              pageContent = '';
            }
          } else {
            throw e;
          }
        }

        if (cancelled) { session.destroy(); return; }
        sessionRef.current = session;
        if (pageUrl && pageContent) {
          appendedUrlRef.current = pageUrl;
          pageAppendedRef.current = true;
        }
        bootedRef.current = true;
        sessionRef.current.addEventListener('contextoverflow', () => {
          appendedUrlRef.current = null;
          overflowRef.current = true;
          setOverflowMsg(true);
          browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['event: contextoverflow', { usage: sessionRef.current?.contextUsage }] }).catch(() => {});
        });
        updateContextUsage('boot');
        bootDoneRef.current = true;
        setStatus('ready');
      } catch (e: any) {
        setStatus('error');
        setError((e as any)?.message ?? t('init_failed', lang));
      }
    }

    boot();
    return () => { cancelled = true; sessionRef.current?.destroy(); };
  }, [lang, storageReady]);

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'PAGE_CONTEXT' && msg.markdown) {
        pageContextRef.current = msg.markdown;
        const m = msg.markdown.match(/^URL: (.+)$/m);
        if (m) {
          currentUrlRef.current = m[1];
          appendPageContext(m[1]);
        }
      }
      if (msg.type === 'GRAB_CAPTURED') {
        browser.storage.local.get(GRAB_KEY).then((result) => {
          const grabbed = result[GRAB_KEY] as GrabbedContent | undefined;
          if (!grabbed) return;
          setGrabbedInfo({ text: grabbed.text, isImage: !!grabbed.isImage });
          if (grabbed.isImage && grabbed.imageData) {
            const uint8 = new Uint8Array(grabbed.imageData);
            pendingImageRef.current = new Blob([uint8], { type: grabbed.imageMime || 'image/png' });
          }
          browser.storage.local.remove(GRAB_KEY);
        });
      }
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    saveState(messages, lang, input);
  }, [messages, lang, input]);

  useLayoutEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    if (!overflowMsg) return;
    const id = setTimeout(() => setOverflowMsg(false), 2500);
    return () => clearTimeout(id);
  }, [overflowMsg]);

  useEffect(() => {
    if (!contextUsage) return;
    const target = `${contextUsage.used}/${contextUsage.total} (${((contextUsage.used / contextUsage.total) * 100).toFixed(1)}%)`;
    const from = displayCtxRef.current;

    if (!from) {
      displayCtxRef.current = target;
      setDisplayCtx(target);
      return;
    }

    if (from === target) return;

    setIsAnimCtx(true);
    const lenFrom = from.length;
    const lenTo = target.length;
    const totalSteps = lenFrom + lenTo;
    let step = 0;

    const t = setInterval(() => {
      if (step < lenFrom) {
        displayCtxRef.current = from.slice(0, lenFrom - step - 1);
        setDisplayCtx(displayCtxRef.current);
      } else {
        displayCtxRef.current = target.slice(0, step - lenFrom + 1);
        setDisplayCtx(displayCtxRef.current);
      }
      step++;
      if (step >= totalSteps) {
        displayCtxRef.current = target;
        setDisplayCtx(target);
        setIsAnimCtx(false);
        clearInterval(t);
      }
    }, 45);

    return () => { clearInterval(t); setIsAnimCtx(false); };
  }, [contextUsage?.used]);

  async function send() {
    const text = inputRef.current.trim();
    const grabbed = grabbedInfo;
    const imageBlob = grabbed?.isImage ? pendingImageRef.current : null;
    const currentUrl = currentUrlRef.current;
    if ((!text && !grabbed) || loading) return;

    if (overflowRef.current && !rebuildingRef.current) {
      await rebuildSession(undefined, hasImageSession.current);
    }

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    if (imageBlob && !hasImageSession.current) {
      try {
        const oldSession = sessionRef.current;
        const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }));
        const s = await createSession({
          systemPrompt: SYSTEM_PROMPTS[lang],
          language: lang,
          acceptImages: true,
          history,
        });
        oldSession?.destroy();
        sessionRef.current = s;
        appendedUrlRef.current = null;
        pageAppendedRef.current = false;
        if (currentUrlRef.current) appendPageContext(currentUrlRef.current);
        updateContextUsage('image-session');
        hasImageSession.current = true;
      } catch (e: any) {
        const msg = tpl('image_fail', lang, { error: e?.message || t('not_supported', lang) });
        const now = timestamp();
        setMessages((prev) => [...prev, { role: 'user', content: text, ts: now, url: currentUrl }, { role: 'assistant', content: msg, ts: timestamp(), url: currentUrl }]);
        setLoading(false);
        setGrabbedInfo(null);
        pendingImageRef.current = null;
        return;
      }
    }

    let grabText = grabbed ? grabbed.text : undefined;
    if (grabbed && grabbed.text.length > 800 && !summarizingRef.current) {
      const SummarizerAPI = (self as any).Summarizer;
      if (SummarizerAPI) {
        try {
          const avail = await SummarizerAPI.availability();
          if (avail !== 'unavailable' && avail !== 'downloading') {
            summarizingRef.current = true;
            setSummarizing(true);
            const sum = await SummarizerAPI.create({ type: 'key-points', format: 'plain-text', length: 'short', outputLanguage: lang });
            grabText = await sum.summarize(grabbed.text, { context: text });
            setSummarizing(false);
            summarizingRef.current = false;
            browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['grab: summarized', { before: grabbed.text.length, after: grabText!.length }] }).catch(() => {});
          }
        } catch {}
      }
    }

    const fullText = grabText ? `${grabText}\n\n${text}` : text;

    if (pageContextRef.current && currentUrlRef.current) {
      appendPageContext(currentUrlRef.current);
    }

    const textPrompt = buildPrompt(fullText);

    const displayText = imageBlob
      ? tpl('image_grabbed', lang, { text: text || t('image_desc', lang) })
      : text;

    setInput('');
    setGrabbedInfo(null);
    pendingImageRef.current = null;
    const userTs = timestamp();
    setMessages((prev) => [...prev, { role: 'user', content: displayText, ts: userTs, url: currentUrl, grabText, isImage: grabbed?.isImage }]);
    setLoading(true);

    const maxAttempts = 2;
    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const aiTs = timestamp();
        setMessages((prev) => [...prev, { role: 'assistant', content: '', ts: aiTs, url: currentUrl }]);

        try {
          let session = sessionRef.current;
          if (!session) throw new Error(t('no_session', lang));

          if (imageBlob) {
            const visionInput: any = [{ role: 'user' as const, content: [{ type: 'text' as const, value: text }, { type: 'image' as const, value: imageBlob }] }];
            const response = await session.prompt(visionInput, { signal });
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], content: response, ts: aiTs };
              return next;
            });
            updateContextUsage('image-prompt');
          } else {
            async function stream(s: AILanguageModel, prompt: string, sig: AbortSignal) {
              let accumulated = '';
              const stream = s.promptStreaming(prompt, { signal: sig });
              for await (const chunk of stream) {
                accumulated += chunk;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { ...next[next.length - 1], content: accumulated, ts: aiTs };
                  return next;
                });
              }
            }
            try {
              await stream(session, textPrompt, signal);
              updateContextUsage('stream-end');
            } catch (e: any) {
              const msg = e?.message ?? '';
              if (msg.includes('output language')) {
                session.destroy();
                const retryHistory = messagesRef.current.map(m => ({ role: m.role, content: m.content }));
                session = await createSession({ systemPrompt: SYSTEM_PROMPTS[lang], language: lang, history: retryHistory });
                sessionRef.current = session;
                appendedUrlRef.current = null;
                pageAppendedRef.current = false;
                if (currentUrlRef.current) appendPageContext(currentUrlRef.current);
                updateContextUsage('retry');
                setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: '', ts: timestamp(), url: currentUrl }]);
                await stream(session, textPrompt, signal);
              } else {
                throw e;
              }
            }
          }
          break;
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
          if (attempt === 0 && (e?.name === 'QuotaExceededError' || e?.message?.includes('too large'))) {
            const msgs = messagesRef.current.slice(0, -1);
            setMessages(msgs);
            overflowRef.current = true;
            await rebuildSession(msgs, hasImageSession.current);
            updateContextUsage('ctx-rebuild');
            continue;
          }
          const friendly = `Error: ${e?.message ?? 'Unknown'}`;
          setMessages((prev) => [...prev, { role: 'assistant', content: friendly, ts: timestamp(), url: currentUrl }]);
          break;
        }
      }
    } finally {
      abortRef.current = null;
      updateContextUsage('ctx-done');
      setLoading(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputRef.current.trim() || pendingImageRef.current) await send();
    }
  }

  if (status === 'init') {
    return (
      <div className="chat">
        <div className="chat-boot-log" ref={bootLogRef}>

          <div className="chat-msg chat-msg--user" style={{ marginBottom: 4 }}>
            <div className="chat-msg-prompt">
              <BootPrompt />
            </div>
            <div className="chat-boot-text">{t('boot_title', lang)}</div>
          </div>

          {bootDisplay.map((item, i) => (
            <div key={i} className="chat-msg chat-msg--user" style={{ marginBottom: 4 }}>
              <div className="chat-msg-prompt">
                <BootPrompt />
                <span className="chat-ts">{item.ts}</span>
              </div>
              <div className="chat-boot-text">{item.msg}</div>
            </div>
          ))}
          {bootCurrent && (
            <div className="chat-msg chat-msg--user" style={{ marginBottom: 0 }}>
              <div className="chat-msg-prompt">
                <BootPrompt />
              </div>
              <div className="chat-boot-text">{bootCurrent}<span className="boot-cursor">█</span></div>
            </div>
          )}
        </div>
        <div className="boot-loader">
          <span className="boot-loader-prompt">&gt;</span>
          <span className="boot-loader-text">
            <span className="boot-loader-dot">.</span><span className="boot-loader-dot">.</span><span className="boot-loader-dot">.</span>
          </span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="chat">
        <div className="chat-boot-log" ref={bootLogRef}>
          {bootDisplay.map((item, i) => (
            <div key={i} className="chat-msg chat-msg--user" style={{ marginBottom: 4 }}>
              <div className="chat-msg-prompt">
                <BootPrompt />
                <span className="chat-ts">{item.ts}</span>
              </div>
              <div className="chat-boot-text" style={{ color: 'var(--accent-red)' }}>{item.msg}</div>
            </div>
          ))}
          <div className="chat-msg chat-msg--user" style={{ marginBottom: 0 }}>
            <div className="chat-msg-prompt">
              <span className="prompt-user" style={{ color: 'var(--accent-red)' }}>!</span>
              <span className="prompt-dim">@</span>
              <span className="prompt-host">error</span>
              <span className="prompt-dim">:</span>
              <span className="prompt-path">~</span>
              <span className="prompt-char">$</span>
            </div>
            <div className="chat-boot-text" style={{ color: 'var(--accent-red)' }}>{error}</div>
          </div>
        </div>
        <div className="chat-lang-bar">
          <span className="chat-lang-label">{t('output', lang)}:</span>
          {(['en', 'es'] as Lang[]).map((l) => (
            <button key={l} className={`chat-lang-btn ${l === lang ? 'chat-lang-btn--active' : ''}`} onClick={() => onLangChange(l)}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-lang-bar">
        <span className="chat-lang-label">{t('output', lang)}:</span>
        {(['en', 'es'] as Lang[]).map((l) => (
          <button
            key={l}
            className={`chat-lang-btn ${l === lang ? 'chat-lang-btn--active' : ''}`}
            onClick={() => onLangChange(l)}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-empty">{t('empty_chat', lang)}</p>
        )}
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const isStreaming = loading && isLast && msg.role === 'assistant';
          const hasNoContent = isStreaming && !msg.content;

          if (msg.role === 'user') {
            return (
              <div key={i} className="chat-msg chat-msg--user">
                <div className="chat-msg-prompt">
                  <UserPrompt lang={lang} url={msg.url} />
                  <span className="chat-ts">{formatTime(msg.ts)}</span>
                </div>
                <div className="chat-msg-text">
                  {msg.grabText && <span className="grab-tag">[{t('text_pasted', lang)}] </span>}
                  <span className="chat-msg-inner" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="chat-msg chat-msg--assistant">
              <div className="chat-msg-prompt">
                <AIPrompt lang={lang} url={msg.url} />
                {!hasNoContent && <span className="chat-ts">{formatTime(msg.ts)}</span>}
              </div>
              {hasNoContent ? (
                <div className="chat-msg-block">
                  <div className="chat-msg-content chat-msg-content-loading" />
                </div>
              ) : (
                <div className="chat-msg-block">
                  <div
                    className="chat-msg-content"
                    dangerouslySetInnerHTML={{
                      __html: isStreaming
                        ? renderMarkdown(msg.content || '') + '<span class="cursor"></span>'
                        : renderMarkdown(msg.content || ''),
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="chat-input-row">
        <span className="chat-input-prompt">&gt;</span>
        <div className="chat-input-wrap">
          <input
            className="chat-input"
            type="text"
            placeholder={t('ask_placeholder', lang)}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button className={`chat-send ${loading ? 'chat-send--stop' : ''}`} onClick={loading ? stop : send} disabled={summarizing || loading || (!input.trim() && !grabbedInfo)}>
          [{loading ? '^C' : summarizing ? '...' : t('send', lang)}]
        </button>
      </div>
      {grabbedInfo && (
        <div className="chat-grabbed">
          <span className={`chat-grabbed-text ${summarizing ? 'chat-grabbed-text--summarizing' : ''}`}>{summarizing ? `[${t('summarizing', lang)}]` : `[${t('text_pasted', lang)} (${grabbedInfo.text.length} ${t('chars', lang)})${grabbedInfo.isImage ? ` · ${t('image', lang)}` : ''}]`}</span>
          <button className="chat-grabbed-clear" onClick={() => { setGrabbedInfo(null); pendingImageRef.current = null; }}>[✕]</button>
        </div>
      )}
      {overflowMsg && <div className="chat-overflow">context overflow — removing older context</div>}
      <div className="chat-model">
        <span>Gemini Nano <span className="chat-model-label">{t('model', lang).toLowerCase()}</span></span>
        <span className="chat-model-right">
          {contextUsage && (
            <span className="chat-model-ctx">{displayCtx}{isAnimCtx && <span className="ctx-cursor">█</span>}</span>
          )}
          <span className="app-title-version">v1.0.0</span>
        </span>
      </div>
    </div>
  );
}
