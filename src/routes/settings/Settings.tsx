import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Input } from '../../components/ui/Input'
import { AreaPicker } from '../../components/ui/AreaPicker'
import { AvatarUpload } from '../../components/ui/AvatarUpload'
import { ErrorState, ListSkeleton, Spinner } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { useProfile, useUpdateProfile, useDeleteAccount, useWalletSummary } from '../../lib/api'
import { friendlyError } from '../../lib/supabase'
import { toLocal } from '../../lib/phone'

export function Settings() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: profile, isLoading, isError, refetch } = useProfile()
  const { data: wallet } = useWalletSummary()
  const updateProfile = useUpdateProfile()
  const deleteAccount = useDeleteAccount()

  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setFullName(profile?.full_name ?? '')
    setLocation(profile?.location ?? '')
    setAddress(profile?.address ?? '')
    setArea(profile?.area ?? null)
    setEditing(true)
  }

  async function save() {
    setError(null)
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        location: location.trim() || null,
        address: address.trim() || null,
        area,
      })
      setEditing(false)
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  async function doSignOut() {
    await signOut()
    navigate('/welcome', { replace: true })
  }

  async function doDelete() {
    setError(null)
    try {
      await deleteAccount.mutateAsync()
      await signOut()
      navigate('/welcome', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : friendlyError(err))
      setConfirmDelete(false)
    }
  }

  const hasFunds = (wallet?.balance ?? 0) > 0 || (wallet?.escrow_held ?? 0) > 0

  return (
    <Screen>
      <div className="bg-ink px-[22px] pb-6">
        <StatusBar tone="light" />
        <div className="flex items-center gap-1 mt-1.5">
          <Link to="/home" className="inline-flex items-center justify-center w-10 h-11 -ml-2.5 text-cream">
            <i className="ph-bold ph-arrow-left text-[22px]" />
          </Link>
          <div className="font-display font-bold text-[22px] text-cream">Settings</div>
        </div>
      </div>

      <div className="px-[22px] py-5">
        {isLoading && <ListSkeleton rows={3} />}
        {isError && <ErrorState message="We could not load your profile." onRetry={() => refetch()} />}

        {profile && (
          <>
            <div className="bg-white border border-line rounded-2xl p-5">
              {editing ? (
                <div className="space-y-4">
                  <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Full name" />
                  <AreaPicker
                    value={area}
                    onChange={setArea}
                    hint="Used to show you providers nearby, and to sort by who is closest."
                  />
                  <Input label="Neighbourhood (optional)" value={location} onChange={setLocation} placeholder="Off Herbert Macaulay Way" />
                  <Input label="Delivery address" value={address} onChange={setAddress} placeholder="14 Herbert Macaulay Way, Yaba" />
                  <div className="flex gap-2.5">
                    <button
                      onClick={save}
                      disabled={updateProfile.isPending}
                      className="flex-1 h-12 bg-ink rounded-xl text-[15px] font-semibold text-cream flex items-center justify-center disabled:opacity-50"
                    >
                      {updateProfile.isPending ? <Spinner className="w-5 h-5 border-cream/40 border-t-cream" /> : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="flex-1 h-12 border-[1.5px] border-line rounded-xl text-[15px] font-semibold text-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <AvatarUpload className="mr-1" />
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-[19px] text-ink truncate">
                      {profile.full_name || 'Add your name'}
                    </div>
                    <div className="mt-1 text-[14.5px] text-muted truncate">
                      {profile.phone ? `+234 ${toLocal(profile.phone)}` : profile.email}
                    </div>
                    {(profile.area || profile.location) && (
                      <div className="mt-1 flex items-center gap-1.5 text-[14px] text-muted-2">
                        <i className="ph-fill ph-map-pin text-brand text-[14px]" />
                        {[profile.area, profile.location].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={startEditing}
                    className="shrink-0 h-10 px-4 border-[1.5px] border-line rounded-lg text-[14px] font-semibold text-ink"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 bg-white border border-line rounded-2xl overflow-hidden">
              <SettingsLink to="/get-verified" icon="ph-seal-check" label="Verification" />
              <SettingsLink to="/notifications" icon="ph-bell" label="Notifications" />
              <SettingsLink to="/orders" icon="ph-package" label="My orders" />
              <SettingsLink to="/quotes" icon="ph-note-pencil" label="My posted jobs" />
              <SettingsLink to="/billing" icon="ph-credit-card" label="Plan and billing" />
              <SettingsLink to="/disputes" icon="ph-scales" label="Disputes" />
              <SettingsLink to="/trust" icon="ph-shield-check" label="Safety and trust" />
              <SettingsLink to="/help" icon="ph-lifebuoy" label="Help and support" last />
            </div>

            {profile.is_admin && (
              <div className="mt-5 bg-white border border-line rounded-2xl overflow-hidden">
                <SettingsLink to="/admin" icon="ph-user-circle-gear" label="Operations console" last />
              </div>
            )}

            <div className="mt-5 bg-white border border-line rounded-2xl overflow-hidden">
              <SettingsLink to="/legal/terms" icon="ph-file-text" label="Terms of service" />
              <SettingsLink to="/legal/privacy" icon="ph-lock-simple" label="Privacy policy" last />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 mt-5 bg-brand/8 border border-brand/25 rounded-xl px-4 py-3">
                <i className="ph-fill ph-warning-circle text-[18px] text-brand relative top-px" />
                <span className="text-[14px] leading-[1.45] text-brand-deep">{error}</span>
              </div>
            )}

            <button
              onClick={doSignOut}
              className="w-full h-13 mt-5 py-3.5 border-[1.5px] border-line rounded-xl text-[15.5px] font-semibold text-ink"
            >
              Sign out
            </button>

            <div className="mt-8 pt-6 border-t border-line">
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2">Danger zone</div>

              {!confirmDelete ? (
                <>
                  <p className="mt-2.5 text-[14px] leading-[1.5] text-muted">
                    Deleting your account removes your profile and signs you out permanently. Your
                    completed transactions are kept in anonymised form, because the law requires it
                    and other people&apos;s records depend on them.
                  </p>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="mt-3.5 text-[15px] font-semibold text-brand"
                  >
                    Delete my account
                  </button>
                </>
              ) : (
                <div className="mt-3 bg-brand/6 border border-brand/25 rounded-2xl p-4">
                  {hasFunds ? (
                    <p className="text-[14px] leading-[1.5] text-brand-deep">
                      You still have money in your wallet or held in escrow. Withdraw your balance
                      and finish any open jobs before deleting your account.
                    </p>
                  ) : (
                    <>
                      <p className="text-[14px] leading-[1.5] text-brand-deep">
                        This cannot be undone. Type <strong>DELETE</strong> to confirm.
                      </p>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="w-full h-12 mt-3 bg-white border-[1.5px] border-line rounded-lg px-3.5 text-[16px] text-ink outline-none"
                      />
                    </>
                  )}
                  <div className="flex gap-2.5 mt-3">
                    <button
                      onClick={doDelete}
                      disabled={hasFunds || confirmText !== 'DELETE' || deleteAccount.isPending}
                      className="flex-1 h-12 bg-brand rounded-xl text-[15px] font-semibold text-white flex items-center justify-center disabled:opacity-40"
                    >
                      {deleteAccount.isPending ? <Spinner className="w-5 h-5 border-white/40 border-t-white" /> : 'Delete for ever'}
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDelete(false)
                        setConfirmText('')
                      }}
                      className="flex-1 h-12 border-[1.5px] border-line rounded-xl text-[15px] font-semibold text-muted"
                    >
                      Keep my account
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-10" />
          </>
        )}
      </div>
    </Screen>
  )
}

function SettingsLink({
  to,
  icon,
  label,
  last,
}: {
  to: string
  icon: string
  label: string
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3.5 px-4 h-14 ${last ? '' : 'border-b border-line-soft'}`}
    >
      <i className={`ph ${icon} text-[20px] text-muted`} />
      <span className="flex-1 text-[15.5px] text-ink">{label}</span>
      <i className="ph-bold ph-caret-right text-[15px] text-muted-3" />
    </Link>
  )
}
