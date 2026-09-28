import { useState } from 'react'
import {
  COMMON_COUNTRIES,
  COUNTRIES,
  countryOf,
  examplePhone,
  fromInternational,
  phoneProblem,
  type CountryCode,
  type PhoneValue,
} from '../../lib/phone'

const PROBLEMS = {
  too_short: 'is too short',
  too_long: 'is too long',
  invalid: 'does not look right',
} as const

/**
 * A phone number from any country: pick the country (Nigeria by default),
 * then type the number the way it is written locally. A number pasted or
 * autofilled with its own "+code" picks its country by itself.
 *
 * The picker is a native <select> laid over the flag and code, so phones
 * show their own list, and screen readers announce it as a country picker.
 */
export function PhoneInput({ value, onChange }: { value: PhoneValue; onChange: (value: PhoneValue) => void }) {
  const [touched, setTouched] = useState(false)
  const country = countryOf(value.country)
  const problem = phoneProblem(value)
  // Too long is certain as soon as it happens; too short only once they stop typing.
  const shown = problem === 'too_long' || (touched && problem !== null) ? problem : null

  function typed(input: string) {
    onChange(fromInternational(input) ?? { ...value, number: input })
  }

  return (
    <div>
      <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mb-2">Phone number</div>
      <div
        className={`flex items-center gap-2.5 bg-white border-[1.5px] rounded-lg h-[52px] pl-3 pr-3.5 ${
          shown ? 'border-brand' : 'border-line'
        }`}
      >
        <span className="relative flex-none flex items-center gap-1.5 pr-2.5 border-r border-line-soft text-[15.5px] font-semibold text-ink">
          <span aria-hidden className="text-[18px] leading-none">
            {country.flag}
          </span>
          {country.dial}
          <i aria-hidden className="ph-bold ph-caret-down text-[12px] text-muted-2" />
          <select
            aria-label={`Country code, ${country.name} ${country.dial}`}
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value as CountryCode })}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          >
            <optgroup label="Common">
              {COMMON_COUNTRIES.map(countryOf).map((c) => (
                <option key={`common-${c.code}`} value={c.code}>
                  {c.flag} {c.name} ({c.dial})
                </option>
              ))}
            </optgroup>
            <optgroup label="All countries">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.dial})
                </option>
              ))}
            </optgroup>
          </select>
        </span>
        <input
          value={value.number}
          onChange={(e) => typed(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={examplePhone(value.country)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-label="Phone number"
          aria-invalid={shown !== null}
          className="flex-1 min-w-0 text-[16px] text-ink bg-transparent outline-none placeholder:text-muted-2"
        />
      </div>
      {shown && (
        <p className="mt-2 text-[13px] leading-[1.45] text-brand-deep">
          That number {PROBLEMS[shown]} for {country.name}. Check it, or pick a different country.
        </p>
      )}
    </div>
  )
}
