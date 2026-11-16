import { track } from './lib/tracking'
import { useAuth } from './lib/authContext'
import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { startNativeShell } from './lib/native'
import { syncNativePush } from './lib/nativePush'

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
const Transfer = lazyNamed(() => import('./routes/money/Transfer'), 'Transfer')
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
const Portfolio = lazyNamed(() => import('./routes/provider/Portfolio'), 'Portfolio')
const ServiceEditor = lazyNamed(() => import('./routes/provider/ServiceEditor'), 'ServiceEditor')
const Earnings = lazyNamed(() => import('./routes/provider/Earnings'), 'Earnings')
const Products = lazyNamed(() => import('./routes/provider/Products'), 'Products')
const Coupons = lazyNamed(() => import('./routes/provider/Coupons'), 'Coupons')
const PlatformCoupons = lazyNamed(() => import('./routes/provider/Coupons'), 'PlatformCoupons')
const Store = lazyNamed(() => import('./routes/commerce/Store'), 'Store')
const ProductEditor = lazyNamed(() => import('./routes/provider/ProductEditor'), 'ProductEditor')
const SellerOrders = lazyNamed(() => import('./routes/provider/SellerOrders'), 'SellerOrders')
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
const Addresses = lazyNamed(() => import('./routes/settings/Addresses'), 'Addresses')
const Security = lazyNamed(() => import('./routes/settings/Security'), 'Security')
const Feed = lazyNamed(() => import('./routes/social/Feed'), 'Feed')
const NewPost = lazyNamed(() => import('./routes/social/Feed'), 'NewPost')
const Streams = lazyNamed(() => import('./routes/social/Live'), 'Streams')
const NewStream = lazyNamed(() => import('./routes/social/Live'), 'NewStream')
const StreamRoom = lazyNamed(() => import('./routes/social/Live'), 'StreamRoom')
const CertificatePage = lazyNamed(() => import('./routes/learning/CertificatePage'), 'CertificatePage')
const CourseEditor = lazyNamed(() => import('./routes/admin/CourseEditor'), 'CourseEditor')
const OnCallRota = lazyNamed(() => import('./routes/admin/OnCallRota'), 'OnCallRota')
const Internships = lazyNamed(() => import('./routes/internships/Internships'), 'Internships')
const NewInternship = lazyNamed(() => import('./routes/internships/Internships'), 'NewInternship')
const InternshipDetail = lazyNamed(() => import('./routes/internships/Internships'), 'InternshipDetail')
const Procurement = lazyNamed(() => import('./routes/procurement/Procurement'), 'Procurement')
const PurchaseOrderDetail = lazyNamed(() => import('./routes/procurement/PurchaseOrderDetail'), 'PurchaseOrderDetail')
const InvoicePage = lazyNamed(() => import('./routes/procurement/InvoicePage'), 'InvoicePage')
const Meetups = lazyNamed(() => import('./routes/safety/Meetups'), 'Meetups')
const NewMeetup = lazyNamed(() => import('./routes/safety/Meetups'), 'NewMeetup')
const MeetupDetail = lazyNamed(() => import('./routes/safety/MeetupDetail'), 'MeetupDetail')
const Preferences = lazyNamed(() => import('./routes/settings/Preferences'), 'Preferences')
const Rider = lazyNamed(() => import('./routes/rider/Rider'), 'Rider')
const Notifications = lazyNamed(() => import('./routes/settings/Notifications'), 'Notifications')
const Location = lazyNamed(() => import('./routes/settings/Location'), 'Location')
const Help = lazyNamed(() => import('./routes/settings/Help'), 'Help')
const AccountDeletion = lazyNamed(() => import('./routes/settings/AccountDeletion'), 'AccountDeletion')
const Legal = lazyNamed(() => import('./routes/settings/Legal'), 'Legal')
const Admin = lazyNamed(() => import('./routes/admin/Admin'), 'Admin')
const Analytics = lazyNamed(() => import('./routes/admin/Analytics'), 'Analytics')

/**
 * A new page starts at its top: the whole window scrolls, so without this a
 * page opened from halfway down a long one opens halfway down too. Going
 * back keeps the browser's own restoring of where you were.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  const navigation = useNavigationType()
  const { session } = useAuth()
  const signedIn = Boolean(session)
  const userId = session?.user.id
  useEffect(() => {
    if (navigation !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navigation])
  // The phone apps: status bar, splash screen, links that open the app, back button, tapped pushes.
  const navigate = useNavigate()
  useEffect(() => { void startNativeShell((path) => navigate(path)) }, [navigate])
  // A phone with push on pushes to whoever is signed in on it.
  useEffect(() => { if (userId) void syncNativePush() }, [userId])
  // Which kinds of screen are opened, for signed-in people who have not opted out.
  useEffect(() => {
    if (signedIn) track('page_view', pathname)
  }, [pathname, signedIn])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
          <Route path="/delete-account" element={<AccountDeletion />} />
          {/* A certificate can be checked by anyone it is shown to. */}
          <Route path="/certificate/:code" element={<CertificatePage />} />

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
            <Route path="/store/:sellerId" element={<Store />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/feed/new" element={<NewPost />} />
            <Route path="/live" element={<Streams />} />
            <Route path="/live/new" element={<NewStream />} />
            <Route path="/live/:id" element={<StreamRoom />} />
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
            <Route path="/wallet/transfer" element={<Transfer />} />
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
            <Route path="/provider/portfolio" element={<Portfolio />} />
            <Route path="/provider/services/new" element={<ServiceEditor />} />
            <Route path="/provider/services/:id/edit" element={<ServiceEditor />} />
            <Route path="/provider/earnings" element={<Earnings />} />
            <Route path="/provider/products" element={<Products />} />
            <Route path="/provider/products/new" element={<ProductEditor />} />
            <Route path="/provider/products/:id/edit" element={<ProductEditor />} />
            <Route path="/provider/orders" element={<SellerOrders />} />
            <Route path="/provider/coupons" element={<Coupons />} />

            {/* G · B2B wholesale */}
            <Route path="/rfqs" element={<RFQs />} />
            <Route path="/rfqs/new" element={<NewRFQ />} />
            <Route path="/rfqs/:id" element={<RFQDetail />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
            <Route path="/purchase-orders/:id/invoice" element={<InvoicePage />} />

            {/* H · Local classifieds */}
            <Route path="/classifieds" element={<Classifieds />} />
            <Route path="/classifieds/new" element={<PostClassified />} />
            <Route path="/classifieds/:id" element={<ClassifiedDetail />} />

            {/* I · Learning & certification */}
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:id" element={<CourseDetail />} />
            <Route path="/learning" element={<MyLearning />} />
            <Route path="/internships" element={<Internships />} />
            <Route path="/internships/new" element={<NewInternship />} />
            <Route path="/internships/:id" element={<InternshipDetail />} />

            {/* J · Dispute resolution */}
            <Route path="/disputes" element={<Disputes />} />
            <Route path="/disputes/new/:refType/:refId" element={<NewDispute />} />
            <Route path="/disputes/:id" element={<DisputeDetail />} />

            {/* K · Subscription billing */}
            <Route path="/plans" element={<Plans />} />
            <Route path="/billing" element={<Billing />} />

            {/* L · Account */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/addresses" element={<Addresses />} />
            <Route path="/security" element={<Security />} />
            <Route path="/meetups" element={<Meetups />} />
            <Route path="/meetups/new/:classifiedId" element={<NewMeetup />} />
            <Route path="/meetups/:id" element={<MeetupDetail />} />
            <Route path="/preferences" element={<Preferences />} />
            <Route path="/rider" element={<Rider />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/location" element={<Location />} />
            <Route path="/help" element={<Help />} />

            {/* M · Operations (admins only; the screen re-checks) */}
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/analytics" element={<Analytics />} />
            <Route path="/admin/coupons" element={<PlatformCoupons />} />
            <Route path="/admin/courses" element={<CourseEditor />} />
            <Route path="/admin/on-call" element={<OnCallRota />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
