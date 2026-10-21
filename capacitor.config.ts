import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The iPhone and Android apps: the same web app, bundled from dist/ and run
 * in a native shell. Build and copy with `npm run cap:sync`, then open the
 * project with `npx cap open ios` or `npx cap open android`.
 *
 * appId is the store identifier and cannot change after the first release.
 */
const config: CapacitorConfig = {
  appId: 'africa.findwork.app',
  appName: 'FindWork',
  webDir: 'dist',
  // Links to the website open the app instead (universal links / app links,
  // configured in public/.well-known and the native projects).
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#17130e', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#17130e', overlaysWebView: false },
  },
}

export default config
