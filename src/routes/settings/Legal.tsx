import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'

/**
 * TODO(launch): both documents are placeholders. Apple and Google each
 * require a reachable, substantive privacy policy before review, and the
 * NDPR requires one for Nigerian users. These need to be written by someone
 * qualified and hosted at a stable public URL as well as here.
 */
const DOCS: Record<string, { title: string; note: string }> = {
  terms: {
    title: 'Terms of service',
    note: 'The terms covering bookings, escrow, fees, refunds and account conduct.',
  },
  privacy: {
    title: 'Privacy policy',
    note: 'What we collect, why we hold it, how long we keep it, and how to ask for it back or have it erased.',
  },
}

export function Legal() {
  const { doc } = useParams<{ doc: string }>()
  const meta = DOCS[doc ?? ''] ?? DOCS.terms

  return (
    <Screen>
      <StatusBar />
      <div className="px-6 pt-2 pb-10">
        <Link to="/settings" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h2 className="mt-3.5 font-display font-bold text-[30px] leading-[1.08] tracking-[-0.03em] text-ink">
          {meta.title}
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.55] text-muted">{meta.note}</p>

        <div className="flex items-start gap-3 mt-7 bg-warning/10 border border-warning/35 rounded-2xl p-[18px_20px]">
          <i className="ph-fill ph-warning text-2xl text-warning relative top-0.5" />
          <div>
            <div className="font-display font-semibold text-[16px] text-ink">Not written yet</div>
            <p className="mt-1 text-[14px] leading-[1.45] text-muted">
              This document must be drafted and published before the app can be submitted to the
              App Store or Play Store.
            </p>
          </div>
        </div>
      </div>
    </Screen>
  )
}
