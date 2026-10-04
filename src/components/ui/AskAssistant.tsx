import { useState } from 'react'
import { Alert } from './Alert'
import { usePreferences } from '../../lib/api'
import { askAssistant, AssistantUnavailable } from '../../lib/api/assistant'
import { friendlyError } from '../../lib/supabase'

/**
 * A question box answered by the assistant: support questions from how
 * FindWork works, or lesson questions from that course's own material. If
 * the assistant has not been set up, it says so once and steps aside.
 */
export function AskAssistant({
  task,
  input = {},
  title,
  placeholder,
  note,
}: {
  task: 'support' | 'lesson'
  input?: Record<string, unknown>
  title: string
  placeholder: string
  note: string
}) {
  const { data: prefs } = usePreferences()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  if (unavailable) return null

  return (
    <form className="bg-white border border-line rounded-2xl p-4" onSubmit={async (e) => {
      e.preventDefault()
      if (question.trim().length < 3 || busy) return
      setBusy(true)
      setError(null)
      setAnswer(null)
      try {
        const reply = await askAssistant(task, { ...input, question: question.trim(), language: prefs?.language ?? 'en' })
        setAnswer(reply.text)
      } catch (err) {
        if (err instanceof AssistantUnavailable) setUnavailable(true)
        else setError(friendlyError(err))
      } finally {
        setBusy(false)
      }
    }}>
      <div className="flex items-center gap-2 font-display font-semibold text-[15.5px] text-ink"><i className="ph-fill ph-sparkle text-brand" />{title}</div>
      <div className="flex gap-2 mt-2.5">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} placeholder={placeholder} aria-label={title}
          className="flex-1 min-w-0 bg-cream rounded-lg h-11 px-3 text-[14.5px] text-ink outline-none placeholder:text-muted-2" />
        <button type="submit" disabled={busy || question.trim().length < 3} className="flex-none px-4 h-11 bg-ink text-cream rounded-lg text-[14px] font-semibold disabled:opacity-50">{busy ? 'Thinking…' : 'Ask'}</button>
      </div>
      {answer && <p className="mt-3 text-[14.5px] leading-[1.55] text-text-soft whitespace-pre-wrap" aria-live="polite">{answer}</p>}
      {error && <Alert className="mt-3">{error}</Alert>}
      <p className="mt-2 text-[12px] leading-[1.4] text-muted-2">{note}</p>
    </form>
  )
}
