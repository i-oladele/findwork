import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePreferences } from '../../lib/api'
import { askAssistant, AssistantUnavailable } from '../../lib/api/assistant'
import { friendlyError } from '../../lib/supabase'
import { canListen, listen, parseCommand, speak, type Command } from '../../lib/voice'
import { track } from '../../lib/tracking'

/**
 * Say or type where you want to go. Common requests in English and Pidgin
 * are understood on the device; anything else, and the other languages, go
 * to the assistant when it is set up.
 */
export function VoiceAssistant() {
  const navigate = useNavigate()
  const { data: prefs } = usePreferences()
  const language = prefs?.language ?? 'en'
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const stop = useRef<() => void>(() => undefined)

  async function run(said: string) {
    if (!said.trim() || busy) return
    setBusy(true)
    setStatus(null)
    track('voice_command')
    try {
      const command = parseCommand(said) ?? (await askAssistant<Command>('command', { text: said, language }))
      setStatus(command.reply || null)
      speak(command.reply, language)
      if (command.route) {
        setOpen(false)
        setText('')
        navigate(command.route === '/search' && command.query ? `/search?q=${encodeURIComponent(command.query)}` : command.route)
      }
    } catch (err) {
      setStatus(err instanceof AssistantUnavailable
        ? 'I did not understand that. Try "open my wallet", "track my order" or "find a plumber".'
        : friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  function hear() {
    if (listening) return stop.current()
    setStatus(null)
    setListening(true)
    const session = listen(language)
    stop.current = session.stop
    session.result.then((said) => { setText(said); void run(said) }, (err: Error) => setStatus(err.message)).finally(() => setListening(false))
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open the voice assistant"
        className="fixed bottom-[88px] right-[max(16px,calc(50%-224px))] z-20 w-14 h-14 rounded-full bg-brand text-white shadow-lg flex items-center justify-center">
        <i className="ph-fill ph-microphone text-[24px]" />
      </button>
    )
  }

  return (
    <div role="dialog" aria-label="Voice assistant" className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-20 w-[calc(100%-32px)] max-w-[448px] bg-ink rounded-2xl p-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-[15.5px] text-cream">Where would you like to go?</div>
        <button aria-label="Close" className="w-9 h-9 text-cream" onClick={() => { stop.current(); setOpen(false) }}><i className="ph-bold ph-x" /></button>
      </div>
      <form className="flex gap-2 mt-2.5" onSubmit={(e) => { e.preventDefault(); void run(text) }}>
        {canListen() && (
          <button type="button" onClick={hear} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Speak'}
            className={`flex-none w-12 h-12 rounded-xl flex items-center justify-center ${listening ? 'bg-danger text-white' : 'bg-brand text-white'}`}>
            <i className={`ph-fill ${listening ? 'ph-stop' : 'ph-microphone'} text-[20px]`} />
          </button>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} aria-label="What you want to do"
          placeholder={listening ? 'Listening…' : 'Track my order, find a tailor…'}
          className="flex-1 min-w-0 bg-ink-soft rounded-xl h-12 px-3.5 text-[15px] text-cream outline-none placeholder:text-muted-3" />
        <button type="submit" disabled={busy || !text.trim()} className="flex-none px-4 h-12 bg-cream text-ink rounded-xl text-[14.5px] font-semibold disabled:opacity-50">{busy ? '…' : 'Go'}</button>
      </form>
      <p role="status" className="mt-2 min-h-5 text-[13px] leading-[1.4] text-muted-3">{status ?? (canListen() ? 'Tap the microphone and speak, or type.' : 'This browser cannot listen, so type what you want.')}</p>
    </div>
  )
}
