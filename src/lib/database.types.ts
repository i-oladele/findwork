/**
 * Types for the FindWork Postgres schema.
 *
 * Hand-written to mirror supabase/migrations/*.sql exactly, in the shape
 * `supabase gen types typescript` produces. Once a hosted project exists,
 * regenerate rather than edit:
 *
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Keep this in sync with any new migration.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/* ---- Check-constraint unions -------------------------------------------- */

export type BookingStatus = 'pending' | 'active' | 'done' | 'cancelled'
export type OrderStatus = 'placed' | 'dispatched' | 'delivered' | 'returned' | 'cancelled'
export type DeliverySpeed = 'same-day' | 'standard'
export type WalletKind =
  | 'escrow'
  | 'release'
  | 'order'
  | 'topup'
  | 'fee'
  | 'subscription'
  | 'refund'
  | 'course'
  | 'withdrawal'
  | 'adjustment'
export type MessageKind = 'text' | 'voice' | 'image' | 'video' | 'file'
export type PackageStatus = 'live' | 'paused'
export type JobStatus = 'open' | 'closed'
export type QuoteStatus = 'sent' | 'accepted' | 'declined'
export type RfqStatus = 'open' | 'quoted' | 'closed'
export type ClassifiedCategory = 'Rentals' | 'Used goods'
export type DisputeStatus = 'open' | 'resolved'
export type DisputeRefType = 'order' | 'booking'
export type DisputeOutcome = 'release' | 'refund' | 'dismissed'
export type CourseKind = 'course' | 'internship'
export type NotificationKind =
  | 'booking'
  | 'quote'
  | 'message'
  | 'payment'
  | 'dispute'
  | 'review'
  | 'system'
  | 'order'
  | 'support'
export type ReportTargetType = 'classified' | 'message' | 'profile' | 'job' | 'rfq'
export type ReportStatus = 'open' | 'actioned' | 'dismissed'
export type SupportTopic = 'payments' | 'bookings' | 'orders' | 'account' | 'bug' | 'other'
export type PaymentIntentStatus = 'pending' | 'success' | 'failed'
export type WithdrawalStatus = 'requested' | 'paid' | 'rejected'

type Rel<Name extends string, Col extends string, Ref extends string, One extends boolean = false> = {
  foreignKeyName: Name
  columns: [Col]
  isOneToOne: One
  referencedRelation: Ref
  referencedColumns: ['id']
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          phone: string
          email: string
          location: string | null
          address: string | null
          area: string | null
          lat: number | null
          lng: number | null
          avatar_url: string | null
          is_admin: boolean
          created_at: string
          deleted_at: string | null
        }
        /** Created by the handle_new_user trigger, never by the client. */
        Insert: never
        /** Column grants allow only these. */
        Update: {
          full_name?: string
          phone?: string
          location?: string | null
          address?: string | null
          area?: string | null
          avatar_url?: string | null
        }
        Relationships: []
      }
      provider_profiles: {
        Row: {
          id: string
          business_name: string
          category: string
          location: string
          bio: string | null
          price: number
          price_unit: string
          verified: boolean
          rating: number
          reviews: number
          jobs_done: number
          trust_score: number
          taking_bookings: boolean
          plan: string
          priority: number
          area: string | null
          lat: number | null
          lng: number | null
          photo_urls: string[]
          created_at: string
        }
        /** verified, rating, plan etc. are not client-writable (column grants). */
        Insert: {
          id: string
          business_name: string
          category: string
          location: string
          bio?: string | null
          price?: number
          price_unit?: string
          taking_bookings?: boolean
          area?: string | null
        }
        Update: {
          business_name?: string
          category?: string
          location?: string
          bio?: string | null
          price?: number
          price_unit?: string
          taking_bookings?: boolean
          area?: string | null
          photo_urls?: string[]
        }
        Relationships: [Rel<'provider_profiles_id_fkey', 'id', 'profiles', true>]
      }
      provider_packages: {
        Row: {
          id: string
          provider_id: string
          name: string
          price: number
          detail: string | null
          status: PackageStatus
          duration_minutes: number
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          name: string
          price: number
          detail?: string | null
          status?: PackageStatus
          duration_minutes?: number
          created_at?: string
        }
        Update: {
          name?: string
          price?: number
          detail?: string | null
          status?: PackageStatus
          duration_minutes?: number
        }
        Relationships: [Rel<'provider_packages_provider_id_fkey', 'provider_id', 'provider_profiles'>]
      }
      provider_availability: {
        Row: {
          provider_id: string
          monday: boolean
          tuesday: boolean
          wednesday: boolean
          thursday: boolean
          friday: boolean
          saturday: boolean
          sunday: boolean
        }
        Insert: {
          provider_id: string
          monday?: boolean
          tuesday?: boolean
          wednesday?: boolean
          thursday?: boolean
          friday?: boolean
          saturday?: boolean
          sunday?: boolean
        }
        Update: {
          monday?: boolean
          tuesday?: boolean
          wednesday?: boolean
          thursday?: boolean
          friday?: boolean
          saturday?: boolean
          sunday?: boolean
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          provider_id: string
          provider_name: string
          customer_id: string
          package_id: string | null
          service: string
          price: number
          fee: number
          commission: number
          start_at: string
          duration_minutes: number
          /** Generated column (tstzrange). Read-only. */
          slot_range: string
          status: BookingStatus
          escrow_held: number
          cancelled_by: string | null
          cancelled_at: string | null
          created_at: string
        }
        /** No client write policy — pay_booking, respond_to_booking, cancel_booking, complete_booking. */
        Insert: never
        Update: never
        Relationships: [
          Rel<'bookings_customer_id_fkey', 'customer_id', 'profiles'>,
          Rel<'bookings_provider_id_fkey', 'provider_id', 'provider_profiles'>,
        ]
      }
      booking_reschedules: {
        Row: {
          id: string
          booking_id: string
          requested_by: string
          previous_start_at: string
          proposed_start_at: string
          reason: string
          status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
          created_at: string
          responded_at: string | null
        }
        Insert: never
        Update: never
        Relationships: [Rel<'booking_reschedules_booking_id_fkey', 'booking_id', 'bookings'>]
      }
      products: {
        Row: {
          id: string
          name: string
          price: number
          vendor: string
          variant: string | null
          image_url: string | null
          created_at: string
        }
        /** Catalog data — service-role writes only. */
        Insert: never
        Update: never
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          customer_id: string
          total: number
          delivery_speed: DeliverySpeed
          delivery_fee: number
          delivery_address: string | null
          contact_phone: string | null
          status: OrderStatus
          placed_at: string
          updated_at: string
        }
        /** No client write policy — place_order, cancel_order, admin_set_order_status. */
        Insert: never
        Update: never
        Relationships: [Rel<'orders_customer_id_fkey', 'customer_id', 'profiles'>]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          name: string
          price: number
          qty: number
        }
        Insert: never
        Update: never
        Relationships: [
          Rel<'order_items_order_id_fkey', 'order_id', 'orders'>,
          Rel<'order_items_product_id_fkey', 'product_id', 'products'>,
        ]
      }
      wallet_transactions: {
        Row: {
          id: string
          profile_id: string
          label: string
          kind: WalletKind
          balance_delta: number
          escrow_delta: number
          booking_id: string | null
          order_id: string | null
          withdrawal_id: string | null
          created_at: string
        }
        /** Append-only ledger — every row is written by a SECURITY DEFINER function. */
        Insert: never
        Update: never
        Relationships: []
      }
      chat_threads: {
        Row: { id: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      thread_participants: {
        Row: { thread_id: string; profile_id: string; last_read_at: string }
        Insert: never
        Update: never
        Relationships: [
          Rel<'thread_participants_profile_id_fkey', 'profile_id', 'profiles'>,
          Rel<'thread_participants_thread_id_fkey', 'thread_id', 'chat_threads'>,
        ]
      }
      chat_messages: {
        Row: {
          id: string
          thread_id: string
          sender_id: string
          text: string
          kind: MessageKind
          attachment_path: string | null
          attachment_name: string | null
          attachment_mime: string | null
          attachment_bytes: number | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          sender_id: string
          text?: string
          kind?: MessageKind
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      job_posts: {
        Row: {
          id: string
          customer_id: string
          title: string
          description: string
          budget: number
          needed_by: string | null
          status: JobStatus
          quote_count: number
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          title: string
          description: string
          budget: number
          needed_by?: string | null
          status?: JobStatus
          created_at?: string
        }
        Update: {
          title?: string
          description?: string
          budget?: number
          needed_by?: string | null
          status?: JobStatus
        }
        Relationships: [Rel<'job_posts_customer_id_fkey', 'customer_id', 'profiles'>]
      }
      sent_quotes: {
        Row: {
          id: string
          job_id: string
          provider_id: string
          price: number
          days: number
          start_day: string | null
          message: string | null
          status: QuoteStatus
          created_at: string
        }
        Insert: {
          job_id: string
          provider_id: string
          price: number
          days: number
          start_day?: string | null
          message?: string | null
        }
        Update: never
        Relationships: [
          Rel<'sent_quotes_job_id_fkey', 'job_id', 'job_posts'>,
          Rel<'sent_quotes_provider_id_fkey', 'provider_id', 'profiles'>,
        ]
      }
      rfqs: {
        Row: {
          id: string
          buyer_id: string
          title: string
          description: string
          quantity: string | null
          budget_max: number | null
          deadline: string | null
          status: RfqStatus
          created_at: string
        }
        Insert: {
          id?: string
          buyer_id: string
          title: string
          description: string
          quantity?: string | null
          budget_max?: number | null
          deadline?: string | null
          status?: RfqStatus
          created_at?: string
        }
        Update: {
          title?: string
          description?: string
          quantity?: string | null
          budget_max?: number | null
          deadline?: string | null
          status?: RfqStatus
        }
        Relationships: [Rel<'rfqs_buyer_id_fkey', 'buyer_id', 'profiles'>]
      }
      rfq_quotes: {
        Row: {
          id: string
          rfq_id: string
          supplier_id: string
          price: number
          message: string | null
          lead_time: string | null
          accepted: boolean
          created_at: string
        }
        Insert: {
          rfq_id: string
          supplier_id: string
          price: number
          message?: string | null
          lead_time?: string | null
        }
        Update: never
        Relationships: [
          Rel<'rfq_quotes_rfq_id_fkey', 'rfq_id', 'rfqs'>,
          Rel<'rfq_quotes_supplier_id_fkey', 'supplier_id', 'profiles'>,
        ]
      }
      classifieds: {
        Row: {
          id: string
          seller_id: string
          title: string
          price: number
          category: ClassifiedCategory
          location: string
          description: string
          photo_urls: string[]
          created_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          title: string
          price: number
          category: ClassifiedCategory
          location: string
          description: string
          photo_urls?: string[]
          created_at?: string
        }
        Update: {
          title?: string
          price?: number
          category?: ClassifiedCategory
          location?: string
          description?: string
          photo_urls?: string[]
        }
        Relationships: [Rel<'classifieds_seller_id_fkey', 'seller_id', 'profiles'>]
      }
      disputes: {
        Row: {
          id: string
          raised_by: string
          against_id: string | null
          ref_id: string
          ref_type: DisputeRefType
          reason: string
          evidence_paths: string[]
          status: DisputeStatus
          outcome: DisputeOutcome | null
          resolution_note: string | null
          resolved_by: string | null
          resolved_at: string | null
          opened_at: string
        }
        /** Opened through open_dispute, settled through resolve_dispute. */
        Insert: never
        Update: never
        Relationships: [
          Rel<'disputes_raised_by_fkey', 'raised_by', 'profiles'>,
          Rel<'disputes_against_id_fkey', 'against_id', 'profiles'>,
        ]
      }
      courses: {
        Row: {
          id: string
          title: string
          category: string
          kind: CourseKind
          price: number
          instructor: string
          rating: number
          description: string
          image_url: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      course_lessons: {
        Row: {
          id: string
          course_id: string
          title: string
          minutes: number
          position: number
          body: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      enrollments: {
        Row: {
          profile_id: string
          course_id: string
          progress: number
          enrolled_at: string
        }
        /** No client write policy — enroll_in_course / complete_lesson. */
        Insert: never
        Update: never
        Relationships: []
      }
      lesson_completions: {
        Row: { profile_id: string; lesson_id: string; completed_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          name: string
          price: number
          features: string[]
          commission_rate: number
          listing_limit: number | null
          priority: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      subscriptions: {
        Row: { profile_id: string; plan: string; since: string; renews_at: string | null }
        /** No client write policy — subscribe_plan. */
        Insert: never
        Update: never
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          booking_id: string
          reviewer_id: string
          provider_id: string
          rating: number
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          reviewer_id: string
          provider_id: string
          rating: number
          body?: string
          created_at?: string
        }
        Update: { rating?: number; body?: string }
        Relationships: [
          Rel<'reviews_reviewer_id_fkey', 'reviewer_id', 'profiles'>,
          Rel<'reviews_provider_id_fkey', 'provider_id', 'provider_profiles'>,
          Rel<'reviews_booking_id_fkey', 'booking_id', 'bookings', true>,
        ]
      }
      notifications: {
        Row: {
          id: string
          profile_id: string
          kind: NotificationKind
          title: string
          body: string
          ref_type: string | null
          ref_id: string | null
          read_at: string | null
          created_at: string
        }
        /** Written server-side; clients only mark read. */
        Insert: never
        Update: { read_at?: string | null }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          reporter_id: string
          target_type: ReportTargetType
          target_id: string
          reason: string
          details: string | null
          status: ReportStatus
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          reporter_id: string
          target_type: ReportTargetType
          target_id: string
          reason: string
          details?: string | null
        }
        Update: never
        Relationships: [Rel<'reports_reporter_id_fkey', 'reporter_id', 'profiles'>]
      }
      support_requests: {
        Row: {
          id: string
          profile_id: string
          topic: SupportTopic
          message: string
          status: 'open' | 'closed'
          reply: string | null
          created_at: string
          closed_at: string | null
        }
        Insert: { profile_id: string; topic: SupportTopic; message: string }
        Update: never
        Relationships: [Rel<'support_requests_profile_id_fkey', 'profile_id', 'profiles'>]
      }
      payment_intents: {
        Row: {
          id: string
          profile_id: string
          reference: string
          amount: number
          provider: string
          status: PaymentIntentStatus
          created_at: string
          paid_at: string | null
        }
        /** Created by the paystack-initialize Edge Function. */
        Insert: never
        Update: never
        Relationships: []
      }
      payout_accounts: {
        Row: {
          profile_id: string
          bank_name: string
          account_number: string
          account_name: string
          updated_at: string
        }
        Insert: {
          profile_id: string
          bank_name: string
          account_number: string
          account_name: string
          updated_at?: string
        }
        Update: {
          bank_name?: string
          account_number?: string
          account_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_areas: {
        Row: { name: string; city: string; lat: number; lng: number }
        Insert: never
        Update: never
        Relationships: []
      }
      favourites: {
        Row: { profile_id: string; provider_id: string; created_at: string }
        Insert: { profile_id: string; provider_id: string }
        Update: never
        Relationships: [Rel<'favourites_provider_id_fkey', 'provider_id', 'provider_profiles'>]
      }
      withdrawals: {
        Row: {
          id: string
          profile_id: string
          amount: number
          bank_name: string
          account_number: string
          account_name: string
          status: WithdrawalStatus
          note: string | null
          processed_by: string | null
          processed_at: string | null
          created_at: string
        }
        /** request_withdrawal / admin_process_withdrawal. */
        Insert: never
        Update: never
        Relationships: [Rel<'withdrawals_profile_id_fkey', 'profile_id', 'profiles'>]
      }
    }
    Views: Record<never, never>
    Functions: {
      wallet_summary: {
        Args: { p_profile_id: string }
        Returns: { balance: number; escrow_held: number }[]
      }
      get_my_profile: {
        Args: Record<never, never>
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      is_admin: {
        Args: Record<never, never>
        Returns: boolean
      }
      get_or_create_thread: {
        Args: { p_other_profile_id: string }
        Returns: string
      }
      mark_thread_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      send_chat_attachment: {
        Args: { p_message_id: string; p_thread_id: string; p_path: string; p_name: string; p_text: string }
        Returns: string
      }
      pay_booking: {
        Args: { p_provider_id: string; p_package_id: string | null; p_start_at: string }
        Returns: string
      }
      respond_to_booking: {
        Args: { p_booking_id: string; p_accept: boolean }
        Returns: undefined
      }
      cancel_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      complete_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      provider_busy_slots: {
        Args: { p_provider_id: string; p_from: string; p_to: string }
        Returns: { start_at: string; end_at: string }[]
      }
      reschedule_busy_slots: {
        Args: { p_booking_id: string; p_from: string; p_to: string }
        Returns: { start_at: string; end_at: string }[]
      }
      request_booking_reschedule: {
        Args: { p_booking_id: string; p_start_at: string; p_reason: string }
        Returns: string
      }
      respond_booking_reschedule: {
        Args: { p_request_id: string; p_action: 'accept' | 'decline' | 'withdraw' }
        Returns: undefined
      }
      accept_job_quote: {
        Args: { p_quote_id: string; p_start_at: string }
        Returns: string
      }
      place_order: {
        Args: { p_items: Json; p_delivery_speed: DeliverySpeed; p_address: string; p_phone: string }
        /** One order id per seller in the cart. */
        Returns: string[]
      }
      cancel_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      admin_set_order_status: {
        Args: { p_order_id: string; p_status: 'dispatched' | 'delivered' }
        Returns: undefined
      }
      enroll_in_course: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      complete_lesson: {
        Args: { p_lesson_id: string }
        Returns: number
      }
      subscribe_plan: {
        Args: { p_plan: string }
        Returns: undefined
      }
      accept_rfq_quote: {
        Args: { p_quote_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      open_dispute: {
        Args: {
          p_ref_type: DisputeRefType
          p_ref_id: string
          p_reason: string
          p_evidence_paths?: string[]
        }
        Returns: string
      }
      resolve_dispute: {
        Args: { p_dispute_id: string; p_outcome: DisputeOutcome; p_note: string }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: { p_report_id: string; p_action: 'remove' | 'dismiss' }
        Returns: undefined
      }
      admin_reply_support: {
        Args: { p_request_id: string; p_reply: string }
        Returns: undefined
      }
      admin_set_provider_verified: {
        Args: { p_provider_id: string; p_verified: boolean }
        Returns: undefined
      }
      admin_adjust_balance: {
        Args: { p_profile_id: string; p_amount: number; p_reason: string }
        Returns: undefined
      }
      admin_find_profiles: {
        Args: { p_query: string }
        Returns: { id: string; full_name: string; email: string; phone: string; balance: number }[]
      }
      request_withdrawal: {
        Args: { p_amount: number }
        Returns: string
      }
      admin_process_withdrawal: {
        Args: { p_withdrawal_id: string; p_paid: boolean; p_note: string }
        Returns: undefined
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/* ---- Convenience aliases ------------------------------------------------ */

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Fn<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T]

export type Profile = Tables<'profiles'>
export type ProviderProfile = Tables<'provider_profiles'>
export type ProviderPackage = Tables<'provider_packages'>
export type Booking = Tables<'bookings'>
export type BookingReschedule = Tables<'booking_reschedules'>
export type Product = Tables<'products'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type WalletTransaction = Tables<'wallet_transactions'>
export type ChatMessage = Tables<'chat_messages'>
export type JobPost = Tables<'job_posts'>
export type SentQuote = Tables<'sent_quotes'>
export type Rfq = Tables<'rfqs'>
export type RfqQuote = Tables<'rfq_quotes'>
export type Classified = Tables<'classifieds'>
export type Dispute = Tables<'disputes'>
export type Course = Tables<'courses'>
export type CourseLesson = Tables<'course_lessons'>
export type Enrollment = Tables<'enrollments'>
export type SubscriptionPlan = Tables<'subscription_plans'>
export type Subscription = Tables<'subscriptions'>
export type Review = Tables<'reviews'>
export type NotificationRow = Tables<'notifications'>
export type Report = Tables<'reports'>
export type SupportRequest = Tables<'support_requests'>
export type PaymentIntent = Tables<'payment_intents'>
export type PayoutAccount = Tables<'payout_accounts'>
export type Withdrawal = Tables<'withdrawals'>
export type ServiceArea = Tables<'service_areas'>
export type Favourite = Tables<'favourites'>
