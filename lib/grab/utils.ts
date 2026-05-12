export function copyToClipboard(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export function showToast(message: string, duration = 2000): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText =
    'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:#22c55e;color:#fff;padding:10px 24px;border-radius:8px;' +
    'font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);' +
    'transition:opacity .3s';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, duration - 400);
  setTimeout(() => toast.remove(), duration);
}

export function createHighlightStyle(): HTMLStyleElement {
  const el = document.createElement('style');
  el.textContent = `[data-grab-highlight]{outline:3px solid #3b82f6!important;outline-offset:2px!important}`;
  document.head.appendChild(el);
  return el;
}

export function destroyHighlightStyle(el: HTMLStyleElement): void {
  el.remove();
}

export function createBadge(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:#1e293b;color:#fff;padding:8px 20px;border-radius:8px;' +
    'font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);' +
    'pointer-events:none;user-select:none';
  document.body.appendChild(el);
  return el;
}

export function destroyBadge(el: HTMLDivElement): void {
  el.remove();
}
