import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/Alert'
import { FullScreenLoader } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import { friendlyError } from '../../lib/supabase'

/**
 * Reached from the email reset link (Supabase signs the user in from the
 * URL) or after confirming a phone code. Either way there is a session, and
 * the only thing left is to set the new password.
 */
export function ResetPassword() {
  const navigate = useNavigate()
  const { session, loading, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/forgot-password" replace />

  const valid = password.length >= 8 && /\d/.test(password)

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      navigate('/home', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <PageHeader title="Choose a new password" back="/home" />
      <div className="px-6 pt-4">
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          hint="At least 8 characters, including a number."
        />
        {error && <Alert className="mt-4">{error}</Alert>}
        <Button onClick={submit} disabled={!valid} loading={busy} className="mt-6 w-full">
          Save password
        </Button>
      </div>
    </Screen>
  )
}
