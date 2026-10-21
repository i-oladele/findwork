/**
 * Marks a sentence for translation where it is defined but translated later
 * (a label in a list, a reason sent by the database), so npm run i18n:check
 * finds it. Kept apart from i18n.tsx so data modules can use it without
 * importing React or the preferences query.
 */
export const msg = (text: string): string => text
