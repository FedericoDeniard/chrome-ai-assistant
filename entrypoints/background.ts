export default defineBackground(() => {
  browser.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-grab') return;
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_GRAB' }).catch(() => {});
    });
  });

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GRAB_CAPTURED') {
      browser.action.openPopup().catch(() => {});
    }
  });
});
