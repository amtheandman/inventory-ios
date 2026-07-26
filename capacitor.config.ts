import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inventory.manager',
  appName: '进销存管家',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  ios: {
    scheme: 'inventoryapp',
    contentInset: 'always'
  }
};

export default config;
