/**
 * Service categories a provider can list under. The category is stored as
 * this display name on provider_profiles, so renaming one here strands
 * existing providers under the old name.
 */
export const CATEGORIES = [
  { name: 'Tailoring', icon: 'scissors', color: 'text-brand' },
  { name: 'Plumbing', icon: 'wrench', color: 'text-brand' },
  { name: 'Electrical', icon: 'lightning', color: 'text-brand' },
  { name: 'Phone repair', icon: 'device-mobile', color: 'text-brand' },
  { name: 'Catering', icon: 'cooking-pot', color: 'text-success' },
  { name: 'Hair & beauty', icon: 'hair-dryer', color: 'text-success' },
  { name: 'Cleaning', icon: 'broom', color: 'text-success' },
  { name: 'Carpentry', icon: 'hammer', color: 'text-success' },
] as const
