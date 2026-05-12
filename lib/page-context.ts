import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

export interface PageContext {
  title: string;
  url: string;
  markdown: string;
}

export function extractPageContext(): PageContext {
  const title = document.title || '';
  const url = location.href;

  const main = document.querySelector('main, article, [role="main"]');
  const source = main || document.body;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, nav, footer, header, noscript, iframe, svg, form, aside').forEach((e) => e.remove());

  const markdown = turndown.turndown(clone.innerHTML);

  return { title, url, markdown };
}

export function formatPageContext(ctx: PageContext): string {
  return [
    `Page: ${ctx.title}`,
    `URL: ${ctx.url}`,
    '',
    ctx.markdown,
  ].join('\n');
}
