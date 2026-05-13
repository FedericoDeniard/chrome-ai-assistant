export type Lang = 'en' | 'es';

const strings: Record<string, Record<Lang, string>> = {
  new_chat: { en: 'New Chat', es: 'Nuevo Chat' },
  send: { en: 'Send', es: 'Enviar' },
  ask_placeholder: { en: 'Ask anything about this page...', es: 'Preguntá algo sobre esta página...' },
  empty_chat: { en: 'Ask anything about the current page.', es: 'Preguntá cualquier cosa sobre esta página.' },
  you: { en: 'You', es: 'Tú' },
  user: { en: 'user', es: 'usuario' },
  assistant: { en: 'assistant', es: 'asistente' },
  output: { en: 'Language', es: 'Lenguaje' },
  init_ai: { en: 'Initializing AI...', es: 'Inicializando IA...' },
  grab_on: { en: '🖱 Grabbing...', es: '🖱 Seleccionando...' },
  grab_off: { en: '🖱 Grab', es: '🖱 Seleccionar' },
  grab_error: { en: '🖱 Refresh page', es: '🖱 Refrescar página' },
  grab_activate: { en: 'Activate grab (Alt+Shift+C)', es: 'Activar captura (Alt+Shift+C)' },
  grab_deactivate: { en: 'Deactivate grab (Alt+Shift+C)', es: 'Desactivar captura (Alt+Shift+C)' },
  grab_unavailable: { en: 'Grab not available — refresh this page first', es: 'Captura no disponible — refrescá la página primero' },
  image_grabbed: { en: '🖼️ Image: {text}', es: '🖼️ Imagen: {text}' },
  image_desc: { en: 'Describe this image', es: 'Describe esta imagen' },
  image_fail: { en: 'Cannot send image ({error})', es: 'No se puede enviar la imagen ({error})' },
  not_supported: { en: 'not supported on this device', es: 'no soportado en este dispositivo' },
  ai_unavailable: {
    en: 'Prompt API is not available.\nMake sure Chrome 138+ and hardware requirements are met.\nCheck chrome://on-device-internals',
    es: 'Prompt API no está disponible.\nAsegurate de tener Chrome 138+ y los requisitos de hardware.\nMirá chrome://on-device-internals',
  },
  downloading: { en: 'Downloading AI model... please wait', es: 'Descargando modelo de IA... esperá por favor' },
  init_failed: { en: 'Failed to initialize AI', es: 'Error al inicializar la IA' },
  no_session: { en: 'Session not initialized', es: 'Sesión no inicializada' },
  no_image: { en: 'Cannot paste images — text only', es: 'No se pueden pegar imágenes — solo texto' },
  app_title: { en: 'AI Assistant', es: 'Asistente IA' },
  ai: { en: 'AI', es: 'IA' },
  help: { en: 'help', es: 'ayuda' },
  clear: { en: 'clear', es: 'limpiar' },
  export: { en: 'export', es: 'exportar' },
  theme: { en: 'theme', es: 'tema' },
  about: { en: 'about', es: 'acerca' },
  loading: { en: 'loading...', es: 'cargando...' },
  model: { en: 'Model', es: 'Modelo' },
  text_pasted: { en: 'text pasted', es: 'texto pegado' },
  chars: { en: 'chars', es: 'caracteres' },
  image: { en: 'image', es: 'imagen' },
  summarizing: { en: 'summarizing...', es: 'resumiendo...' },
  boot_title: { en: 'Terminal AI System v1.0.0', es: 'Sistema de IA en terminal v1.0.0' },
  boot_checking: { en: 'Checking model availability...', es: 'Verificando disponibilidad del modelo...' },
  boot_unavailable: { en: 'Model not available', es: 'Modelo no disponible' },
  boot_downloading: { en: 'Downloading model...', es: 'Modelo descargándose...' },
  boot_fetch_page: { en: 'Fetching page content...', es: 'Obteniendo contenido de la página...' },
  boot_init_session: { en: 'Initializing AI session...', es: 'Inicializando sesión de IA...' },
  boot_page_large: { en: 'Page too large, summarizing...', es: 'Página grande, resumiendo contenido...' },
  boot_cached: { en: 'Using cached page summary', es: 'Usando resumen de página guardado' },
  boot_summary_done: { en: 'Summary completed', es: 'Resumen completado' },
  boot_retry_no_page: { en: 'Retrying without page content...', es: 'Reintentando sin contenido de página...' },
  boot_creating: { en: 'Creating session with summary...', es: 'Creando sesión con resumen...' },
  boot_ready: { en: 'System ready.', es: 'Sistema listo.' },
  boot_error: { en: 'Error:', es: 'Error:' },
};

export function t(key: string, lang: Lang): string {
  return strings[key]?.[lang] ?? strings[key]?.en ?? key;
}

export function tpl(key: string, lang: Lang, params: Record<string, string>): string {
  let s = t(key, lang);
  for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, v);
  return s;
}
