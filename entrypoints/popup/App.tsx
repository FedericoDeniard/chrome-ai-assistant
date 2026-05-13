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
  const [lang, setLang] = useState<Lang>('es');

  useEffect(() => {
    browser.storage.local.get([STORAGE_KEY, LANG_KEY]).then((result) => {
      const savedLang = result[LANG_KEY] as Lang | undefined;
      if (savedLang) {
        setLang(savedLang);
      } else {
        const stored = result[STORAGE_KEY] as { lang?: Lang } | undefined;
        if (stored?.lang) setLang(stored.lang);
      }
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
    browser.storage.local.remove('page_summary_cache');
    setChatKey((k) => k + 1);
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
