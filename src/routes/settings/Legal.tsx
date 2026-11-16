import { Link, useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { DRAFT, LAST_UPDATED, PRIVACY, TERMS, type LegalDocument } from '../../legal/documents'

const DOCS: Record<string, LegalDocument> = { terms: TERMS, privacy: PRIVACY }

/**
 * The terms of service and privacy policy (src/legal/documents.ts). Apple and
 * Google require both to be reachable before review, and the NDPA requires a
 * privacy notice for Nigerian users. Until a lawyer has approved them, the
 * screen says they are drafts.
 */
export function Legal() {
  const { doc } = useParams<{ doc: string }>()
  const document = DOCS[doc ?? ''] ?? TERMS
  const other = document === TERMS ? { to: '/legal/privacy', label: PRIVACY.title } : { to: '/legal/terms', label: TERMS.title }

  return (
    <Screen>
      <StatusBar />
      <article className="px-6 pt-2 pb-12">
        <Link to="/settings" aria-label="Back" className="inline-flex items-center justify-center w-11 h-11 -ml-2.5 text-ink">
          <i className="ph-bold ph-arrow-left text-[22px]" />
        </Link>
        <h1 className="mt-3.5 font-display font-bold text-[30px] leading-[1.08] tracking-[-0.03em] text-ink">{document.title}</h1>
        <p className="mt-3 text-[15.5px] leading-[1.55] text-muted">{document.summary}</p>
        <p className="mt-2 text-[13px] text-muted-2">Last updated {LAST_UPDATED}</p>

        {DRAFT && (
          <div role="note" className="flex items-start gap-3 mt-6 bg-warning/10 border border-warning/35 rounded-2xl p-[16px_18px]">
            <i className="ph-fill ph-warning text-xl text-warning relative top-0.5" />
            <p className="text-[14px] leading-[1.45] text-muted">
              <span className="font-semibold text-ink">Draft for legal review.</span> This document describes how FindWork works today and is being
              checked by our lawyers. It is not yet in force; parts in [square brackets] are still to be completed.
            </p>
          </div>
        )}

        {document.sections.map((section) => (
          <section key={section.heading} className="mt-7">
            <h2 className="font-display font-semibold text-[18px] leading-[1.3] text-ink">{section.heading}</h2>
            {section.paragraphs?.map((p) => <p key={p} className="mt-2.5 text-[15px] leading-[1.6] text-text-soft">{p}</p>)}
            {section.list && (
              <ul className="mt-2.5 space-y-2 list-disc pl-5 text-[15px] leading-[1.55] text-text-soft">
                {section.list.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}

        <Link to="/delete-account" className="flex items-center min-h-11 mt-8 text-[15px] font-semibold text-brand-hover">Delete your FindWork account</Link>
        <Link to={other.to} className="inline-flex items-center min-h-11 mt-8 text-[15px] font-semibold text-brand-hover">{other.label}</Link>
      </article>
    </Screen>
  )
}
