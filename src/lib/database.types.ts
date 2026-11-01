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
export type SavedAddress = Database['public']['Tables']['saved_addresses']['Row']
export type ProviderMedia = Database['public']['Tables']['provider_media']['Row']

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
  | 'transfer'
  | 'delivery'
export type MessageKind = 'text' | 'voice' | 'image' | 'video' | 'file'
export type PackageStatus = 'live' | 'paused'
export type JobStatus = 'open' | 'closed'
export type QuoteStatus = 'sent' | 'accepted' | 'declined' | 'withdrawn'
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
export type ReportTargetType = 'classified' | 'message' | 'profile' | 'job' | 'rfq' | 'post' | 'stream'
export type ReportStatus = 'open' | 'actioned' | 'dismissed'
export type SupportTopic = 'payments' | 'bookings' | 'orders' | 'account' | 'bug' | 'other'
export type PaymentPurpose = 'topup' | 'checkout' | 'plan' | 'renewal'
export type VerificationIdType = 'nin' | 'bvn' | 'passport' | 'drivers_licence' | 'voters_card'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'
/** refund_due / refunded: paid into an account deleted before it landed. */
export type PaymentIntentStatus = 'pending' | 'success' | 'failed' | 'refund_due' | 'refunded'
export type WithdrawalStatus = 'requested' | 'paid' | 'rejected'
/** One stage of a job paid in stages; the amounts add up to the quote's price. */
export type QuoteMilestone = { title: string; amount: number }
export type MilestoneStatus = 'pending' | 'released' | 'refunded'
export type RiderVehicle = 'bicycle' | 'motorcycle' | 'car' | 'van'
export type RiderStatus = 'pending' | 'approved' | 'rejected'
export type DeliveryStatus = 'awaiting_rider' | 'assigned' | 'picked_up' | 'delivered' | 'cancelled'
export type Language = 'en' | 'pcm' | 'yo' | 'ig' | 'ha'
export type MeetupStatus = 'proposed' | 'confirmed' | 'completed' | 'cancelled'
export type OrgRole = 'owner' | 'approver' | 'buyer'
export type PurchaseOrderStatus = 'pending_approval' | 'rejected' | 'funded' | 'delivered' | 'on_hold' | 'completed' | 'cancelled' | 'refunded'
export type InternshipApplicationStatus = 'submitted' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn'
export type StreamStatus = 'scheduled' | 'live' | 'ended'
export type StaffRole = 'admin' | 'moderator' | 'finance' | 'support'
/** Who answers an SOS first, and who is called in when they do not. */
export type SosDuty = 'primary' | 'backup'
export type SecurityEventKind = 'sign_in' | 'new_device' | 'mfa_enrolled' | 'mfa_removed' | 'mfa_recovered' | 'suspended' | 'reinstated' | 'role_changed' | 'sos'
export type RiskSeverity = 'low' | 'medium' | 'high'
export type RiskAlertStatus = 'open' | 'reviewed' | 'dismissed'

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
      social_posts: {
        Row: { id: string; author_id: string; kind: 'story' | 'reel'; media_path: string; mime: string; caption: string; product_id: string | null; expires_at: string | null; views: number; likes: number; status: 'live' | 'removed'; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      post_likes: {
        Row: { post_id: string; profile_id: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      live_streams: {
        /** video 'livekit': FindWork carries the video and playback_url is null; 'link': it plays from playback_url. */
        Row: { id: string; seller_id: string; title: string; video: 'link' | 'livekit'; playback_url: string | null; status: StreamStatus; scheduled_for: string | null; started_at: string | null; ended_at: string | null; pinned_product_id: string | null; peak_viewers: number; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'live_streams_seller_id_fkey', 'seller_id', 'provider_profiles'>]
      }
      stream_products: {
        Row: { stream_id: string; product_id: string; position: number }
        Insert: never
        Update: never
        Relationships: [Rel<'stream_products_product_id_fkey', 'product_id', 'products'>]
      }
      stream_messages: {
        Row: { id: string; stream_id: string; sender_id: string; body: string; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'stream_messages_sender_id_fkey', 'sender_id', 'profiles'>]
      }
      quiz_questions: {
        /** The correct answer is not readable. */
        Row: { id: string; course_id: string; position: number; prompt: string; options: string[] }
        Insert: never
        Update: never
        Relationships: []
      }
      quiz_attempts: {
        Row: { id: string; profile_id: string; course_id: string; score: number; passed: boolean; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      certificates: {
        Row: { id: string; profile_id: string; course_id: string; code: string; holder_name: string; course_title: string; score: number | null; issued_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      internships: {
        Row: { id: string; employer_id: string; company: string; title: string; description: string; skills: string[]; area: string | null; location: string | null; duration: string | null; stipend: number | null; closes_on: string | null; status: 'open' | 'closed'; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      internship_applications: {
        Row: { id: string; internship_id: string; applicant_id: string; cover_note: string; match_score: number; matched_skills: string[]; status: InternshipApplicationStatus; created_at: string; decided_at: string | null }
        Insert: never
        Update: never
        Relationships: [Rel<'internship_applications_applicant_id_fkey', 'applicant_id', 'profiles'>]
      }
      organizations: {
        Row: { id: string; name: string; owner_id: string; approval_threshold: number; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      organization_members: {
        Row: { organization_id: string; profile_id: string; role: OrgRole; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'organization_members_profile_id_fkey', 'profile_id', 'profiles'>, Rel<'organization_members_organization_id_fkey', 'organization_id', 'organizations'>]
      }
      organization_suppliers: {
        Row: { organization_id: string; supplier_id: string; status: 'approved' | 'blocked'; note: string | null; added_by: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      rfq_items: {
        Row: { rfq_id: string; position: number; description: string; quantity: number; unit: string }
        Insert: never
        Update: never
        Relationships: []
      }
      purchase_orders: {
        Row: { id: string; number: number; rfq_id: string; quote_id: string; organization_id: string | null; buyer_id: string; payer_id: string; supplier_id: string; title: string; amount: number; commission: number; escrow_held: number; status: PurchaseOrderStatus; decided_by: string | null; decision_note: string | null; hold_reason: string | null; funded_at: string | null; delivered_at: string | null; closed_at: string | null; stock_received_at: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'purchase_orders_supplier_id_fkey', 'supplier_id', 'profiles'>, Rel<'purchase_orders_buyer_id_fkey', 'buyer_id', 'profiles'>, Rel<'purchase_orders_organization_id_fkey', 'organization_id', 'organizations'>]
      }
      stock_items: {
        Row: { id: string; organization_id: string | null; owner_id: string | null; name: string; unit: string; on_hand: number; reorder_level: number | null; created_at: string; updated_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      stock_movements: {
        Row: { id: string; item_id: string; delta: number; reason: 'received' | 'used' | 'counted'; purchase_order_id: string | null; note: string | null; actor_id: string; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'stock_movements_actor_id_fkey', 'actor_id', 'profiles'>]
      }
      invoices: {
        Row: { id: string; number: number; purchase_order_id: string; supplier_id: string; payer_id: string; organization_id: string | null; amount: number; status: 'issued' | 'paid' | 'void'; issued_at: string; paid_at: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      meetups: {
        Row: { id: string; classified_id: string | null; title: string; buyer_id: string; seller_id: string; place: string; meet_at: string; status: MeetupStatus; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'meetups_buyer_id_fkey', 'buyer_id', 'profiles'>, Rel<'meetups_seller_id_fkey', 'seller_id', 'profiles'>]
      }
      trusted_contacts: {
        Row: { id: string; profile_id: string; name: string; phone: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      sos_alerts: {
        Row: { id: string; profile_id: string; meetup_id: string | null; lat: number | null; lng: number | null; note: string | null; status: 'open' | 'handled'; handled_by: string | null; handled_at: string | null; handled_note: string | null; created_at: string; assigned_to: string | null; acknowledged_by: string | null; acknowledged_at: string | null; escalation_level: number; escalated_at: string | null }
        Insert: never
        Update: never
        Relationships: [Rel<'sos_alerts_profile_id_fkey', 'profile_id', 'profiles'>]
      }
      sos_shifts: {
        /** The SOS on-call rota; readable by SOS staff, written through admin_save_sos_shift. */
        Row: { id: string; staff_id: string; duty: SosDuty; starts_at: string; ends_at: string; created_by: string; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'sos_shifts_staff_id_fkey', 'staff_id', 'profiles'>]
      }
      user_preferences: {
        Row: { profile_id: string; language: Language; muted_kinds: string[]; interests: string[]; skills: string[]; analytics: boolean; updated_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      push_subscriptions: {
        /** The keys are readable only by the sender. */
        Row: { id: string; profile_id: string; endpoint: string; label: string; created_at: string; last_sent_at: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      push_devices: {
        /** The iPhone and Android apps' FCM tokens; each person reads only their own. */
        Row: { id: string; profile_id: string; platform: 'ios' | 'android'; token: string; label: string; created_at: string; saved_at: string; last_sent_at: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      rider_profiles: {
        Row: { id: string; vehicle: RiderVehicle; plate: string | null; area: string | null; status: RiderStatus; note: string | null; reviewed_by: string | null; reviewed_at: string | null; online: boolean; lat: number | null; lng: number | null; located_at: string | null; deliveries_done: number; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'rider_profiles_id_fkey', 'id', 'profiles', true>]
      }
      deliveries: {
        /** The delivery code is not readable through the table; the customer gets it from delivery_tracking. */
        Row: { id: string; order_id: string; rider_id: string | null; status: DeliveryStatus; pickup_address: string | null; pickup_lat: number | null; pickup_lng: number | null; dropoff_address: string; dropoff_lat: number | null; dropoff_lng: number | null; rider_fee: number; eta_minutes: number | null; eta_at: string | null; eta_source: 'estimate' | 'routed'; assigned_at: string | null; picked_up_at: string | null; delivered_at: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'deliveries_order_id_fkey', 'order_id', 'orders', true>, Rel<'deliveries_rider_id_fkey', 'rider_id', 'rider_profiles'>]
      }
      product_variants: {
        Row: { id: string; product_id: string; name: string; price: number; stock: number | null; position: number; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      coupons: {
        Row: { id: string; code: string; seller_id: string | null; kind: 'percent' | 'fixed'; value: number; min_spend: number; max_discount: number | null; starts_at: string; ends_at: string | null; usage_limit: number | null; per_customer_limit: number; used_count: number; active: boolean; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      coupon_redemptions: {
        Row: { coupon_id: string; profile_id: string; order_id: string; amount: number; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      wallet_transfers: {
        Row: { id: string; sender_id: string; recipient_id: string; amount: number; note: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      booking_milestones: {
        Row: { id: string; booking_id: string; position: number; title: string; amount: number; status: MilestoneStatus; released_at: string | null }
        Insert: never
        Update: never
        Relationships: [Rel<'booking_milestones_booking_id_fkey', 'booking_id', 'bookings'>]
      }
      platform_limits: {
        Row: { tier: number; label: string; daily_withdrawal: number; daily_transfer: number }
        Insert: never
        Update: never
        Relationships: []
      }
      business_verifications: {
        Row: { id: string; profile_id: string; rc_number: string; business_name: string; document_path: string; status: VerificationStatus; note: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'business_verifications_profile_id_fkey', 'profile_id', 'profiles'>]
      }
      admin_actions: {
        Row: { id: string; actor_id: string; action: string; target_id: string | null; detail: Json; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      devices: {
        Row: { profile_id: string; device_id: string; label: string; last_ip: string | null; first_seen_at: string; last_seen_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      security_events: {
        Row: { id: string; profile_id: string; kind: SecurityEventKind; device_id: string | null; ip: string | null; detail: Json; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      risk_alerts: {
        Row: { id: string; profile_id: string; kind: string; severity: RiskSeverity; summary: string; detail: Json; ref_type: string | null; ref_id: string | null; status: RiskAlertStatus; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: [Rel<'risk_alerts_profile_id_fkey', 'profile_id', 'profiles'>]
      }
      dispute_responses: {
        Row: { id: string; dispute_id: string; author_id: string; author_role: 'claimant' | 'respondent' | 'moderator'; body: string; evidence_paths: string[]; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      quote_revisions: {
        Row: { quote_id: string; revision: number; price: number; days: number; start_day: string | null; message: string | null; status: QuoteStatus; milestones: QuoteMilestone[] | null; recorded_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      provider_media: {
        Row: { id: string; provider_id: string; kind: 'image' | 'video' | 'certificate'; path: string; mime: string; title: string; description: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      saved_addresses: {
        Row: { id: string; profile_id: string; label: string; recipient: string; phone: string; address: string; is_default: boolean; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          /** Built from first_name and last_name; what other people see. */
          full_name: string
          /** Only in your own row (get_my_profile); others see full_name. */
          first_name: string
          last_name: string
          phone: string
          email: string
          location: string | null
          address: string | null
          area: string | null
          lat: number | null
          lng: number | null
          avatar_url: string | null
          is_admin: boolean
          /** The part of the operator console this person may use; null for everyone else. */
          staff_role: StaffRole | null
          suspended_at: string | null
          /** Only in your own row. */
          suspended_reason: string | null
          created_at: string
          deleted_at: string | null
          /** Set by an admin approving a verification; null until then. */
          verified_at: string | null
          business_verified_at: string | null
          /** 0 unconfirmed, 1 contact confirmed, 2 ID verified, 3 business verified. */
          verification_tier: number
          /** 0 to 100; see private.trust_breakdown. */
          trust_score: number
          /** The address a pinned location was found at. Private, like lat/lng. */
          location_label: string | null
        }
        /** Created by the handle_new_user trigger, never by the client. */
        Insert: never
        /** Column grants allow only these. */
        Update: {
          full_name?: string
          first_name?: string
          last_name?: string
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
          /** What is still held: falls as stages are released. */
          escrow_held: number
          released_amount: number
          released_fee: number
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
          seller_id: string | null
          stock: number | null
          status: 'draft' | 'live' | 'hidden'
          description: string | null
          photo_urls: string[]
          updated_at: string
          variant: string | null
          image_url: string | null
          created_at: string
        }
        /**
         * Sellers write their own goods (row policy: seller_id = auth.uid()).
         * vendor is overwritten with the seller's business name by a trigger.
         */
        Insert: {
          seller_id: string
          name: string
          price: number
          vendor: string
          variant?: string | null
          description?: string | null
          stock?: number | null
          status?: 'draft' | 'live' | 'hidden'
          photo_urls?: string[]
        }
        Update: {
          name?: string
          price?: number
          variant?: string | null
          description?: string | null
          stock?: number | null
          status?: 'draft' | 'live' | 'hidden'
          photo_urls?: string[]
        }
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
          /** null for FindWork's own catalog; otherwise the provider selling. */
          seller_id: string | null
          seller_name: string | null
          items_total: number
          /** Held for the seller until delivery is confirmed; 0 once settled. */
          escrow_held: number
          commission: number
          dispatched_at: string | null
          /** What a coupon took off the goods; items_total is already net of it. */
          discount: number
          coupon_code: string | null
        }
        /** No client write policy — place_order, cancel_order, dispatch_order, confirm_order_received. */
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
          variant_id: string | null
          /** The option bought, as it was named at the time. */
          variant_name: string | null
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
          /** The calendar day it is needed by, when given; matching checks providers' calendars against it. */
          needed_on: string | null
          /** The trade wanted and where; both feed matching. */
          category: string | null
          area: string | null
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
          needed_on?: string | null
          category?: string | null
          area?: string | null
          status?: JobStatus
          created_at?: string
        }
        Update: {
          title?: string
          description?: string
          budget?: number
          needed_by?: string | null
          needed_on?: string | null
          category?: string | null
          area?: string | null
          status?: JobStatus
        }
        Relationships: [Rel<'job_posts_customer_id_fkey', 'customer_id', 'profiles'>]
      }
      sent_quotes: {
        Row: {
          revision: number
          id: string
          job_id: string
          provider_id: string
          price: number
          days: number
          start_day: string | null
          message: string | null
          status: QuoteStatus
          /** Null when the job is paid in one go. */
          milestones: QuoteMilestone[] | null
          created_at: string
        }
        Insert: {
          job_id: string
          provider_id: string
          price: number
          days: number
          start_day?: string | null
          message?: string | null
          milestones?: QuoteMilestone[] | null
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
          /** Set when the request is an organisation's; its owner's wallet pays. */
          organization_id: string | null
          /** 0 anyone, 2 ID verified, 3 a verified business. */
          min_supplier_tier: number
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
          /** A listed area; the listing sits at that area's centre, never the seller's own pin. */
          area: string | null
          lat: number | null
          lng: number | null
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
          area?: string | null
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
          status: 'draft' | 'live'
          /** The quiz score, out of 100, that earns the certificate. */
          pass_mark: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      course_lessons: {
        /** The material (body, video) is not readable from the table; it comes from course_content. */
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
        /** card_id: the saved card renewals are charged to; null renews from the wallet. */
        Row: { profile_id: string; plan: string; since: string; renews_at: string | null; card_id: string | null }
        /** No client write policy — subscribe_plan, set_plan_card. */
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
          refund_note: string | null
          refunded_by: string | null
          refunded_at: string | null
          purpose: PaymentPurpose
          /** What to do once paid: the cart for a checkout, the plan for a plan. */
          payload: Json
          /** The orders placed or plan changed after payment, or { error } when that could not be done. */
          outcome: Json | null
          card_id: string | null
          for_renews_at: string | null
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
          /** Set only by the payout-account Edge Function, once the bank has confirmed the account. */
          bank_code: string | null
          recipient_code: string | null
          verified_at: string | null
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
      identity_checks: {
        /** One answer from the national register (through Dojah) about an ID or business submission. */
        Row: {
          id: string; profile_id: string; subject_type: 'verification' | 'business_verification'; subject_id: string
          kind: 'nin' | 'bvn' | 'cac' | 'face' | 'sim'; provider: string; outcome: 'match' | 'mismatch' | 'not_found' | 'error'
          confidence: number | null; detail: Json; created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      payment_cards: {
        /** The code that charges the card never reaches the client. */
        Row: { id: string; profile_id: string; brand: string | null; last4: string; exp_month: number | null; exp_year: number | null; bank: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: []
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
          /** Automatic payouts: queued for Paystack, sent by it, or failed and back with staff. */
          recipient_code: string | null
          transfer_reference: string | null
          transfer_status: 'queued' | 'sent' | 'failed' | null
          transfer_code: string | null
          failure_reason: string | null
          transfer_requested_at: string | null
        }
        /** request_withdrawal / admin_process_withdrawal. */
        Insert: never
        Update: never
        Relationships: [Rel<'withdrawals_profile_id_fkey', 'profile_id', 'profiles'>]
      }
      verifications: {
        Row: {
          id: string
          profile_id: string
          id_type: VerificationIdType
          id_number: string
          /** In the private verification-documents bucket. */
          document_path: string
          selfie_path: string
          status: VerificationStatus
          /** Why it was rejected, shown to the person. */
          note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        /** submit_verification / admin_review_verification. */
        Insert: never
        Update: never
        Relationships: [Rel<'verifications_profile_id_fkey', 'profile_id', 'profiles'>]
      }
    }
    Views: Record<never, never>
    Functions: {
      match_providers_for_job: { Args: { p_job_id: string }; Returns: Json }
      invite_provider_to_job: { Args: { p_job_id: string; p_provider_id: string }; Returns: undefined }
      recommended_jobs: { Args: Record<never, never>; Returns: Json }
      recommended_providers: { Args: Record<never, never>; Returns: Json }
      recommended_products: { Args: { p_product_id: string | null }; Returns: Json }
      thread_context: { Args: { p_thread_id: string }; Returns: Json }
      set_analytics_consent: { Args: { p_allowed: boolean }; Returns: undefined }
      track_events: { Args: { p_session_id: string; p_events: Json }; Returns: undefined }
      admin_engagement: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_user_activity: { Args: { p_profile_id: string }; Returns: Json }
      publish_post: { Args: { p_kind: 'story' | 'reel'; p_path: string; p_caption: string; p_product_id: string | null }; Returns: string }
      remove_post: { Args: { p_post_id: string }; Returns: string }
      record_post_view: { Args: { p_post_id: string }; Returns: undefined }
      toggle_post_like: { Args: { p_post_id: string }; Returns: Json }
      social_feed: { Args: { p_kind: 'story' | 'reel' | null; p_author_id: string | null }; Returns: Json }
      schedule_stream: { Args: { p_title: string; p_playback_url: string | null; p_scheduled_for: string | null; p_product_ids: string[]; p_video?: 'link' | 'livekit' }; Returns: string }
      update_stream: { Args: { p_stream_id: string; p_action: 'start' | 'end' | 'pin'; p_product_id: string | null }; Returns: undefined }
      send_stream_message: { Args: { p_stream_id: string; p_body: string }; Returns: string }
      remove_stream_message: { Args: { p_message_id: string }; Returns: undefined }
      stream_heartbeat: { Args: { p_stream_id: string }; Returns: number }
      course_content: { Args: { p_course_id: string }; Returns: Json }
      submit_quiz: { Args: { p_course_id: string; p_answers: number[] }; Returns: Json }
      verify_certificate: { Args: { p_code: string }; Returns: Json }
      admin_save_course: {
        Args: { p_id: string | null; p_title: string; p_category: string; p_instructor: string; p_description: string; p_price: number; p_pass_mark: number; p_status: 'draft' | 'live'; p_lessons: Json; p_questions: Json }
        Returns: string
      }
      admin_course_quiz: { Args: { p_course_id: string }; Returns: Json }
      save_skills: { Args: { p_skills: string[] }; Returns: undefined }
      post_internship: {
        Args: { p_company: string; p_title: string; p_description: string; p_skills: string[]; p_area: string | null; p_location: string | null; p_duration: string | null; p_stipend: number | null; p_closes_on: string | null }
        Returns: string
      }
      close_internship: { Args: { p_internship_id: string }; Returns: undefined }
      apply_to_internship: { Args: { p_internship_id: string; p_cover_note: string }; Returns: string }
      update_internship_application: { Args: { p_application_id: string; p_status: InternshipApplicationStatus }; Returns: undefined }
      internship_matches: { Args: Record<never, never>; Returns: Json }
      org_role: { Args: { p_organization_id: string }; Returns: OrgRole | null }
      create_organization: { Args: { p_name: string; p_approval_threshold: number }; Returns: string }
      update_organization: { Args: { p_organization_id: string; p_name: string; p_approval_threshold: number }; Returns: undefined }
      set_organization_member: { Args: { p_organization_id: string; p_profile_id: string; p_role: 'approver' | 'buyer' | null }; Returns: undefined }
      set_organization_supplier: { Args: { p_organization_id: string; p_supplier_id: string; p_status: 'approved' | 'blocked' | null; p_note: string | null }; Returns: undefined }
      post_rfq: { Args: { p_organization_id: string | null; p_title: string; p_description: string; p_deadline: string | null; p_budget_max: number | null; p_min_supplier_tier: number; p_items: Json }; Returns: string }
      review_purchase_order: { Args: { p_po_id: string; p_approve: boolean; p_note: string }; Returns: undefined }
      mark_purchase_order_delivered: { Args: { p_po_id: string; p_stock: Json | null }; Returns: undefined }
      confirm_purchase_order: { Args: { p_po_id: string }; Returns: undefined }
      cancel_purchase_order: { Args: { p_po_id: string }; Returns: undefined }
      hold_purchase_order: { Args: { p_po_id: string; p_reason: string }; Returns: undefined }
      admin_resolve_purchase_order: { Args: { p_po_id: string; p_outcome: 'release' | 'refund'; p_note: string }; Returns: undefined }
      procurement_summary: { Args: { p_organization_id: string | null }; Returns: Json }
      remove_payment_card: { Args: { p_card_id: string }; Returns: undefined }
      set_plan_card: { Args: { p_card_id: string | null }; Returns: undefined }
      payout_policy: { Args: Record<never, never>; Returns: Json }
      admin_set_payout_policy: { Args: { p_enabled: boolean; p_max: number }; Returns: undefined }
      admin_retry_payout: { Args: { p_withdrawal_id: string }; Returns: undefined }
      admin_requeue_payout: { Args: { p_withdrawal_id: string; p_note: string }; Returns: undefined }
      save_stock_item: { Args: { p_item_id: string | null; p_organization_id: string | null; p_name: string; p_unit: string; p_reorder_level: number | null }; Returns: string }
      record_stock: { Args: { p_item_id: string; p_reason: 'used' | 'counted'; p_quantity: number; p_note: string | null }; Returns: undefined }
      receive_purchase_order_stock: { Args: { p_po_id: string; p_lines: Json }; Returns: number }
      nearby_classifieds: { Args: { p_lat: number; p_lng: number; p_radius_km: number; p_category: string | null }; Returns: Json }
      propose_meetup: { Args: { p_classified_id: string; p_place: string; p_meet_at: string }; Returns: string }
      update_meetup: { Args: { p_meetup_id: string; p_action: 'confirm' | 'complete' | 'cancel' }; Returns: undefined }
      start_location_share: { Args: { p_meetup_id: string; p_minutes: number }; Returns: string }
      update_location_share: { Args: { p_meetup_id: string; p_lat: number; p_lng: number }; Returns: undefined }
      stop_location_share: { Args: { p_meetup_id: string }; Returns: undefined }
      meetup_locations: { Args: { p_meetup_id: string }; Returns: Json }
      save_trusted_contact: { Args: { p_name: string; p_phone: string }; Returns: string }
      remove_trusted_contact: { Args: { p_contact_id: string }; Returns: undefined }
      raise_sos: { Args: { p_meetup_id: string | null; p_lat: number | null; p_lng: number | null; p_note: string | null }; Returns: string }
      admin_handle_sos: { Args: { p_alert_id: string; p_note: string }; Returns: undefined }
      admin_take_sos: { Args: { p_alert_id: string }; Returns: undefined }
      admin_sos_queue: {
        Args: Record<string, never>
        Returns: {
          id: string; profile_id: string; full_name: string; phone: string | null; lat: number | null; lng: number | null; note: string | null; created_at: string
          meetup_id: string | null; meetup_title: string | null; meetup_place: string | null; meet_at: string | null; other_id: string | null; other_name: string | null
          assigned_to: string | null; assigned_name: string | null; acknowledged_by: string | null; acknowledged_name: string | null; acknowledged_at: string | null
          escalation_level: number
        }[]
      }
      admin_sos_staff: { Args: Record<string, never>; Returns: { id: string; full_name: string; staff_role: StaffRole }[] }
      admin_save_sos_shift: { Args: { p_staff_id: string; p_duty: SosDuty; p_starts_at: string; p_ends_at: string }; Returns: string }
      admin_remove_sos_shift: { Args: { p_shift_id: string }; Returns: undefined }
      sos_rota_gaps: { Args: { p_from: string; p_to: string }; Returns: { starts_at: string; ends_at: string }[] }
      save_preferences: { Args: { p_language: Language; p_muted_kinds: string[]; p_interests: string[] }; Returns: undefined }
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_label: string }; Returns: undefined }
      remove_push_subscription: { Args: { p_endpoint: string }; Returns: undefined }
      save_push_device: { Args: { p_token: string; p_platform: 'ios' | 'android'; p_label: string }; Returns: undefined }
      remove_push_device: { Args: { p_token: string }; Returns: undefined }
      apply_as_rider: { Args: { p_vehicle: RiderVehicle; p_plate: string; p_area: string | null }; Returns: undefined }
      admin_review_rider: { Args: { p_rider_id: string; p_approve: boolean; p_note: string }; Returns: undefined }
      set_rider_online: { Args: { p_online: boolean }; Returns: undefined }
      update_rider_location: { Args: { p_lat: number; p_lng: number }; Returns: undefined }
      rider_available_deliveries: { Args: Record<never, never>; Returns: Json }
      accept_delivery: { Args: { p_delivery_id: string }; Returns: undefined }
      admin_assign_delivery: { Args: { p_delivery_id: string; p_rider_id: string }; Returns: undefined }
      release_delivery: { Args: { p_delivery_id: string }; Returns: undefined }
      mark_delivery_picked_up: { Args: { p_delivery_id: string }; Returns: undefined }
      complete_delivery: { Args: { p_delivery_id: string; p_code: string }; Returns: undefined }
      delivery_outcome: { Args: { p_delivery_id: string }; Returns: Json }
      set_delivery_dropoff: { Args: { p_order_id: string; p_lat: number; p_lng: number }; Returns: undefined }
      delivery_tracking: { Args: { p_order_id: string }; Returns: Json }
      save_product_variants: { Args: { p_product_id: string; p_variants: Json }; Returns: undefined }
      save_coupon: {
        Args: { p_id: string | null; p_code: string; p_kind: 'percent' | 'fixed'; p_value: number; p_min_spend: number; p_max_discount: number | null; p_ends_at: string | null; p_usage_limit: number | null; p_per_customer_limit: number; p_active: boolean; p_platform: boolean }
        Returns: string
      }
      find_transfer_recipient: { Args: { p_contact: string }; Returns: Json }
      transfer_funds: { Args: { p_id: string; p_recipient_id: string; p_amount: number; p_note: string | null }; Returns: string }
      release_milestone: { Args: { p_milestone_id: string }; Returns: undefined }
      trust_score: { Args: { p_profile_id: string }; Returns: Json }
      my_limits: { Args: Record<never, never>; Returns: Json }
      submit_business_verification: { Args: { p_rc_number: string; p_business_name: string; p_document_path: string }; Returns: string }
      admin_review_business_verification: { Args: { p_verification_id: string; p_approve: boolean; p_note: string }; Returns: undefined }
      staff_can: { Args: { p_area: string }; Returns: boolean }
      create_mfa_recovery_codes: { Args: Record<never, never>; Returns: string[] }
      record_mfa_removed: { Args: Record<never, never>; Returns: undefined }
      record_sign_in: { Args: { p_device_id: string; p_label: string }; Returns: Json }
      admin_suspend_user: { Args: { p_profile_id: string; p_reason: string }; Returns: undefined }
      admin_reinstate_user: { Args: { p_profile_id: string; p_note: string }; Returns: undefined }
      admin_set_staff_role: { Args: { p_profile_id: string; p_role: StaffRole | null }; Returns: undefined }
      admin_review_risk_alert: { Args: { p_alert_id: string; p_status: 'reviewed' | 'dismissed'; p_note: string }; Returns: undefined }
      admin_user_overview: { Args: { p_profile_id: string }; Returns: Json }
      admin_analytics: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      respond_to_dispute: {
        Args: { p_id: string; p_dispute_id: string; p_body: string; p_evidence_paths: string[] }
        Returns: string
      }
      save_provider_media: {
        Args: { p_id: string | null; p_kind: 'image' | 'video' | 'certificate'; p_path: string; p_title: string; p_description: string }
        Returns: string
      }
      remove_provider_media: {
        Args: { p_id: string }
        Returns: string
      }
      save_address: {
        Args: { p_id: string | null; p_label: string; p_recipient: string; p_phone: string; p_address: string; p_default: boolean }
        Returns: string
      }
      delete_address: {
        Args: { p_id: string }
        Returns: undefined
      }
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
      chat_inbox: {
        Args: { p_limit?: number; p_before_at?: string; p_before_thread?: string }
        Returns: {
          thread_id: string
          last_read_at: string
          other_id: string | null
          other_name: string | null
          other_avatar_url: string | null
          last_message: Database['public']['Tables']['chat_messages']['Row']
          last_message_at: string
          unread: number
        }[]
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
        Args: { p_quote_id: string; p_start_at: string; p_expected_revision: number }
        Returns: string
      }
      revise_job_quote: {
        Args: { p_quote_id: string; p_expected_revision: number; p_price: number; p_days: number; p_start_day: string | null; p_message: string | null; p_milestones: QuoteMilestone[] | null }
        Returns: undefined
      }
      withdraw_job_quote: {
        Args: { p_quote_id: string; p_expected_revision: number }
        Returns: undefined
      }
      checkout_quote: {
        Args: { p_items: Json; p_delivery_speed: DeliverySpeed; p_coupon_code?: string | null }
        Returns: Json
      }
      place_order: {
        Args: { p_items: Json; p_delivery_speed: DeliverySpeed; p_address: string; p_phone: string; p_expected_total: number; p_coupon_code?: string | null }
        /** One order id per seller in the cart. */
        Returns: string[]
      }
      cancel_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      dispatch_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      confirm_order_received: {
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
        /** The purchase order it raised. */
        Returns: string
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
      set_my_location: {
        Args: { p_lat: number; p_lng: number; p_label: string }
        /** The nearest listed area, or null when the pin is near none. */
        Returns: string | null
      }
      submit_verification: {
        Args: { p_id_type: VerificationIdType; p_id_number: string; p_document_path: string; p_selfie_path: string }
        Returns: string
      }
      admin_review_verification: {
        Args: { p_verification_id: string; p_approve: boolean; p_note: string | null }
        Returns: undefined
      }
      admin_mark_topup_refunded: {
        Args: { p_intent_id: string; p_note: string }
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
export type Verification = Tables<'verifications'>
export type ServiceArea = Tables<'service_areas'>
export type Favourite = Tables<'favourites'>
export type BusinessVerification = Tables<'business_verifications'>
export type BookingMilestone = Tables<'booking_milestones'>
export type ProductVariant = Tables<'product_variants'>
export type Coupon = Tables<'coupons'>
export type RiderProfile = Tables<'rider_profiles'>
export type Delivery = Tables<'deliveries'>
export type UserPreferences = Tables<'user_preferences'>
export type Meetup = Tables<'meetups'>
export type TrustedContact = Tables<'trusted_contacts'>
export type SosAlert = Tables<'sos_alerts'>
export type SosShift = Tables<'sos_shifts'>
export type Organization = Tables<'organizations'>
export type PurchaseOrder = Tables<'purchase_orders'>
export type StockItem = Tables<'stock_items'>
export type PaymentCard = Tables<'payment_cards'>
export type IdentityCheck = Tables<'identity_checks'>
export type StockMovement = Tables<'stock_movements'>
export type Invoice = Tables<'invoices'>
export type RfqItem = Tables<'rfq_items'>
export type Certificate = Tables<'certificates'>
export type QuizQuestion = Tables<'quiz_questions'>
export type Internship = Tables<'internships'>
export type InternshipApplication = Tables<'internship_applications'>
export type LiveStream = Tables<'live_streams'>
export type Device = Tables<'devices'>
export type SecurityEvent = Tables<'security_events'>
export type RiskAlert = Tables<'risk_alerts'>
