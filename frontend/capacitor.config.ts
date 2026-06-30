import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.raichfx.carmagneapp',
  appName: 'CARMAGNE INSTAL',
  webDir: 'build',
  server: {
    url: 'https://carmagne-app.vercel.app',
    cleartext: false
  },
  android: {
    backgroundColor: '#0c0a09',
    allowMixedContent: false
  }
};

export default config;
