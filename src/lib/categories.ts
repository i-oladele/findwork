import { msg } from './msg'

/**
 * Service categories a provider can list under. The category is stored as
 * this display name on provider_profiles, so renaming one here strands
 * existing providers under the old name.
 */
export const CATEGORIES = [
  { name: msg('Tailoring'), icon: 'scissors', color: 'text-brand' },
  { name: msg('Plumbing'), icon: 'wrench', color: 'text-brand' },
  { name: msg('Electrical'), icon: 'lightning', color: 'text-brand' },
  { name: msg('Phone repair'), icon: 'device-mobile', color: 'text-brand' },
  { name: msg('Catering'), icon: 'cooking-pot', color: 'text-success' },
  { name: msg('Hair & beauty'), icon: 'hair-dryer', color: 'text-success' },
  { name: msg('Cleaning'), icon: 'broom', color: 'text-success' },
  { name: msg('Carpentry'), icon: 'hammer', color: 'text-success' },
] as const
