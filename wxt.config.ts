import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    minimum_chrome_version: '138',
    permissions: ['storage'],
    commands: {
      'toggle-grab': {
        suggested_key: { default: 'Alt+Shift+C' },
        description: 'Toggle element grab mode',
      },
    },
  },
});
