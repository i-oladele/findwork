import { Link } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { contacts } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function Messages() {
  const chat = useAppStore((s) => s.chat)
  const unread = useAppStore((s) => s.unread)

  return (
    <Screen bottomNav="customer">
      <StatusBar />
      <div className="px-[22px] pt-2.5">
        <h2 className="font-display font-bold text-[30px] tracking-[-0.03em] text-ink">Messages</h2>
        <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[46px] px-3 mt-3.5">
          <i className="ph ph-magnifying-glass text-lg text-muted-2" />
          <span className="text-[15.5px] text-muted-2">Search messages</span>
        </div>

        {contacts.map((c) => {
          const thread = chat[c.id] ?? []
          const last = thread[thread.length - 1]
          const preview = last?.kind === 'voice' ? '🎤 Voice message' : (last?.text || c.seedMessage)
          const unreadCount = unread[c.id] ?? 0
          return (
            <Link key={c.id} to={`/chat/${c.id}`} className="flex gap-3.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
              {c.isSupport ? (
                <div className="flex-none w-[52px] h-[52px] rounded-full bg-ink flex items-center justify-center">
                  <i className="ph-fill ph-headset text-xl text-brand" />
                </div>
              ) : (
                <div className="relative flex-none">
                  <PlaceholderImage shape="circle" className="w-[52px] h-[52px]" />
                  {c.online && (
                    <span className="absolute right-0 bottom-0 w-3.5 h-3.5 rounded-full bg-success border-[2.5px] border-white" />
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-base text-ink">{c.name}</span>
                  <span className="font-mono text-[11px] text-muted-2">{last ? last.time : c.seedTime}</span>
                </div>
                <p className="mt-1 text-sm leading-[1.4] text-text-soft truncate">{preview}</p>
              </div>
              {unreadCount > 0 && (
                <span className="flex-none self-center min-w-[22px] h-[22px] rounded-full bg-brand text-white font-mono text-[11px] flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </Screen>
  )
}
