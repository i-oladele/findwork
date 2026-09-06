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
export type OrderStatus = 'placed' | 'delivered' | 'returned'
export type DeliverySpeed = 'same-day' | 'standard'
export type WalletKind = 'escrow' | 'release' | 'order' | 'topup' | 'fee' | 'subscription'
export type MessageKind = 'text' | 'voice'
export type PackageStatus = 'live' | 'paused'
export type JobStatus = 'open' | 'closed'
export type RequestStatus = 'new' | 'accepted' | 'declined'
export type RfqStatus = 'open' | 'quoted' | 'closed'
export type ClassifiedCategory = 'Rentals' | 'Used goods'
export type DisputeStatus = 'open' | 'resolved'
export type DisputeRefType = 'order' | 'booking'
export type CourseKind = 'course' | 'internship'
export type NotificationKind =
  | 'booking'
  | 'quote'
  | 'message'
  | 'payment'
  | 'dispute'
  | 'review'
  | 'system'

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
          avatar_url: string | null
          is_admin: boolean
          created_at: string
        }
        Insert: {
          id: string
          full_name?: string
          phone?: string
          email: string
          location?: string | null
          avatar_url?: string | null
          is_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string
          email?: string
          location?: string | null
          avatar_url?: string | null
          is_admin?: boolean
          created_at?: string
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
          created_at: string
        }
        Insert: {
          id: string
          business_name: string
          category: string
          location: string
          bio?: string | null
          price?: number
          price_unit?: string
          verified?: boolean
          rating?: number
          reviews?: number
          jobs_done?: number
          trust_score?: number
          taking_bookings?: boolean
          created_at?: string
        }
        Update: {
          business_name?: string
          category?: string
          location?: string
          bio?: string | null
          price?: number
          price_unit?: string
          verified?: boolean
          rating?: number
          reviews?: number
          jobs_done?: number
          trust_score?: number
          taking_bookings?: boolean
        }
        Relationships: []
      }
      provider_packages: {
        Row: {
          id: string
          provider_id: string
          name: string
          price: number
          detail: string | null
          status: PackageStatus
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          name: string
          price: number
          detail?: string | null
          status?: PackageStatus
          created_at?: string
        }
        Update: {
          name?: string
          price?: number
          detail?: string | null
          status?: PackageStatus
        }
        Relationships: []
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
          service: string
          price: number
          fee: number
          start_at: string
          duration_minutes: number
          /** Generated column (tstzrange). Read-only. */
          slot_range: string
          status: BookingStatus
          escrow_held: number
          created_at: string
        }
        /** No client insert/update policy — writes go through pay_booking / complete_booking. */
        Insert: never
        Update: never
        Relationships: []
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
          status: OrderStatus
          placed_at: string
        }
        /** No client insert policy — writes go through place_order. */
        Insert: never
        Update: never
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          thread_id: string
          sender_id: string
          text: string
          kind: MessageKind
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
        Update: { status?: JobStatus }
        Relationships: []
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
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          provider_id: string
          price: number
          days: number
          start_day?: string | null
          message?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      provider_requests: {
        Row: {
          id: string
          provider_id: string
          customer_id: string
          service: string
          requested_at: string | null
          price: number
          status: RequestStatus
          expires_at: string | null
          created_at: string
        }
        /** No client insert policy — responded to via respond_to_request. */
        Insert: never
        Update: never
        Relationships: []
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
        Update: never
        Relationships: []
      }
      rfq_quotes: {
        Row: {
          id: string
          rfq_id: string
          supplier_id: string
          price: number
          message: string | null
          accepted: boolean
          created_at: string
        }
        Insert: {
          id?: string
          rfq_id: string
          supplier_id: string
          price: number
          message?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
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
          created_at?: string
        }
        Update: {
          title?: string
          price?: number
          category?: ClassifiedCategory
          location?: string
          description?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          id: string
          raised_by: string
          ref_id: string
          ref_type: DisputeRefType
          reason: string
          status: DisputeStatus
          opened_at: string
        }
        Insert: {
          id?: string
          raised_by: string
          ref_id: string
          ref_type: DisputeRefType
          reason: string
          status?: DisputeStatus
          opened_at?: string
        }
        Update: never
        Relationships: []
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
        /** No client insert/update policy — enroll_in_course / advance_progress. */
        Insert: never
        Update: never
        Relationships: []
      }
      subscription_plans: {
        Row: { id: string; name: string; price: number; features: string[] }
        Insert: never
        Update: never
        Relationships: []
      }
      subscriptions: {
        Row: { profile_id: string; plan: string; since: string }
        /** No client insert/update policy — subscribe_plan. */
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
        Relationships: []
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
    }
    Views: Record<never, never>
    Functions: {
      wallet_summary: {
        Args: { p_profile_id: string }
        Returns: { balance: number; escrow_held: number }[]
      }
      get_or_create_thread: {
        Args: { p_other_profile_id: string }
        Returns: string
      }
      mark_thread_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      add_money: {
        Args: { p_amount: number }
        Returns: undefined
      }
      pay_booking: {
        Args: {
          p_provider_id: string
          p_service: string
          p_price: number
          p_start_at: string
          p_duration_minutes?: number
        }
        Returns: string
      }
      complete_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      place_order: {
        Args: { p_items: Json; p_delivery_speed: DeliverySpeed }
        Returns: string
      }
      enroll_in_course: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      advance_progress: {
        Args: { p_course_id: string; p_lesson_count: number }
        Returns: undefined
      }
      subscribe_plan: {
        Args: { p_plan: string }
        Returns: undefined
      }
      respond_to_request: {
        Args: { p_request_id: string; p_accept: boolean }
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
export type Product = Tables<'products'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type WalletTransaction = Tables<'wallet_transactions'>
export type ChatMessage = Tables<'chat_messages'>
export type JobPost = Tables<'job_posts'>
export type SentQuote = Tables<'sent_quotes'>
export type ProviderRequest = Tables<'provider_requests'>
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
