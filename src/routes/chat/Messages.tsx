import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { QueryState } from '../../components/system/QueryState'
import { useAuth } from '../../lib/authContext'
import { useThreads } from '../../lib/api'
import { timeAgo } from '../../lib/format'
import { messagePreview } from '../../lib/chatMedia'

export function Messages() {
  const { user } = useAuth()
  const threads = useThreads()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = threads.data?.filter(
    (t) => !q || t.other?.full_name.toLowerCase().includes(q) || t.last_message?.text.toLowerCase().includes(q),
  )

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-2.5 pb-6">
        <h2 className="font-display font-bold text-[30px] tracking-[-0.03em] text-ink">Messages</h2>
        <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[46px] px-3 mt-3.5">
          <i className="ph ph-magnifying-glass text-lg text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages"
            className="flex-1 min-w-0 text-[15.5px] text-ink bg-transparent outline-none placeholder:text-muted-2"
          />
        </div>

        <QueryState
          query={{ ...threads, data: filtered }}
          errorMessage="We could not load your messages."
          empty={{
            icon: 'ph-chat-circle',
            title: q ? 'No matches' : 'No conversations yet',
            body: q ? undefined : 'Message a provider from their profile, or a seller from their listing.',
          }}
        >
          {(list) =>
            list.map((t) => {
              const mine = t.last_message?.sender_id === user?.id
              return (
                <Link key={t.thread_id} to={`/chat/${t.thread_id}`} className="flex gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-3.5">
                  <PlaceholderImage shape="circle" src={t.other?.avatar_url ?? undefined} className="w-[52px] h-[52px] flex-none" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display font-semibold text-base text-ink truncate">{t.other?.full_name || 'FindWork user'}</span>
                      {t.last_message && <span className="font-mono text-[11px] text-muted-2">{timeAgo(t.last_message.created_at)}</span>}
                    </div>
                    <p className={`mt-1 text-sm leading-[1.4] truncate ${t.unread > 0 ? 'text-ink font-semibold' : 'text-text-soft'}`}>
                      {mine ? 'You: ' : ''}
                      {t.last_message && messagePreview(t.last_message)}
                    </p>
                  </div>
                  {t.unread > 0 && (
                    <span className="flex-none self-center min-w-[22px] h-[22px] px-1 rounded-full bg-brand text-white font-mono text-[11px] flex items-center justify-center">
                      {t.unread}
                    </span>
                  )}
                </Link>
              )
            })
          }
        </QueryState>
      </div>
    </Screen>
  )
}
