import { Navigate, useParams } from 'react-router-dom'

/**
 * The design's live rider map had no tracking behind it. Until riders report
 * their location, the order screen's status timeline is the truth, so old
 * /track links land there.
 */
export function TrackDelivery() {
  const { orderId } = useParams<{ orderId: string }>()
  return <Navigate to={`/order/${orderId}`} replace />
}
