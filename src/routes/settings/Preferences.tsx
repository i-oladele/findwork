import { useState } from 'react'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { SectionLabel } from '../../components/ui/SectionLabel'
import { Toggle } from '../../components/ui/Toggle'
import { QueryState } from '../../components/system/QueryState'
import { LANGUAGES, usePreferences, usePushEnabled, useSavePreferences, useSaveSkills, useSetAnalyticsConsent, useSetPush, type Preferences as Prefs } from '../../lib/api'
import { Input } from '../../components/ui/Input'
import { pushSupported } from '../../lib/push'
import { friendlyError } from '../../lib/supabase'
import type { NotificationKind } from '../../lib/database.types'
import { msg, useLanguage, useT } from '../../lib/i18n'

const KINDS: { kind: NotificationKind; label: string }[] = [
  { kind: 'message', label: msg('Messages') },
  { kind: 'booking', label: msg('Bookings') },
  { kind: 'order', label: msg('Orders and deliveries') },
  { kind: 'quote', label: msg('Quotes on your jobs') },
  { kind: 'payment', label: msg('Payments') },
  { kind: 'dispute', label: msg('Disputes') },
  { kind: 'review', label: msg('Reviews') },
  { kind: 'system', label: msg('Account and security') },
]

const INTERESTS = ['Tailoring', 'Plumbing', 'Electrical', 'Cleaning', 'Hair and beauty', 'Catering', 'Repairs', 'Shopping', 'Wholesale', 'Courses', 'Rentals'] // i18n

/** Language, push notifications and what you are here for. */
export function Preferences() {
  const t = useT()
  const prefs = usePreferences()
  return (
    <Screen>
      <PageHeader title={t('Preferences')} back="/settings" />
      <div className="px-[22px] pb-10">
        <PushSwitch />
        <QueryState query={prefs} errorMessage={t('We could not load your preferences.')} skeletonRows={2}>
          {(data) => <Form key={JSON.stringify(data)} initial={data} />}
        </QueryState>
      </div>
    </Screen>
  )
}

function PushSwitch() {
  const t = useT()
  const enabled = usePushEnabled()
  const setPush = useSetPush()
  const [error, setError] = useState<string | null>(null)
  if (!pushSupported()) {
    return (
      <Alert tone="info" className="mt-4">
        {t('Push notifications are not available in this browser. On an iPhone, add FindWork to your Home Screen (Share, then Add to Home Screen) and open it from there.')}
      </Alert>
    )
  }
  return (
    <div className="bg-white border border-line rounded-2xl p-4 mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[15.5px] font-semibold text-ink">{t('Push notifications on this device')}</div>
          <div className="text-[13px] leading-[1.45] text-muted-2 mt-0.5">{t('Hear about messages, orders and payments even when FindWork is closed.')}</div>
        </div>
        <Toggle label={t('Push notifications on this device')} on={Boolean(enabled.data)} disabled={setPush.isPending || enabled.isLoading}
          onChange={(on) => { setError(null); setPush.mutate(on, { onError: (e) => setError(friendlyError(e)) }) }} />
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  )
}

function Form({ initial }: { initial: Prefs }) {
  const t = useT()
  const save = useSavePreferences()
  const { language: appLanguage, setLanguage: setAppLanguage } = useLanguage()
  // The app's language is the one shown; it switches as soon as it is chosen, and is saved to the account with the rest.
  const [language, setLanguage] = useState(appLanguage)
  const [muted, setMuted] = useState<string[]>(initial.muted_kinds)
  const [interests, setInterests] = useState<string[]>(initial.interests)
  const saveSkills = useSaveSkills()
  const consent = useSetAnalyticsConsent()
  const [skills, setSkills] = useState(initial.skills.join(', '))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <>
      <SectionLabel className="mt-6 mb-2.5">{t('Push me about')}</SectionLabel>
      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        {KINDS.map((k, i) => (
          <div key={k.kind} className={`flex items-center justify-between gap-3 px-4 h-14 ${i < KINDS.length - 1 ? 'border-b border-line-soft' : ''}`}>
            <span className="text-[15px] text-ink">{t(k.label)}</span>
            <Toggle size="sm" label={t(k.label)} on={!muted.includes(k.kind)} onChange={() => { setSaved(false); setMuted(toggle(muted, k.kind)) }} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-muted-2">{t('Everything still arrives in your notifications inbox.')}</p>

      <SectionLabel className="mt-6 mb-2.5">{t('Language')}</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        {LANGUAGES.map((l) => <Chip key={l.code} active={language === l.code} onClick={() => { setSaved(false); setLanguage(l.code); setAppLanguage(l.code) }}>{l.label}</Chip>)}
      </div>
      <p className="mt-2 text-[13px] text-muted-2">{t('FindWork and the voice assistant use this language. The translations are new: if something reads wrongly, tell us from Help.')}</p>

      <SectionLabel className="mt-6 mb-2.5">{t('What are you here for?')}</SectionLabel>
      <div className="flex flex-wrap gap-2.5">
        {INTERESTS.map((name) => <Chip key={name} active={interests.includes(name)} onClick={() => { setSaved(false); setInterests(toggle(interests, name)) }}>{t(name)}</Chip>)}
      </div>
      <p className="mt-2 text-[13px] text-muted-2">{t('Used to choose what to suggest first.')}</p>

      <SectionLabel className="mt-6 mb-2.5">{t('Your skills')}</SectionLabel>
      <Input value={skills} onChange={(v) => { setSaved(false); setSkills(v) }} placeholder={t('sewing, pattern cutting, bookkeeping')} autoCapitalize="none"
        hint={t('Separate them with commas. Used to match you to internships and jobs, alongside your certificates.')} />

      <div className="flex items-center justify-between gap-3 bg-white border border-line rounded-2xl p-4 mt-6">
        <div>
          <div className="text-[15px] font-semibold text-ink">{t('Help improve FindWork')}</div>
          <div className="text-[13px] leading-[1.45] text-muted-2 mt-0.5">{t('Records which kinds of screen you open, never what is on them. Turning this off erases what was recorded.')}</div>
        </div>
        <Toggle label={t('Usage analytics')} on={initial.analytics} disabled={consent.isPending}
          onChange={(on) => { setError(null); consent.mutate(on, { onError: (e) => setError(friendlyError(e)) }) }} />
      </div>

      {error && <Alert className="mt-4">{error}</Alert>}
      {saved && <Alert tone="success" className="mt-4">{t('Saved.')}</Alert>}
      <Button className="mt-5" loading={save.isPending || saveSkills.isPending} onClick={async () => {
        setError(null)
        try {
          await save.mutateAsync({ language, muted_kinds: muted, interests })
          await saveSkills.mutateAsync(skills.split(',').map((s) => s.trim()).filter(Boolean))
          setSaved(true)
        } catch (err) { setError(friendlyError(err)) }
      }}>{t('Save preferences')}</Button>
    </>
  )
}
