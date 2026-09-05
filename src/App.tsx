import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { Welcome } from './routes/onboarding/Welcome'
import { SignUp } from './routes/onboarding/SignUp'
import { Verify } from './routes/onboarding/Verify'
import { ChooseRole } from './routes/onboarding/ChooseRole'
import { WorkProfile } from './routes/onboarding/WorkProfile'
import { GetVerified } from './routes/onboarding/GetVerified'

import { Home } from './routes/hiring/Home'
import { Search } from './routes/hiring/Search'
import { Categories } from './routes/hiring/Categories'
import { ProviderProfile } from './routes/hiring/ProviderProfile'
import { PickTime } from './routes/hiring/PickTime'
import { ConfirmPay } from './routes/hiring/ConfirmPay'
import { BookingConfirmed } from './routes/hiring/BookingConfirmed'
import { MyBookings } from './routes/hiring/MyBookings'
import { PostJob } from './routes/hiring/PostJob'
import { Quotes } from './routes/hiring/Quotes'

import { Shop } from './routes/commerce/Shop'
import { ProductDetail } from './routes/commerce/ProductDetail'
import { Cart } from './routes/commerce/Cart'
import { Checkout } from './routes/commerce/Checkout'
import { TrackDelivery } from './routes/commerce/TrackDelivery'
import { OrderReturn } from './routes/commerce/OrderReturn'

import { Wallet } from './routes/money/Wallet'
import { AddMoney } from './routes/money/AddMoney'
import { Escrow } from './routes/money/Escrow'
import { Transactions } from './routes/money/Transactions'

import { Messages } from './routes/chat/Messages'
import { ChatThread } from './routes/chat/ChatThread'
import { Trust } from './routes/chat/Trust'

import { ProviderDashboard } from './routes/provider/Dashboard'
import { OpenJobs } from './routes/provider/OpenJobs'
import { SendQuote } from './routes/provider/SendQuote'
import { Requests } from './routes/provider/Requests'
import { Availability } from './routes/provider/Availability'
import { Services } from './routes/provider/Services'
import { Earnings } from './routes/provider/Earnings'

import { RFQs } from './routes/wholesale/RFQs'
import { NewRFQ } from './routes/wholesale/NewRFQ'
import { RFQDetail } from './routes/wholesale/RFQDetail'

import { Classifieds } from './routes/classifieds/Classifieds'
import { ClassifiedDetail } from './routes/classifieds/ClassifiedDetail'
import { PostClassified } from './routes/classifieds/PostClassified'

import { Courses } from './routes/learning/Courses'
import { CourseDetail } from './routes/learning/CourseDetail'
import { MyLearning } from './routes/learning/MyLearning'

import { Disputes } from './routes/disputes/Disputes'
import { DisputeDetail } from './routes/disputes/DisputeDetail'

import { Plans } from './routes/billing/Plans'
import { Billing } from './routes/billing/Billing'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/welcome" replace />} />

        {/* A · Identity & onboarding */}
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify" element={<Verify />} />
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
        <Route path="/book/:id/confirmed" element={<BookingConfirmed />} />
        <Route path="/bookings" element={<MyBookings />} />
        <Route path="/post-job" element={<PostJob />} />
        <Route path="/quotes" element={<Quotes />} />

        {/* C · Commerce */}
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/track/:orderId" element={<TrackDelivery />} />
        <Route path="/order/:orderId" element={<OrderReturn />} />

        {/* D · Money */}
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/wallet/add" element={<AddMoney />} />
        <Route path="/escrow" element={<Escrow />} />
        <Route path="/transactions" element={<Transactions />} />

        {/* E · Chat & trust */}
        <Route path="/messages" element={<Messages />} />
        <Route path="/chat/:id" element={<ChatThread />} />
        <Route path="/trust" element={<Trust />} />

        {/* F · Provider side */}
        <Route path="/provider" element={<ProviderDashboard />} />
        <Route path="/provider/jobs" element={<OpenJobs />} />
        <Route path="/provider/jobs/:id/quote" element={<SendQuote />} />
        <Route path="/provider/requests" element={<Requests />} />
        <Route path="/provider/availability" element={<Availability />} />
        <Route path="/provider/services" element={<Services />} />
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
        <Route path="/disputes/new/:refId" element={<DisputeDetail />} />

        {/* K · Subscription billing */}
        <Route path="/plans" element={<Plans />} />
        <Route path="/billing" element={<Billing />} />
      </Routes>
    </BrowserRouter>
  )
}
