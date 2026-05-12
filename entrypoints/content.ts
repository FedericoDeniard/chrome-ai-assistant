import { createGrabMode } from '@/lib/grab';
import { extractPageContext, formatPageContext } from '@/lib/page-context';

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    const grab = createGrabMode({
      onGrab(html, selector, text, isImage, imageSrc) {
        const data: any = { html, selector, text };

        if (isImage && imageSrc) {
          data.isImage = true;
          data.imageSrc = imageSrc;

          // Try to fetch the image asynchronously
          fetch(imageSrc, { mode: 'cors' })
            .then((resp) => {
              if (!resp.ok) throw new Error('fetch failed');
              return resp.blob();
            })
            .then(async (blob) => {
              const buf = await blob.arrayBuffer();
              data.imageMime = blob.type || 'image/png';
              data.imageData = Array.from(new Uint8Array(buf));
            })
            .catch(() => {
              // Image couldn't be fetched (CORS, etc.) — save text only
            })
            .finally(() => {
              // Save with whatever data we have, then open popup
              browser.storage.local.set({ grabbed_content: data });
              browser.runtime.sendMessage({ type: 'GRAB_CAPTURED' }).catch(() => {});
            });
        } else {
          // Text-only grab — save and open popup immediately
          browser.storage.local.set({ grabbed_content: data });
          browser.runtime.sendMessage({ type: 'GRAB_CAPTURED' }).catch(() => {});
        }
      },
    });

    let lastUrl = location.href;

    browser.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === 'TOGGLE_GRAB') grab.toggle();
      if (msg.type === 'GET_STATE') return Promise.resolve({ active: grab.isActive() });
      if (msg.type === 'GET_PAGE_CONTEXT') {
        return Promise.resolve(formatPageContext(extractPageContext()));
      }
    });

    if (typeof navigation !== 'undefined') {
      navigation.addEventListener('navigate', () => {
        const newUrl = location.href;
        if (newUrl !== lastUrl) {
          lastUrl = newUrl;
          setTimeout(() => {
            const ctx = extractPageContext();
            const formatted = formatPageContext(ctx);
            browser.runtime.sendMessage({ type: 'PAGE_CONTEXT', markdown: formatted }).catch(() => {});
          }, 500);
        }
      });
    }

    window.addEventListener('popstate', () => {
      const newUrl = location.href;
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        setTimeout(() => {
          const ctx = extractPageContext();
          const formatted = formatPageContext(ctx);
          browser.runtime.sendMessage({ type: 'PAGE_CONTEXT', markdown: formatted }).catch(() => {});
        }, 500);
      }
    });
  },
});
