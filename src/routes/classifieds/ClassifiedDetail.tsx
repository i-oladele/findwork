import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PlaceholderImage } from '../../components/ui/PlaceholderImage'
import { Badge } from '../../components/ui/Badge'
import { classifiedsCatalog, formatNaira } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function ClassifiedDetail() {
  const { id } = useParams<{ id: string }>()
  const myAds = useAppStore((s) => s.classifieds)
  const [shareLocation, setShareLocation] = useState(false)

  const mine = myAds.find((a) => a.id === id)
  const catalogItem = classifiedsCatalog.find((a) => a.id === id)
  const ad = mine
    ? { ...mine, distanceKm: 0, seller: 'You', verified: true, isMine: true }
    : catalogItem
      ? { ...catalogItem, isMine: false }
      : null

  if (!ad) {
    return (
      <Screen>
        <div className="px-[22px] pt-6 text-center text-sm text-muted">Listing not found.</div>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="relative h-[260px] bg-line-soft">
        <PlaceholderImage className="absolute inset-0 rounded-none w-full h-full" />
        <div className="relative h-11 flex items-center justify-between px-[22px] font-mono text-xs text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <i className="ph-fill ph-cell-signal-full text-[13px]" />
            <i className="ph-fill ph-wifi-high text-[13px]" />
            <i className="ph-fill ph-battery-full text-sm" />
          </span>
        </div>
        <Link to="/classifieds" className="relative inline-flex items-center justify-center w-11 h-11 ml-3 rounded-full bg-white/90 text-ink">
          <i className="ph-bold ph-arrow-left text-xl" />
        </Link>
      </div>

      <div className="px-[22px] pt-5">
        <div className="flex items-start justify-between gap-3.5">
          <h2 className="font-display font-bold text-2xl leading-[1.15] tracking-[-0.02em] text-ink">{ad.title}</h2>
          <span className="font-display font-bold text-2xl text-ink whitespace-nowrap">
            {formatNaira(ad.price)}
            {ad.category === 'Rentals' && <span className="text-sm font-normal text-muted-2">/yr</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <i className="ph ph-map-pin text-sm text-muted-2" />
          <span className="text-[13.5px] text-muted">{ad.location}</span>
        </div>

        <p className="mt-4 text-[15px] leading-[1.6] text-text-soft">{ad.description}</p>

        <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-3.5 mt-4">
          <PlaceholderImage shape="circle" className="w-11 h-11 flex-none" />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold text-ink">{ad.seller}</span>
              {ad.verified && <i className="ph-fill ph-shield-check text-sm text-success" />}
            </div>
            <div className="text-[12.5px] text-muted-2 mt-0.5">{ad.verified ? 'Verified on FindWork' : 'Not yet verified'}</div>
          </div>
        </div>

        <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-muted-2 mt-5 mb-2.5">Meet safely</div>
        <div className="bg-white border border-line rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <i className="ph-fill ph-map-pin-line text-lg text-brand" />
              <span className="text-[14.5px] text-ink">Share my live location for this meet-up</span>
            </div>
            <button
              onClick={() => setShareLocation((v) => !v)}
              className={`flex-none w-[44px] h-[26px] rounded-full flex items-center p-[3px] ${shareLocation ? 'bg-success justify-end' : 'bg-line'}`}
            >
              <span className="w-5 h-5 rounded-full bg-white" />
            </button>
          </div>
          <div className="flex items-center gap-2.5 mt-3.5 pt-3.5 border-t border-line-soft">
            <i className="ph ph-siren text-lg text-danger" />
            <span className="text-[13.5px] text-text-soft">Meet in a public place. Tap here anytime to send an SOS alert.</span>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 bg-cream border-t border-line px-[22px] pt-3.5 pb-[22px] mt-5">
        {ad.isMine ? (
          <div className="flex items-center justify-center h-14 border-[1.5px] border-ink rounded-xl font-semibold text-[17px] text-ink">
            <Badge tone="success" icon="check-circle">Your listing</Badge>
          </div>
        ) : (
          <Link to="/messages" className="flex items-center justify-center h-14 bg-brand text-white rounded-xl font-semibold text-[17px]">
            Message seller
          </Link>
        )}
      </div>
    </Screen>
  )
}
