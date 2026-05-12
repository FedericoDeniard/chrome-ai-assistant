import { copyToClipboard, showToast, createHighlightStyle, destroyHighlightStyle, createBadge, destroyBadge } from './utils';
import { generateSelector } from './selector';

export interface GrabController {
  activate(): void;
  deactivate(): void;
  toggle(): void;
  isActive(): boolean;
}

export interface GrabOptions {
  onGrab?: (html: string, selector: string, text: string, isImage?: boolean, imageSrc?: string) => void;
}

export function createGrabMode(options?: GrabOptions): GrabController {
  let active = false;
  let highlighted: Element | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let badgeEl: HTMLDivElement | null = null;

  const highlightAttr = 'data-grab-highlight';

  function activate(): void {
    if (active) return;
    active = true;
    styleEl = createHighlightStyle();
    badgeEl = createBadge('🖱 Grab mode — click any element');
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('click', onGrab, true);
    document.addEventListener('keydown', onKey);
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    clearHighlight();
    if (styleEl) destroyHighlightStyle(styleEl);
    if (badgeEl) destroyBadge(badgeEl);
    styleEl = null;
    badgeEl = null;
    document.removeEventListener('mouseover', onHover, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('click', onGrab, true);
    document.removeEventListener('keydown', onKey);
  }

  function toggle(): void {
    active ? deactivate() : activate();
  }

  function isActive(): boolean {
    return active;
  }

  function onHover(e: MouseEvent): void {
    if (!active) return;
    clearHighlight();
    const el = e.target as Element;
    if (el === document.body || el === document.documentElement) return;
    highlighted = el;
    el.setAttribute(highlightAttr, '');
  }

  function onOut(): void {
    clearHighlight();
  }

  function onGrab(e: MouseEvent): void {
    if (!active) return;
    const el = e.target as Element;
    if (el === document.body || el === document.documentElement) return;
    e.preventDefault();
    e.stopPropagation();

    const html = el.outerHTML;
    const selector = generateSelector(el);
    const text = `${html}\n\n/* CSS Selector: ${selector} */`;

    const isImage = el.tagName === 'IMG';
    const imageSrc = isImage ? (el as HTMLImageElement).src : undefined;

    copyToClipboard(text);
    options?.onGrab?.(html, selector, text, isImage, imageSrc);
    deactivate();
    showToast(isImage ? '✓ Image grabbed' : '✓ Copied to clipboard');
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      deactivate();
      showToast('Grab mode cancelled');
    }
  }

  function clearHighlight(): void {
    if (highlighted) {
      highlighted.removeAttribute(highlightAttr);
      highlighted = null;
    }
  }

  return { activate, deactivate, toggle, isActive };
}
