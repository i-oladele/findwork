import { useEffect, useRef, useState } from 'react'
import { MAX_VOICE_SECONDS, recordingMime } from '../../lib/chatMedia'

export function VoiceRecorder({ disabled, onRecorded, onError, onActiveChange }: {
  disabled: boolean
  onRecorded: (file: File) => void
  onError: (message: string | null) => void
  onActiveChange: (active: boolean) => void
}) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording'>('idle')
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const mounted = useRef(true)
  const discard = useRef(false)

  function release() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      discard.current = true
      if (recorder.current?.state === 'recording') recorder.current.stop()
      release()
    }
  }, [])

  function stop(cancel = false) {
    discard.current = cancel
    if (recorder.current?.state === 'recording') recorder.current.stop()
    release()
  }

  async function start() {
    const mimeType = recordingMime()
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      onError('Voice recording is not supported here. You can attach an audio file instead.')
      return
    }
    onError(null)
    setState('requesting')
    onActiveChange(true)
    discard.current = false
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        audio.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = audio
      const recording = new MediaRecorder(audio, { mimeType })
      recorder.current = recording
      const chunks: Blob[] = []
      recording.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
      recording.onerror = () => {
        discard.current = true
        stop(true)
        if (mounted.current) {
          setState('idle')
          onActiveChange(false)
          onError('Recording failed. Try again or attach an audio file.')
        }
      }
      recording.onstop = () => {
        release()
        if (!mounted.current) return
        setState('idle')
        onActiveChange(false)
        if (discard.current) return
        const mime = mimeType.split(';')[0]
        const blob = new Blob(chunks, { type: mime })
        const extension = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm'
        onRecorded(new File([blob], `Voice message.${extension}`, { type: mime }))
      }
      recording.start(1000)
      setState('recording')
      setSeconds(0)
      let elapsed = 0
      timer.current = setInterval(() => {
        elapsed += 1
        setSeconds(elapsed)
        if (elapsed >= MAX_VOICE_SECONDS) stop()
      }, 1000)
    } catch (error) {
      release()
      if (!mounted.current) return
      setState('idle')
      onActiveChange(false)
      onError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser settings or attach an audio file.'
        : 'We could not start the microphone. Try again or attach an audio file.')
    }
  }

  if (state === 'recording') return <div className="flex items-center gap-3 text-sm text-ink">
    <span role="status">Recording {seconds}s / {MAX_VOICE_SECONDS}s</span>
    <button type="button" onClick={() => stop()} className="font-semibold text-brand-hover">Stop recording</button>
    <button type="button" onClick={() => stop(true)} className="text-muted">Discard</button>
  </div>
  return <button type="button" onClick={start} disabled={disabled || state === 'requesting'}
    className="inline-flex items-center gap-1.5 min-h-11 px-2 text-sm font-semibold text-ink disabled:opacity-40">
    <i className="ph ph-microphone text-lg" />{state === 'requesting' ? 'Opening microphone…' : 'Record voice'}
  </button>
}
