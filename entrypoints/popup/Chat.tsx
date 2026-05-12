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
  en: 'You are a concise web assistant. You receive page context, then optional pasted text, then the user question. If pasted text is provided, prioritize it over the page context when answering. Be direct and brief.',
  es: 'Sos un asistente web conciso. Recibís contexto de la página, luego texto opcional pegado, y luego la pregunta del usuario. Si hay texto pegado, priorizalo sobre el contexto de la página al responder. Sé directo y breve.',
};

const STORAGE_KEY = 'chat_state';
const GRAB_KEY = 'grabbed_content';

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
  const [status, setStatus] = useState<'init' | 'ready' | 'error'>('init');
  const [error, setError] = useState('');
  const sessionRef = useRef<AILanguageModel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pageContextRef = useRef<string | null>(null);
  const currentUrlRef = useRef<string>('');
  const pendingImageRef = useRef<Blob | null>(null);
  const hasImageSession = useRef(false);
  const inputRef = useRef(input);
  inputRef.current = input;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    browser.storage.local.get([STORAGE_KEY, GRAB_KEY]).then((result) => {
      const stored = result[STORAGE_KEY] as StoredState | undefined;
      if (stored) {
        setMessages(stored.messages);
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
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
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

        const session = await createSession({
          systemPrompt: SYSTEM_PROMPTS[lang],
          language: lang,
        });

        if (cancelled) { session.destroy(); return; }
        sessionRef.current = session;
        setStatus('ready');

        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          try {
            const markdown = await browser.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }) as string;
            if (markdown) {
              pageContextRef.current = markdown;
              const m = markdown.match(/^URL: (.+)$/m);
              if (m) currentUrlRef.current = m[1];
            }
          } catch {}
        }
      } catch (e: any) {
        setStatus('error');
        setError(e?.message ?? t('init_failed', lang));
      }
    }

    boot();
    return () => { cancelled = true; sessionRef.current?.destroy(); };
  }, [lang]);

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'PAGE_CONTEXT' && msg.markdown) {
        pageContextRef.current = msg.markdown;
        const m = msg.markdown.match(/^URL: (.+)$/m);
        if (m) currentUrlRef.current = m[1];
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

  function buildPrompt(userText: string): string {
    if (pageContextRef.current) {
      return `${pageContextRef.current}\n\n---\n\n${userText}`;
    }
    return userText;
  }

  async function send() {
    const text = inputRef.current.trim();
    const grabbed = grabbedInfo;
    const imageBlob = grabbed?.isImage ? pendingImageRef.current : null;
    const currentUrl = currentUrlRef.current;
    if ((!text && !grabbed) || loading) return;

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    if (imageBlob && !hasImageSession.current) {
      try {
        const oldSession = sessionRef.current;
        const s = await createSession({
          systemPrompt: SYSTEM_PROMPTS[lang],
          language: lang,
          acceptImages: true,
        });
        oldSession?.destroy();
        sessionRef.current = s;
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

    const fullText = grabbed ? `${grabbed.text}\n\n${text}` : text;
    const textPrompt = buildPrompt(fullText);

    const displayText = imageBlob
      ? tpl('image_grabbed', lang, { text: text || t('image_desc', lang) })
      : text;

    const grabText = grabbed ? grabbed.text : undefined;

    setInput('');
    setGrabbedInfo(null);
    pendingImageRef.current = null;
    const userTs = timestamp();
    setMessages((prev) => [...prev, { role: 'user', content: displayText, ts: userTs, url: currentUrl, grabText, isImage: grabbed?.isImage }]);
    setLoading(true);

    try {
      let session = sessionRef.current;
      if (!session) throw new Error(t('no_session', lang));

      const aiTs = timestamp();
      setMessages((prev) => [...prev, { role: 'assistant', content: '', ts: aiTs, url: currentUrl }]);

      if (imageBlob) {
        const visionInput: any = [{ role: 'user' as const, content: [{ type: 'text' as const, value: text }, { type: 'image' as const, value: imageBlob }] }];
        const response = await session.prompt(visionInput, { signal });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: response, ts: aiTs };
          return next;
        });
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
        } catch (e: any) {
          const msg = e?.message ?? '';
          if (msg.includes('output language')) {
            session.destroy();
            session = await createSession({ systemPrompt: SYSTEM_PROMPTS[lang], language: lang });
            sessionRef.current = session;
            setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: '', ts: timestamp(), url: currentUrl }]);
            await stream(session, textPrompt, signal);
          } else {
            throw e;
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      const friendly = `Error: ${e?.message ?? 'Unknown'}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: friendly, ts: timestamp(), url: currentUrl }]);
    } finally {
      abortRef.current = null;
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
        <button className={`chat-send ${loading ? 'chat-send--stop' : ''}`} onClick={loading ? stop : send} disabled={!loading && (!input.trim() && !grabbedInfo)}>
          [{loading ? '^C' : t('send', lang)}]
        </button>
      </div>
      {grabbedInfo && (
        <div className="chat-grabbed">
          <span className="chat-grabbed-text">[{t('text_pasted', lang)} ({grabbedInfo.text.length} {t('chars', lang)}){grabbedInfo.isImage ? ` · ${t('image', lang)}` : ''}]</span>
          <button className="chat-grabbed-clear" onClick={() => { setGrabbedInfo(null); pendingImageRef.current = null; }}>[✕]</button>
        </div>
      )}
      <div className="chat-model">
        <span>Gemini Nano <span className="chat-model-label">{t('model', lang).toLowerCase()}</span></span>
        <span className="app-title-version">v1.0.0</span>
      </div>
    </div>
  );
}
