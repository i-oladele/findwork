import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { ProtectedLayout, PublicOnlyLayout } from './components/system/RouteLayouts'
import { NotFound } from './components/system/NotFound'
import { FullScreenLoader } from './components/system/States'

/**
 * Route screens are named exports, so each needs unwrapping into the
 * `{ default }` shape React.lazy expects. Splitting per route keeps the
 * initial download small — it matters on a patchy mobile connection.
 */
function lazyNamed<T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) {
  // Some route modules also export helpers a sibling screen reuses, so the
  // module shape is not "components only".
  return lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))
}

const Welcome = lazyNamed(() => import('./routes/onboarding/Welcome'), 'Welcome')
const SignUp = lazyNamed(() => import('./routes/onboarding/SignUp'), 'SignUp')
const SignIn = lazyNamed(() => import('./routes/onboarding/SignIn'), 'SignIn')
const Verify = lazyNamed(() => import('./routes/onboarding/Verify'), 'Verify')
const ForgotPassword = lazyNamed(() => import('./routes/onboarding/ForgotPassword'), 'ForgotPassword')
const ResetPassword = lazyNamed(() => import('./routes/onboarding/ResetPassword'), 'ResetPassword')
const ChooseRole = lazyNamed(() => import('./routes/onboarding/ChooseRole'), 'ChooseRole')
const WorkProfile = lazyNamed(() => import('./routes/onboarding/WorkProfile'), 'WorkProfile')
const GetVerified = lazyNamed(() => import('./routes/onboarding/GetVerified'), 'GetVerified')
const Home = lazyNamed(() => import('./routes/hiring/Home'), 'Home')
const Search = lazyNamed(() => import('./routes/hiring/Search'), 'Search')
const Categories = lazyNamed(() => import('./routes/hiring/Categories'), 'Categories')
const ProviderProfile = lazyNamed(() => import('./routes/hiring/ProviderProfile'), 'ProviderProfile')
const PickTime = lazyNamed(() => import('./routes/hiring/PickTime'), 'PickTime')
const ConfirmPay = lazyNamed(() => import('./routes/hiring/ConfirmPay'), 'ConfirmPay')
const BookingConfirmed = lazyNamed(() => import('./routes/hiring/BookingConfirmed'), 'BookingConfirmed')
const MyBookings = lazyNamed(() => import('./routes/hiring/MyBookings'), 'MyBookings')
const RescheduleBooking = lazyNamed(() => import('./routes/hiring/RescheduleBooking'), 'RescheduleBooking')
const WriteReview = lazyNamed(() => import('./routes/hiring/WriteReview'), 'WriteReview')
const PostJob = lazyNamed(() => import('./routes/hiring/PostJob'), 'PostJob')
const Quotes = lazyNamed(() => import('./routes/hiring/Quotes'), 'Quotes')
const Saved = lazyNamed(() => import('./routes/hiring/Saved'), 'Saved')
const JobQuotes = lazyNamed(() => import('./routes/hiring/JobQuotes'), 'JobQuotes')
const Shop = lazyNamed(() => import('./routes/commerce/Shop'), 'Shop')
const ProductDetail = lazyNamed(() => import('./routes/commerce/ProductDetail'), 'ProductDetail')
const Cart = lazyNamed(() => import('./routes/commerce/Cart'), 'Cart')
const Checkout = lazyNamed(() => import('./routes/commerce/Checkout'), 'Checkout')
const Orders = lazyNamed(() => import('./routes/commerce/Orders'), 'Orders')
const TrackDelivery = lazyNamed(() => import('./routes/commerce/TrackDelivery'), 'TrackDelivery')
const OrderReturn = lazyNamed(() => import('./routes/commerce/OrderReturn'), 'OrderReturn')
const Wallet = lazyNamed(() => import('./routes/money/Wallet'), 'Wallet')
const AddMoney = lazyNamed(() => import('./routes/money/AddMoney'), 'AddMoney')
const TopUpReturn = lazyNamed(() => import('./routes/money/TopUpReturn'), 'TopUpReturn')
const Withdraw = lazyNamed(() => import('./routes/money/Withdraw'), 'Withdraw')
const Escrow = lazyNamed(() => import('./routes/money/Escrow'), 'Escrow')
const Transactions = lazyNamed(() => import('./routes/money/Transactions'), 'Transactions')
const Messages = lazyNamed(() => import('./routes/chat/Messages'), 'Messages')
const ChatThread = lazyNamed(() => import('./routes/chat/ChatThread'), 'ChatThread')
const ChatWith = lazyNamed(() => import('./routes/chat/ChatWith'), 'ChatWith')
const Trust = lazyNamed(() => import('./routes/chat/Trust'), 'Trust')
const ProviderDashboard = lazyNamed(() => import('./routes/provider/Dashboard'), 'ProviderDashboard')
const OpenJobs = lazyNamed(() => import('./routes/provider/OpenJobs'), 'OpenJobs')
const SendQuote = lazyNamed(() => import('./routes/provider/SendQuote'), 'SendQuote')
const Requests = lazyNamed(() => import('./routes/provider/Requests'), 'Requests')
const Availability = lazyNamed(() => import('./routes/provider/Availability'), 'Availability')
const Services = lazyNamed(() => import('./routes/provider/Services'), 'Services')
const ServiceEditor = lazyNamed(() => import('./routes/provider/ServiceEditor'), 'ServiceEditor')
const Earnings = lazyNamed(() => import('./routes/provider/Earnings'), 'Earnings')
const RFQs = lazyNamed(() => import('./routes/wholesale/RFQs'), 'RFQs')
const NewRFQ = lazyNamed(() => import('./routes/wholesale/NewRFQ'), 'NewRFQ')
const RFQDetail = lazyNamed(() => import('./routes/wholesale/RFQDetail'), 'RFQDetail')
const Classifieds = lazyNamed(() => import('./routes/classifieds/Classifieds'), 'Classifieds')
const ClassifiedDetail = lazyNamed(() => import('./routes/classifieds/ClassifiedDetail'), 'ClassifiedDetail')
const PostClassified = lazyNamed(() => import('./routes/classifieds/PostClassified'), 'PostClassified')
const Courses = lazyNamed(() => import('./routes/learning/Courses'), 'Courses')
const CourseDetail = lazyNamed(() => import('./routes/learning/CourseDetail'), 'CourseDetail')
const MyLearning = lazyNamed(() => import('./routes/learning/MyLearning'), 'MyLearning')
const Disputes = lazyNamed(() => import('./routes/disputes/Disputes'), 'Disputes')
const NewDispute = lazyNamed(() => import('./routes/disputes/DisputeDetail'), 'NewDispute')
const DisputeDetail = lazyNamed(() => import('./routes/disputes/DisputeDetail'), 'DisputeDetail')
const Plans = lazyNamed(() => import('./routes/billing/Plans'), 'Plans')
const Billing = lazyNamed(() => import('./routes/billing/Billing'), 'Billing')
const Settings = lazyNamed(() => import('./routes/settings/Settings'), 'Settings')
const Notifications = lazyNamed(() => import('./routes/settings/Notifications'), 'Notifications')
const Help = lazyNamed(() => import('./routes/settings/Help'), 'Help')
const Legal = lazyNamed(() => import('./routes/settings/Legal'), 'Legal')
const Admin = lazyNamed(() => import('./routes/admin/Admin'), 'Admin')

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />

          {/* A · Identity & onboarding — signed-out only */}
          <Route element={<PublicOnlyLayout />}>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>

          {/* Confirming a code signs the user in, so this cannot be
              signed-out only; the screen itself redirects when it has
              nothing to confirm. */}
          <Route path="/verify" element={<Verify />} />
          {/* Reached from a reset link, which arrives signed in. */}
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Reachable signed in or out — required for store review */}
          <Route path="/legal/:doc" element={<Legal />} />

          {/* Everything below requires a session */}
          <Route element={<ProtectedLayout />}>
            <Route path="/role" element={<ChooseRole />} />
            <Route path="/work-profile" element={<WorkProfile />} />
            <Route path="/get-verified" element={<GetVerified />} />

            {/* B · Hiring & bookings */}
            <Route path="/home" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/provider/:id" element={<ProviderProfile />} />
            <Route path="/book/:id/time" element={<PickTime />} />
            <Route path="/book/:id/pay" element={<ConfirmPay />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/bookings/:bookingId/reschedule" element={<RescheduleBooking />} />
            <Route path="/bookings/:bookingId/confirmed" element={<BookingConfirmed />} />
            <Route path="/bookings/:bookingId/review" element={<WriteReview />} />
            <Route path="/post-job" element={<PostJob />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/jobs/:jobId" element={<JobQuotes />} />

            {/* C · Commerce */}
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/order/:orderId" element={<OrderReturn />} />
            <Route path="/track/:orderId" element={<TrackDelivery />} />

            {/* D · Money */}
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallet/add" element={<AddMoney />} />
            <Route path="/wallet/topup" element={<TopUpReturn />} />
            <Route path="/wallet/withdraw" element={<Withdraw />} />
            <Route path="/escrow" element={<Escrow />} />
            <Route path="/transactions" element={<Transactions />} />

            {/* E · Chat & trust */}
            <Route path="/messages" element={<Messages />} />
            <Route path="/chat/with/:profileId" element={<ChatWith />} />
            <Route path="/chat/:id" element={<ChatThread />} />
            <Route path="/trust" element={<Trust />} />

            {/* F · Provider side */}
            <Route path="/provider" element={<ProviderDashboard />} />
            <Route path="/provider/jobs" element={<OpenJobs />} />
            <Route path="/provider/jobs/:id/quote" element={<SendQuote />} />
            <Route path="/provider/requests" element={<Requests />} />
            <Route path="/provider/availability" element={<Availability />} />
            <Route path="/provider/services" element={<Services />} />
            <Route path="/provider/services/new" element={<ServiceEditor />} />
            <Route path="/provider/services/:id/edit" element={<ServiceEditor />} />
            <Route path="/provider/earnings" element={<Earnings />} />

            {/* G · B2B wholesale */}
            <Route path="/rfqs" element={<RFQs />} />
            <Route path="/rfqs/new" element={<NewRFQ />} />
            <Route path="/rfqs/:id" element={<RFQDetail />} />

            {/* H · Local classifieds */}
            <Route path="/classifieds" element={<Classifieds />} />
            <Route path="/classifieds/new" element={<PostClassified />} />
            <Route path="/classifieds/:id" element={<ClassifiedDetail />} />

            {/* I · Learning & certification */}
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/learning" element={<MyLearning />} />

            {/* J · Dispute resolution */}
            <Route path="/disputes" element={<Disputes />} />
            <Route path="/disputes/new/:refType/:refId" element={<NewDispute />} />
            <Route path="/disputes/:id" element={<DisputeDetail />} />

            {/* K · Subscription billing */}
            <Route path="/plans" element={<Plans />} />
            <Route path="/billing" element={<Billing />} />

            {/* L · Account */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/help" element={<Help />} />

            {/* M · Operations (admins only; the screen re-checks) */}
            <Route path="/admin" element={<Admin />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
