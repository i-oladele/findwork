import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAppStore } from '../../store/appStore'

export function SignUp() {
  const profile = useAppStore((s) => s.profile)
  const updateProfile = useAppStore((s) => s.updateProfile)

  const [method, setMethod] = useState<'phone' | 'email'>('phone')
  const [phone, setPhone] = useState(profile.phone.replace('+234 ', ''))
  const [email, setEmail] = useState(profile.email)
  const [fullName, setFullName] = useState(profile.fullName)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const passwordValid = password.length >= 8 && /\d/.test(password)
  const canSubmit = fullName.trim().length > 0 && passwordValid && (method === 'phone' ? phone.trim().length > 0 : email.trim().length > 0)

  function submit() {
    updateProfile({
      fullName,
      phone: method === 'phone' ? `+234 ${phone}` : profile.phone,
      email: method === 'email' ? email : profile.email,
    })
  }

  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-2">
        <Link to="/welcome" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h2 className="mt-3.5 font-display font-bold text-[34px] leading-[1.05] tracking-[-0.03em] text-ink">
          Create your account
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-muted">
          We will send a 6-digit code to confirm it is you.
        </p>

        <div className="flex gap-1.5 bg-line-soft rounded-lg p-1 mt-[26px]">
          <button
            onClick={() => setMethod('phone')}
            className={`flex-1 h-10 rounded-md text-[14.5px] ${
              method === 'phone' ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
            }`}
          >
            Phone
          </button>
          <button
            onClick={() => setMethod('email')}
            className={`flex-1 h-10 rounded-md text-[14.5px] ${
              method === 'email' ? 'bg-white font-semibold text-ink' : 'font-medium text-muted'
            }`}
          >
            Email
          </button>
        </div>

        <div className="mt-[22px] space-y-4">
          {method === 'phone' ? (
            <div>
              <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">
                Phone number
              </div>
              <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
                <span className="flex items-center gap-1.5 pr-3 border-r border-line-soft text-[15.5px] font-semibold text-ink">
                  +234
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="803 412 9087"
                  inputMode="tel"
                  className="flex-1 text-[16px] text-ink bg-transparent outline-none placeholder:text-muted-2"
                />
              </div>
            </div>
          ) : (
            <Input label="Email address" value={email} onChange={setEmail} placeholder="Email address" type="email" />
          )}
          <Input label="Full name" value={fullName} onChange={setFullName} placeholder="Full name" />
          <div>
            <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Password</div>
            <div className="flex items-center justify-between bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="flex-1 text-[16px] tracking-[0.05em] text-ink bg-transparent outline-none placeholder:text-muted-2 placeholder:tracking-normal"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)}>
                <i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'} text-[19px] text-muted-2`} />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-[1.45] text-muted-2">
              At least 8 characters, with one number.
            </p>
          </div>
        </div>

        <Button to="/verify" onClick={submit} disabled={!canSubmit} className="mt-[26px]">
          Send my code
        </Button>

        <div className="flex items-center gap-3.5 my-6">
          <span className="flex-1 h-px bg-line" />
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted">or</span>
          <span className="flex-1 h-px bg-line" />
        </div>

        <div className="flex gap-3">
          <span className="flex-1 flex items-center justify-center gap-2 h-[52px] bg-white border border-line rounded-xl text-[15px] font-semibold text-ink">
            <i className="ph-bold ph-google-logo text-lg" />
            Google
          </span>
          <span className="flex-1 flex items-center justify-center gap-2 h-[52px] bg-white border border-line rounded-xl text-[15px] font-semibold text-ink">
            <i className="ph-fill ph-apple-logo text-lg" />
            Apple
          </span>
        </div>
      </div>
    </Screen>
  )
}
