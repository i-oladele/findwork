import { useEffect, useRef, useState } from 'react'
import { useSendChatAttachment, useSendMessage } from '../../lib/api/chat'
import { CHAT_ACCEPT, chatFileInfo } from '../../lib/chatMedia'
import { friendlyError } from '../../lib/supabase'
import { Alert } from './Alert'
import { VoiceRecorder } from './VoiceRecorder'

export function ChatComposer({ threadId }: { threadId: string | undefined }) {
  const send = useSendMessage(threadId)
  const attach = useSendChatAttachment(threadId)
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState<{ file: File; id: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const sending = useRef(false)
  const busy = send.isPending || attach.isPending

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function selectFile(selected: File) {
    setError(null)
    try {
      chatFileInfo(selected)
      setFile({ file: selected, id: crypto.randomUUID() })
    } catch (err) { setError(friendlyError(err)) }
  }

  async function submit() {
    const text = draft.trim()
    if ((!text && !file) || busy || recording || sending.current) return
    sending.current = true
    setError(null)
    try {
      if (file) await attach.mutateAsync({ ...file, text })
      else await send.mutateAsync({ text })
      setDraft('')
      setFile(null)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      sending.current = false
    }
  }

  return <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
    {error && <Alert className="mb-2.5">{error}</Alert>}
    {file && <div className="bg-white border border-line rounded-xl p-3 mb-2">
      <div className="flex items-center gap-2 text-sm text-ink">
        <span className="flex-1 truncate">{file.file.name}</span>
        <button type="button" disabled={busy} onClick={() => setFile(null)} aria-label="Remove attachment" className="p-2"><i className="ph ph-x" /></button>
      </div>
      {preview && file.file.type.startsWith('audio/') && <audio src={preview} controls aria-label="Voice message preview" className="w-full mt-2" />}
      {preview && file.file.type.startsWith('image/') && <img src={preview} alt="Attachment preview" className="max-h-24 rounded-lg mt-2" />}
      {preview && file.file.type.startsWith('video/') && <video src={preview} controls playsInline aria-label="Video preview" className="max-h-36 rounded-lg mt-2" />}
    </div>}
    <div className="flex flex-wrap items-center gap-2 mb-1">
      {!recording && <button type="button" onClick={() => input.current?.click()} disabled={busy || !!file}
        className="inline-flex items-center gap-1.5 min-h-11 px-2 text-sm font-semibold text-ink disabled:opacity-40">
        <i className="ph ph-paperclip text-lg" />Attach file
      </button>}
      <VoiceRecorder disabled={busy || !!file} onRecorded={selectFile} onError={setError} onActiveChange={setRecording} />
      <input ref={input} type="file" accept={CHAT_ACCEPT} aria-label="Choose attachment" hidden onChange={(e) => {
        if (e.target.files?.[0]) selectFile(e.target.files[0])
        e.target.value = ''
      }} />
    </div>
    <div className="flex items-end gap-2.5">
      <textarea value={draft} disabled={busy || recording} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() }
      }} rows={1} maxLength={2000} placeholder={file ? 'Add a caption (optional)' : 'Write a message'} aria-label="Message"
        className="flex-1 min-w-0 bg-white border-[1.5px] border-line rounded-3xl min-h-[46px] max-h-32 px-4 py-3 text-[15px] text-ink resize-none" />
      <button type="button" onClick={submit} disabled={(!draft.trim() && !file) || busy || recording} aria-label="Send"
        className="flex-none inline-flex items-center justify-center w-[46px] h-[46px] bg-brand rounded-full text-white disabled:opacity-40">
        <i className={`ph-bold ${busy ? 'ph-spinner animate-spin' : 'ph-paper-plane-right'} text-lg`} />
      </button>
    </div>
    <p className="text-[11px] text-muted mt-1.5">Photos, videos, audio or PDF · up to 20 MB</p>
  </div>
}
