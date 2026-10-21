import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { LANGUAGES } from '../../lib/api'
import { useLanguage, useT } from '../../lib/i18n'

export function Welcome() {
  const t = useT()
  const { language, setLanguage } = useLanguage()
  return (
    <Screen background="bg-ink">
      <StatusBar tone="light" />
      <div className="relative px-7 pt-[120px] pb-10 flex flex-col min-h-[calc(100vh-44px)]">
        <div>
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-full border-[8px] border-brand mb-[34px]">
            <span className="w-[21px] h-[21px] rounded-full bg-brand" />
          </span>
          <h1 className="font-display font-bold text-[46px] leading-[1.02] tracking-[-0.035em] text-cream">
            {t('Where Africa gets to work.')}
          </h1>
          <p className="mt-[22px] text-[17px] leading-[1.55] text-muted-3">
            {t('Find work, hire trusted pros, sell your goods and get paid safely — all in one app.')}
          </p>
        </div>
        <div className="mt-auto">
          <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" onClick={() => setLanguage(l.code)} aria-pressed={language === l.code}
                className={`rounded-full px-3.5 py-1.5 text-[13.5px] ${language === l.code ? 'bg-cream text-ink font-semibold' : 'border border-ink-line text-muted-3'}`}>
                {l.label}
              </button>
            ))}
          </div>
          <Button to="/signup">{t('Create an account')}</Button>
          <Button to="/signin" variant="secondary" className="mt-3 text-cream">
            {t('I already have one')}
          </Button>
          <p className="mt-5 text-center text-[13px] leading-[1.5] text-muted-4">
            {t('By continuing you agree to our')}{' '}
            <Link to="/legal/terms" className="underline">
              {t('Terms')}
            </Link>{' '}
            {t('and')}{' '}
            <Link to="/legal/privacy" className="underline">
              {t('Privacy Policy')}
            </Link>
            .
          </p>
        </div>
      </div>
    </Screen>
  )
}
