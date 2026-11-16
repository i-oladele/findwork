import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : ''
let failures = 0
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'TODO'} ${label}${!ok ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const legal = read('src/legal/documents.ts')
check('Legal documents approved', /export const DRAFT = false/.test(legal), 'Owner/legal reviewer must complete placeholders and approve documents.')
check('Apple app association', !read('public/.well-known/apple-app-site-association').includes('TEAMID'), 'Replace TEAMID with your Apple Team ID.')
check('Android app association', !read('public/.well-known/assetlinks.json').includes('REPLACE:'), 'Use the Play app-signing SHA-256 certificate fingerprint.')
check('Apple signing team', /DEVELOPMENT_TEAM = [A-Z0-9]+;/.test(read('ios/App/App.xcodeproj/project.pbxproj')), 'Select your enrolled team in Xcode.')
check('Apple associated domains', read('ios/App/App/App.entitlements').includes('com.apple.developer.associated-domains'), 'Enable Associated Domains in Xcode.')
check('Android Firebase configuration', existsSync('android/app/google-services.json'), 'Add configuration from your Firebase project, or omit push from launch scope.')
check('iOS Firebase configuration', existsSync('ios/App/App/GoogleService-Info.plist'), 'Add configuration to the App target in Xcode, or omit push from launch scope.')
check('Public deletion page', read('src/App.tsx').includes('path="/delete-account"'), 'Provide a public account-deletion entry point.')
try {
  const version = execFileSync('/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild', ['-version'], { encoding: 'utf8' }).match(/Xcode (\d+)/)
  check('Xcode 26 or newer', Number(version?.[1]) >= 26, 'Install Xcode 26+ and select its developer directory.')
} catch { check('Xcode installed', false, 'Install Xcode 26+ on the build Mac.') }
const sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk')
check('Android SDK installed', existsSync(join(sdkPath, 'platforms/android-36/android.jar')), 'Install Android Studio and the Android 36 SDK; set ANDROID_HOME if using another location.')
try {
  const version = execFileSync('java', ['--version'], { encoding: 'utf8' }).match(/(?:openjdk|java) (\d+)/)
  check('Gradle-compatible Java toolchain', Number(version?.[1]) >= 21 && Number(version?.[1]) <= 24, 'Use JDK 21 for Capacitor 8 and the current Gradle wrapper; the current Java 26 is incompatible.')
} catch { check('Java toolchain installed', false, 'Install JDK 21 and set JAVA_HOME.') }
const signingNames = ['FINDWORK_UPLOAD_STORE_FILE', 'FINDWORK_UPLOAD_STORE_PASSWORD', 'FINDWORK_UPLOAD_KEY_ALIAS', 'FINDWORK_UPLOAD_KEY_PASSWORD']
check('Android signing environment', signingNames.every(name => Boolean(process.env[name])), `Set ${signingNames.join(', ')} locally; never commit signing secrets.`)
console.log('\nThis checks local configuration only. Store enrollment, deployed services, signed-device testing, legal approval and provider readiness require separate verification. See docs/release/launch-checklist.md.')
process.exitCode = failures ? 1 : 0
