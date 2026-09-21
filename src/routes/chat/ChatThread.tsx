import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { BackButton } from '../../components/chrome/PageHeader'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { ReportButton } from '../../components/ui/ReportButton'
import { ChatAttachment } from '../../components/ui/PrivateAttachment'
import { ChatComposer } from '../../components/ui/ChatComposer'
import { ErrorState, ListSkeleton } from '../../components/system/States'
import { useAuth } from '../../lib/authContext'
import {
  useMarkThreadRead,
  useMessages,
  useProvider,
  useThreadPartner,
  useThreadRealtime,
} from '../../lib/api'
import { formatDate, formatTime } from '../../lib/format'
import type { ChatMessage } from '../../lib/database.types'

/** Groups consecutive messages by Lagos calendar day, for the date dividers. */
function byDay(messages: ChatMessage[]) {
  const groups: { day: string; messages: ChatMessage[] }[] = []
  for (const m of messages) {
    const day = formatDate(m.created_at)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.messages.push(m)
    else groups.push({ day, messages: [m] })
  }
  return groups
}

export function ChatThread() {
  const { id: threadId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: partner } = useThreadPartner(threadId)
  const { data: partnerAsProvider } = useProvider(partner?.id)
  const messages = useMessages(threadId)
  const { mutate: markRead } = useMarkThreadRead()
  const [reporting, setReporting] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  useThreadRealtime(threadId)

  const count = messages.data?.length ?? 0

  // Reading the thread marks it read; so does each new message arriving while open.
  useEffect(() => {
    if (threadId) markRead(threadId)
  }, [threadId, count, markRead])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const name = partnerAsProvider?.business_name ?? partner?.full_name ?? 'Conversation'

  return (
    <Screen>
      <div className="sticky top-0 z-10 bg-ink px-4 pb-3.5">
        <StatusBar tone="light" />
        <div className="flex items-center gap-2.5">
          <BackButton fallback="/messages" tone="light" className="ml-0" />
          <PlaceholderImage shape="circle" src={partner?.avatar_url ?? undefined} className="w-10 h-10 flex-none" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-semibold text-base text-cream truncate">{name}</span>
              {partnerAsProvider?.verified && <i className="ph-fill ph-shield-check text-sm text-success" />}
            </div>
            {partnerAsProvider && <div className="text-xs text-muted-3 mt-0.5">{partnerAsProvider.category}</div>}
          </div>
          {partnerAsProvider && (
            <Link
              to={`/provider/${partnerAsProvider.id}`}
              aria-label="View profile"
              className="inline-flex items-center justify-center w-11 h-11 text-cream"
            >
              <i className="ph ph-user-circle text-[22px]" />
            </Link>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 pb-4 flex-1">
        <div className="flex items-center gap-2.5 bg-success-bg rounded-xl px-3.5 py-[11px] mb-4">
          <i className="ph-fill ph-shield-check text-lg text-success-text" />
          <p className="m-0 text-[12.5px] leading-[1.4] text-success-text">
            Keep payments inside FindWork. Escrow cannot protect cash or direct transfers.
          </p>
        </div>

        {messages.isLoading && <ListSkeleton rows={3} />}
        {messages.isError && <ErrorState message="We could not load this conversation." onRetry={() => messages.refetch()} />}
        {messages.data?.length === 0 && (
          <p className="text-center text-[14px] text-muted py-8">Say hello — ask about availability, price or directions.</p>
        )}

        {byDay(messages.data ?? []).map((group) => (
          <div key={group.day}>
            <div className="text-center font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted my-4">{group.day}</div>
            {group.messages.map((m) => {
              const mine = m.sender_id === user?.id
              return (
                <div key={m.id} className={`flex mb-3 ${mine ? 'justify-end' : ''}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-[15px] py-3 ${
                      mine ? 'bg-ink text-cream rounded-br-[4px]' : 'bg-white text-ink border border-line rounded-bl-[4px]'
                    }`}
                    onContextMenu={(e) => {
                      if (mine) return
                      e.preventDefault()
                      setReporting(m.id)
                    }}
                  >
                    <ChatAttachment message={m} />
                    <p className={`m-0 text-[15px] leading-[1.45] whitespace-pre-wrap break-words ${mine ? 'text-cream' : 'text-ink'}`}>
                      {m.text}
                    </p>
                    <div className={`flex items-center gap-2 font-mono text-[10px] mt-1.5 ${mine ? 'justify-end text-muted-2' : 'text-muted'}`}>
                      {formatTime(m.created_at)}
                      {!mine && (
                        <button onClick={() => setReporting(reporting === m.id ? null : m.id)} aria-label="Report message">
                          <i className="ph ph-flag text-[11px]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {reporting && <ReportButton targetType="message" targetId={reporting} label="Report this message" className="mb-3" />}
        <div ref={bottom} />
      </div>

      <ChatComposer key={threadId} threadId={threadId} />
    </Screen>
  )
}
