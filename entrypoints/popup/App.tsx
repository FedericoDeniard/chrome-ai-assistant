import { useState, useEffect } from 'react';
import Chat from './Chat';
import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/i18n';

const STORAGE_KEY = 'chat_state';
const LANG_KEY = 'app_lang';

function App() {
  const [grabActive, setGrabActive] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);
  const [grabError, setGrabError] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  // Start with null so Chat doesn't mount with a wrong default lang
  // and trigger a double boot when the stored lang arrives.
  const [lang, setLang] = useState<Lang | null>(null);

  // Signal to background that popup is open, so it doesn't call
  // openPopup() when GRAB_CAPTURED arrives (which would reboot the popup).
  useEffect(() => {
    browser.storage.session.set({ popup_open: true }).catch(() => {});
    return () => {
      browser.storage.session.set({ popup_open: false }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    browser.storage.local.get([STORAGE_KEY, LANG_KEY]).then((result) => {
      const savedLang = result[LANG_KEY] as Lang | undefined;
      const stored = result[STORAGE_KEY] as { lang?: Lang } | undefined;
      setLang(savedLang || stored?.lang || 'es');
    });
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) return;
      setTabId(tab.id);
      browser.tabs.sendMessage(tab.id, { type: 'GET_STATE' })
        .then((res: any) => { setGrabActive(res.active); setGrabError(false); })
        .catch(() => setGrabError(true));
    });
  }, []);

  useEffect(() => {
    browser.storage.local.set({ [LANG_KEY]: lang }).catch(() => {});
  }, [lang]);

  async function toggleGrab() {
    if (!tabId) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: 'TOGGLE_GRAB' });
      setGrabActive(!grabActive);
      setGrabError(false);
    } catch (e) {
      setGrabActive(false);
      setGrabError(true);
      console.error('Grab toggle failed:', e);
    }
  }

  function newChat() {
    browser.storage.local.remove(STORAGE_KEY);
    browser.storage.local.remove('page_summary_v2');
    setChatKey((k) => k + 1);
  }

  // Don't render Chat until lang is resolved from storage to avoid
  // mounting with default 'es' and then re-mounting with the stored lang.
  if (!lang) {
    return (
      <div className="app">
        <header className="app-header">
          <h1 className="app-title">ai-assistant</h1>
        </header>
        <div className="chat">
          <div className="boot-loader">
            <span className="boot-loader-prompt">&gt;</span>
            <span className="boot-loader-text">
              <span className="boot-loader-dot">.</span><span className="boot-loader-dot">.</span><span className="boot-loader-dot">.</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const grabTitle = grabError
    ? t('grab_unavailable', lang)
    : grabActive ? t('grab_deactivate', lang) : t('grab_activate', lang);

  const grabLabel = grabError
    ? t('grab_error', lang)
    : grabActive ? t('grab_on', lang) : t('grab_off', lang);

  function getGrabState() {
    if (grabError) return 'error';
    if (grabActive) return 'active';
    return 'idle';
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          ai-assistant
        </h1>
        <div className="app-header-right">
          <button className="bracket-btn bracket-btn--new" onClick={newChat}>
            [+ {t('new_chat', lang).toLowerCase()}]
          </button>
          <button
            className={`grab-btn grab-btn--${getGrabState()}`}
            onClick={toggleGrab}
            title={grabTitle}
          >
            <span className={`grab-dot grab-dot--${getGrabState()}`} />
            [{grabLabel}]
          </button>
        </div>
      </header>
      <Chat key={chatKey} lang={lang} onLangChange={setLang} />
    </div>
  );
}

export default App;
