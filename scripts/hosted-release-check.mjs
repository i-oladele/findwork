// Read-only checks. Never logs backend credentials or response bodies.
const input = process.argv[2]
let origin
try {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error()
  origin = url.origin
} catch {
  console.error('Usage: npm run release:hosted -- https://your-production-domain')
  process.exit(1)
}
let failures = 0
for (const [path, kind] of [['/', 'html'], ['/legal/privacy', 'html'], ['/legal/terms', 'html'], ['/delete-account', 'html'], ['/manifest.webmanifest', 'manifest'], ['/.well-known/apple-app-site-association', 'apple'], ['/.well-known/assetlinks.json', 'android']]) {
  try {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15000) })
    if (!response.ok || new URL(response.url).origin !== origin) throw new Error('Unavailable or redirected outside production host')
    if (kind === 'html') {
      if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Expected HTML')
      if (!(await response.text()).includes('id="root"')) throw new Error('Missing app shell')
    } else {
      const body = await response.json()
      if (kind === 'manifest' && (!body.name || !body.icons?.length)) throw new Error('Invalid web manifest')
      if (kind === 'apple' && (!response.headers.get('content-type')?.includes('application/json') || !body.applinks?.details?.length || JSON.stringify(body).includes('TEAMID'))) throw new Error('Invalid Apple association')
      if (kind === 'android' && (!Array.isArray(body) || !body.some(entry => entry.target?.package_name === 'africa.findwork.app' && entry.target.sha256_cert_fingerprints?.some(value => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/i.test(value))))) throw new Error('Invalid Android association')
    }
    console.log(`PASS ${path}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${path}: ${error.message}`)
  }
}
console.log('Checks validate delivery and association files only; browser journeys, backend behavior and final policy content require acceptance testing.')
process.exitCode = failures ? 1 : 0
