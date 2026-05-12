export function generateSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const path: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let segment = current.tagName.toLowerCase();
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const className = (current as HTMLElement).className;
    if (className && typeof className === 'string') {
      const cls = className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) segment += '.' + cls.map(c => CSS.escape(c)).join('.');
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(s => s.tagName === current!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${idx})`;
      }
    }
    path.unshift(segment);
    current = current.parentElement;
  }
  return path.join(' > ');
}
