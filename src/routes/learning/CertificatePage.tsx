import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Screen } from '../../components/chrome/Screen'
import { StatusBar } from '../../components/chrome/StatusBar'
import { ErrorState, FullScreenLoader } from '../../components/system/States'
import { verifyCertificate } from '../../lib/api/learning'
import { formatDate } from '../../lib/format'

/**
 * A certificate, checked against FindWork's records by its code. Public: an
 * employer who is sent the link does not need an account to see it is real.
 */
export function CertificatePage() {
  const { code } = useParams<{ code: string }>()
  const query = useQuery({ queryKey: ['certificate', code], enabled: Boolean(code), queryFn: () => verifyCertificate(code!) })
  if (query.isLoading) return <FullScreenLoader />

  return (
    <Screen background="bg-white">
      <StatusBar />
      <div className="px-6 py-10">
        {query.isError ? <ErrorState message="We could not check that certificate." onRetry={() => void query.refetch()} />
          : !query.data ? (
            <div className="text-center">
              <i className="ph-fill ph-x-circle text-[40px] text-danger" />
              <h1 className="mt-3 font-display font-bold text-[24px] text-ink">No such certificate</h1>
              <p className="mt-2 text-[15px] leading-[1.5] text-muted">FindWork has not issued a certificate with the code {code}. Check the code, or treat the document with caution.</p>
            </div>
          ) : (
            <article className="border-[1.5px] border-ink rounded-2xl p-6 text-center">
              <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-2">FindWork certificate</div>
              <i className="ph-fill ph-certificate text-[44px] text-brand mt-4" />
              <p className="mt-4 text-[14.5px] text-muted">This certifies that</p>
              <h1 className="mt-1 font-display font-bold text-[26px] leading-tight text-ink">{query.data.holder_name}</h1>
              <p className="mt-3 text-[14.5px] text-muted">completed</p>
              <h2 className="mt-1 font-display font-semibold text-[20px] text-ink">{query.data.course_title}</h2>
              <p className="mt-4 text-[14px] text-text-soft">
                {formatDate(query.data.issued_at)}{query.data.score != null ? ` · quiz score ${query.data.score}%` : ''}
              </p>
              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-success-bg text-success-text px-3 py-1.5 text-[13px] font-semibold">
                <i className="ph-fill ph-check-circle" /> Verified against FindWork's records
              </p>
              <p className="mt-3 font-mono text-[13px] text-muted-2">{query.data.code}</p>
              <button onClick={() => window.print()} className="print:hidden block mx-auto mt-4 min-h-11 text-[14.5px] font-semibold text-brand-hover">Print or save</button>
            </article>
          )}
      </div>
    </Screen>
  )
}
