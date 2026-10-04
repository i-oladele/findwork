import { useParams } from 'react-router-dom'
import { Screen } from '../../components/chrome/Screen'
import { PageHeader } from '../../components/chrome/PageHeader'
import { EmptyState, FullScreenLoader } from '../../components/system/States'
import { useRfqItems } from '../../lib/api'
import { usePurchaseOrder } from '../../lib/api/procurement'
import { formatDate, formatNaira } from '../../lib/format'

const STATUS = { issued: 'Issued · payment held in escrow', paid: 'Paid', void: 'Void' } as const

/** The supplier's invoice for a purchase order, laid out to print or save as a PDF from the browser. */
export function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const query = usePurchaseOrder(id)
  const items = useRfqItems(query.data?.order.rfq_id)
  if (query.isLoading) return <FullScreenLoader />
  const po = query.data?.order
  const invoice = query.data?.invoice
  if (!po || !invoice) return <Screen><PageHeader title="Invoice" back={`/purchase-orders/${id}`} /><EmptyState icon="ph-receipt" title="No invoice yet" body="An invoice is issued when the purchase order is paid into escrow." /></Screen>

  return (
    <Screen background="bg-white">
      <div className="print:hidden"><PageHeader title={`INV-${invoice.number}`} back={`/purchase-orders/${po.id}`} right={<button onClick={() => window.print()} className="text-[14.5px] font-semibold text-brand-hover">Print or save</button>} /></div>
      <article className="px-[22px] py-6 text-[14px] text-ink">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-[24px]">Invoice</h1>
            <div className="text-muted mt-1">INV-{invoice.number} · for PO-{po.number}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">{STATUS[invoice.status]}</div>
            <div className="text-muted mt-1">Issued {formatDate(invoice.issued_at)}</div>
            {invoice.paid_at && <div className="text-muted">Paid {formatDate(invoice.paid_at)}</div>}
          </div>
        </header>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div><div className="text-muted text-[12px] uppercase tracking-[0.1em]">From</div><div className="font-semibold mt-1">{po.supplier?.full_name || 'Supplier'}</div></div>
          <div><div className="text-muted text-[12px] uppercase tracking-[0.1em]">To</div><div className="font-semibold mt-1">{po.organization?.name ?? po.buyer?.full_name ?? 'Buyer'}</div>{po.organization && <div className="text-muted">Ordered by {po.buyer?.full_name}</div>}</div>
        </div>
        <table className="w-full mt-6 text-left">
          <thead><tr className="border-b border-line"><th scope="col" className="py-2 font-semibold">Description</th><th scope="col" className="py-2 font-semibold text-right">Quantity</th></tr></thead>
          <tbody>
            {(items.data?.length ?? 0) > 0
              ? items.data!.map((it) => <tr key={it.position} className="border-b border-line-soft"><td className="py-2">{it.description}</td><td className="py-2 text-right">{it.quantity} {it.unit}</td></tr>)
              : <tr className="border-b border-line-soft"><td className="py-2">{po.title}</td><td className="py-2 text-right">As quoted</td></tr>}
          </tbody>
        </table>
        <div className="flex justify-between items-baseline mt-5">
          <span className="font-display font-semibold text-[16px]">Total</span>
          <span className="font-display font-bold text-[22px]">{formatNaira(invoice.amount)}</span>
        </div>
        <p className="text-muted mt-6 leading-[1.5]">
          Paid through FindWork escrow. The amount was quoted as a single price for the whole order. This invoice records the transaction between the two parties; it is not a tax invoice.
        </p>
      </article>
    </Screen>
  )
}
