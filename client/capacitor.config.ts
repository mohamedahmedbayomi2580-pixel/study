import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.studyai.app',
  appName: 'study.ai',
  webDir: 'dist',
  plugins: { CapacitorHttp: { enabled: true } }
};
export default config;
