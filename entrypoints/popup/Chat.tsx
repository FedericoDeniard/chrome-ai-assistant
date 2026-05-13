import { useState, useRef, useEffect } from 'react';
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
const SUMMARY_CACHE_KEY = 'page_summary_cache';

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
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState('');
  const [grabbedInfo, setGrabbedInfo] = useState<{ text: string; isImage: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [status, setStatus] = useState<'init' | 'ready' | 'error'>('init');
  const [error, setError] = useState('');
  const [contextUsage, setContextUsage] = useState<{ used: number; total: number } | null>(null);
  const [overflowMsg, setOverflowMsg] = useState(false);
  const overflowRef = useRef(false);
  const rebuildingRef = useRef(false);
  const summarizingRef = useRef(false);
  const sessionRef = useRef<AILanguageModel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  async function recursiveSummarize(text: string, SummarizerAPI: any, outLang: Lang): Promise<string> {
    const CHUNK_SIZE = 5000;
    const summarizer = await SummarizerAPI.create({ type: 'key-points', format: 'plain-text', length: 'long', outputLanguage: outLang });
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }
    const summaries: string[] = [];
    for (const chunk of chunks) {
      summaries.push(await summarizer.summarize(chunk));
    }
    const combined = summaries.join('\n');
    if (combined.length > CHUNK_SIZE) {
      return recursiveSummarize(combined, SummarizerAPI, outLang);
    }
    return combined;
  }

  async function rebuildSession(overrideMessages?: StoredMessage[], acceptImages?: boolean) {
    if (rebuildingRef.current) return;
    rebuildingRef.current = true;
    setOverflowMsg(true);
    try {
      const SummarizerAPI = (self as any).Summarizer;
      if (!SummarizerAPI) return;

      const avail = await SummarizerAPI.availability();
      if (avail === 'unavailable' || avail === 'downloading') return;

      const messages = overrideMessages ?? messagesRef.current;
      if (messages.length < 2) return;

      const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      const summarizer = await SummarizerAPI.create({ type: 'key-points', format: 'plain-text', length: 'short', outputLanguage: lang });
      const summary = await summarizer.summarize(conversationText);

      if (!summary || !sessionRef.current) return;

      const pageContent = pageContextRef.current;
      const lastTwo = messages.slice(-2).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const newPrompts: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user' as const, content: `[Previous conversation summary: ${summary}]` },
        ...lastTwo,
      ];
      if (pageContent) {
        newPrompts.push({ role: 'user' as const, content: pageContent });
      }

      const newSession = await createSession({
        systemPrompt: SYSTEM_PROMPTS[lang],
        language: lang,
        history: newPrompts,
        acceptImages,
      });

      sessionRef.current?.destroy();
      sessionRef.current = newSession;
      if (currentUrlRef.current) {
        appendedUrlRef.current = currentUrlRef.current;
        pageAppendedRef.current = true;
      }
      updateContextUsage('rebuild');
      browser.runtime.sendMessage({ type: 'DEBUG_LOG', args: ['session: rebuilt', { summary: summary.slice(0, 200) }] }).catch(() => {});
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
      setStatus('init');
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

        // Fetch current page context BEFORE creating session
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

        // Try page in session, summarize if too large
        const history = bootHistoryRef.current.map(m => ({ role: m.role, content: m.content }));
        let pageIncluded = false;
        let session;
        const cache = await browser.storage.local.get(SUMMARY_CACHE_KEY).then(r => r[SUMMARY_CACHE_KEY] as { url: string; summary: string } | undefined);

        if (pageContent) {
          try {
            session = await createSession({
              systemPrompt: SYSTEM_PROMPTS[lang],
              language: lang,
              history: [...history, { role: 'user' as const, content: pageContent }],
            });
            pageIncluded = true;
            appendedUrlRef.current = pageUrl!;
            pageAppendedRef.current = true;
          } catch (e: any) {
            if (e?.message?.includes('too large') || e?.name === 'QuotaExceededError') {
              let pageForSession: string | undefined;
              if (cache?.url === pageUrl) {
                pageForSession = cache.summary;
              } else {
                const SummarizerAPI = (self as any).Summarizer;
                if (SummarizerAPI) {
                  const avail = await SummarizerAPI.availability();
                  if (avail !== 'unavailable' && avail !== 'downloading') {
                    pageForSession = await recursiveSummarize(pageContent, SummarizerAPI, lang);
                    browser.storage.local.set({ [SUMMARY_CACHE_KEY]: { url: pageUrl!, summary: pageForSession } }).catch(() => {});
                  }
                }
              }
              if (pageForSession) {
                session = await createSession({
                  systemPrompt: SYSTEM_PROMPTS[lang],
                  language: lang,
                  history: [...history, { role: 'user' as const, content: pageForSession }],
                });
                pageIncluded = true;
                appendedUrlRef.current = pageUrl!;
                pageAppendedRef.current = true;
              }
            }
          }
        }

        if (!session) {
          session = await createSession({
            systemPrompt: SYSTEM_PROMPTS[lang],
            language: lang,
            history,
          });
        }

        if (cancelled) { session.destroy(); return; }
        sessionRef.current = session;
        if (pageUrl && pageIncluded) {
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
        setStatus('ready');
      } catch (e: any) {
        setStatus('error');
        setError(e?.message ?? t('init_failed', lang));
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!overflowMsg) return;
    const id = setTimeout(() => setOverflowMsg(false), 2500);
    return () => clearTimeout(id);
  }, [overflowMsg]);

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
            grabText = await sum.summarize(grabbed.text);
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
          continue;
        }
        const friendly = `Error: ${e?.message ?? 'Unknown'}`;
        setMessages((prev) => [...prev, { role: 'assistant', content: friendly, ts: timestamp(), url: currentUrl }]);
        break;
      }
    }

    abortRef.current = null;
    updateContextUsage('finally');
    setLoading(false);
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
        <div className="chat-status chat-status-loading">
          <span className="chat-status-prefix">$</span>
          <span className="chat-status-text">{t('init_ai', lang)}</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="chat">
        <div className="chat-lang-bar">
          <span className="chat-lang-label">{t('output', lang)}:</span>
          {(['en', 'es'] as Lang[]).map((l) => (
            <button key={l} className={`chat-lang-btn ${l === lang ? 'chat-lang-btn--active' : ''}`} onClick={() => onLangChange(l)}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="chat-status chat-error">
          <span className="chat-status-prefix">!</span>
          <span className="chat-status-text">{error}</span>
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
          {contextUsage && <span className="chat-model-ctx">{contextUsage.used}/{contextUsage.total}</span>}
          <span className="app-title-version">v1.0.0</span>
        </span>
      </div>
    </div>
  );
}
