export default defineBackground(() => {
  browser.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-grab') return;
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_GRAB' }).catch(() => {});
    });
  });

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GRAB_CAPTURED') {
      // Only open popup if it's not already open — calling openPopup()
      // while the popup is open causes Chrome to close and reopen it,
      // remounting the entire React app and replaying the boot sequence.
      browser.storage.session.get('popup_open').then(({ popup_open }) => {
        if (!popup_open) {
          browser.action.openPopup().catch(() => {});
        }
      });
    }
  });
});
