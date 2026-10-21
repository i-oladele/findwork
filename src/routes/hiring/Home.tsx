import { VoiceAssistant } from '../../components/ui/VoiceAssistant'
import { useRecommendedProviders } from '../../lib/api/matching'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { ProviderCard } from '../../components/ui/ProviderCard'
import { QueryState } from '../../components/system/QueryState'
import { useMyProviderProfile, useMyVerification, useProfile, useProviders, useUnreadCount } from '../../lib/api'
import { useStaff } from '../../lib/api/admin'
import { firstName } from '../../lib/format'
import { distanceBetween } from '../../lib/distance'
import { msg, useT } from '../../lib/i18n'

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }))
  if (hour < 12) return msg('Good morning')
  if (hour < 17) return msg('Good afternoon')
  return msg('Good evening')
}

export function Home() {
  const { data: profile } = useProfile()
  const { data: myProvider } = useMyProviderProfile()
  const isAdmin = Boolean(useStaff().role)
  const unread = useUnreadCount()
  const providers = useProviders({ limit: 3 })
  const { data: suggested } = useRecommendedProviders()
  const t = useT()

  return (
    <Screen bottomNav="customer">
      <div className="bg-ink px-[22px] pb-[22px]">
        <StatusBar tone="light" />
        <div className="flex items-center justify-between mt-1.5">
          <div className="min-w-0">
            <div className="text-[13.5px] text-muted-3">
              {t(greeting())}, {firstName(profile?.full_name)}
            </div>
            <Link to="/location" className="flex items-center gap-1.5 mt-1 font-display font-semibold text-[16px] text-cream">
              <i className="ph-fill ph-map-pin text-brand text-[15px]" />
              <span className="truncate">
                {profile?.location_label ?? profile?.area ?? profile?.location ?? t('Add your area')}
              </span>
              <i className="ph-bold ph-caret-down text-[12px] text-muted-3 flex-none" />
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link to="/notifications" aria-label={t('Notifications')} className="relative inline-flex items-center justify-center w-11 h-11 text-cream">
              <i className="ph ph-bell text-[22px]" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white font-mono text-[10px] flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <Link to="/settings" aria-label={t('Settings')} className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink-soft text-cream">
              <i className="ph-fill ph-user text-lg" />
            </Link>
          </div>
        </div>
        <Link to="/search" className="flex items-center gap-2.5 bg-ink-soft rounded-lg h-[50px] px-3.5 mt-4">
          <i className="ph ph-magnifying-glass text-[19px] text-muted-2" />
          <span className="text-[15.5px] text-muted-2">{t('Search tailors, plumbers, cleaners…')}</span>
        </Link>
        <Link
          to={myProvider ? '/provider' : '/work-profile'}
          className="flex items-center justify-between bg-brand rounded-lg px-3.5 py-[11px] mt-3"
        >
          <span className="flex items-center gap-2 text-[14.5px] font-semibold text-white">
            <i className="ph-fill ph-arrows-left-right text-[17px]" />
            {myProvider ? t('Switch to selling') : t('Start selling on FindWork')}
          </span>
          <i className="ph-bold ph-arrow-right text-base text-white" />
        </Link>
        {isAdmin && (
          <Link to="/admin" className="flex items-center justify-between bg-ink-soft border border-ink-line rounded-lg px-3.5 py-[11px] mt-2.5">
            <span className="flex items-center gap-2 text-[14.5px] font-semibold text-cream">
              <i className="ph-fill ph-user-circle-gear text-[17px] text-warning" />
              {t('Operations console')}
            </span>
            <i className="ph-bold ph-arrow-right text-base text-muted-2" />
          </Link>
        )}
      </div>

      <div className="px-[22px] pt-5 pb-6">
        {profile && !profile.verified_at && <VerifyNotice />}

        <div className="flex gap-3">
          <Link to="/categories" className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-4">
            <i className="ph-fill ph-wrench text-2xl text-brand" />
            <div className="font-display font-semibold text-[15px] text-ink mt-2.5">{t('Hire a pro')}</div>
          </Link>
          <Link to="/shop" className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-4">
            <i className="ph-fill ph-storefront text-2xl text-brand" />
            <div className="font-display font-semibold text-[15px] text-ink mt-2.5">{t('Shop')}</div>
          </Link>
          <Link to="/post-job" className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-4">
            <i className="ph-fill ph-note-pencil text-2xl text-success" />
            <div className="font-display font-semibold text-[15px] text-ink mt-2.5">{t('Post a job')}</div>
          </Link>
        </div>

        {(suggested?.length ?? 0) > 0 && (
          <>
            <div className="font-display font-bold text-[19px] text-ink mt-[26px]">{t('Suggested for you')}</div>
            <div className="flex gap-3 overflow-x-auto -mx-[22px] px-[22px] pt-3 pb-1">
              {suggested!.slice(0, 8).map((p) => (
                <Link key={p.id} to={`/provider/${p.id}`} className="flex-none w-[168px] bg-white border border-line rounded-2xl p-3.5">
                  <div className="font-display font-semibold text-[14.5px] text-ink truncate">{p.business_name}</div>
                  <div className="text-[12.5px] text-muted-2 mt-0.5 truncate">{t(p.category)}{p.area ? ` · ${p.area}` : ''}</div>
                  <div className="text-[12px] font-semibold text-brand-hover mt-2">{t(p.reason)}</div>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between mt-[26px]">
          <div className="font-display font-bold text-[19px] text-ink">{t('Top rated pros')}</div>
          <Link to="/search" className="text-sm font-semibold text-brand-hover">
            {t('See all')}
          </Link>
        </div>

        <div className="mt-1">
          <QueryState
            query={providers}
            errorMessage={t('We could not load providers.')}
            empty={{ icon: 'ph-users-three', title: t('No providers yet'), body: t('Be the first: switch to selling.') }}
          >
            {(list) =>
              list.map((p) => <ProviderCard key={p.id} provider={p} distanceKm={distanceBetween(profile, p)} />)}
          </QueryState>
        </div>

        <div className="font-display font-bold text-[19px] text-ink mt-[26px]">{t('More ways to use FindWork')}</div>
        <div className="grid grid-cols-3 gap-2.5 mt-3.5">
          <Link to="/classifieds" className="bg-white border border-line rounded-2xl px-3 py-4">
            <i className="ph-fill ph-tag text-2xl text-brand" />
            <div className="font-display font-semibold text-[13.5px] text-ink mt-2.5 leading-[1.2]">{t('Classifieds')}</div>
          </Link>
          <Link to="/courses" className="bg-white border border-line rounded-2xl px-3 py-4">
            <i className="ph-fill ph-graduation-cap text-2xl text-success" />
            <div className="font-display font-semibold text-[13.5px] text-ink mt-2.5 leading-[1.2]">{t('Learn a skill')}</div>
          </Link>
          <Link to="/rfqs" className="bg-white border border-line rounded-2xl px-3 py-4">
            <i className="ph-fill ph-package text-2xl text-brand" />
            <div className="font-display font-semibold text-[13.5px] text-ink mt-2.5 leading-[1.2]">{t('Bulk orders')}</div>
          </Link>
        </div>
        <Link to="/feed" className="flex items-center justify-between bg-white border border-line rounded-2xl px-4 py-3.5 mt-3">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <i className="ph ph-film-reel text-lg text-brand" />
            {t('Stories, reels and live selling')}
          </span>
          <i className="ph-bold ph-caret-right text-sm text-muted-3" />
        </Link>
        <Link to="/quotes" className="flex items-center justify-between bg-white border border-line rounded-2xl px-4 py-3.5 mt-2.5">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <i className="ph ph-note-pencil text-lg text-brand" />
            {t('My posted jobs and quotes')}
          </span>
          <i className="ph-bold ph-caret-right text-sm text-muted-3" />
        </Link>
        <Link to="/saved" className="flex items-center justify-between bg-white border border-line rounded-2xl px-4 py-3.5 mt-2.5">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
            <i className="ph ph-heart text-lg text-brand" />
            {t('Saved providers')}
          </span>
          <i className="ph-bold ph-caret-right text-sm text-muted-3" />
        </Link>
      </div>
      <VoiceAssistant />
    </Screen>
  )
}

/**
 * Shown until the account is verified: what to do next depends on whether
 * they have sent their ID, and what the team said about it.
 */
function VerifyNotice() {
  const { data: latest, isLoading } = useMyVerification()
  const t = useT()
  if (isLoading) return null

  const { icon, title, body } =
    latest?.status === 'pending'
      ? { icon: 'hourglass-medium', title: msg('We are checking your ID'), body: msg('We will let you know as soon as it is done.') }
      : latest?.status === 'rejected'
        ? { icon: 'warning-circle', title: msg('Your verification needs another look'), body: msg('See what to fix and send it again.') }
        : { icon: 'seal-check', title: msg('Complete verification to access all services'), body: msg('It takes a few minutes: an ID and a selfie.') }

  return (
    <Link to="/get-verified" className="flex items-center gap-3 bg-warning-bg rounded-2xl p-4 mb-4">
      <i className={`ph-fill ph-${icon} text-[24px] text-warning-text flex-none`} />
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-semibold leading-[1.35] text-warning-text">{t(title)}</span>
        <span className="block text-[13px] leading-[1.4] text-warning-text/80 mt-0.5">{t(body)}</span>
      </span>
      <i className="ph-bold ph-caret-right text-warning-text flex-none" />
    </Link>
  )
}
