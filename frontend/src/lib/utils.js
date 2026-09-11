/**
 * cn utility — merges Tailwind class names cleanly.
 * Combining clsx (conditional classes) with tailwind-merge (dedup overrides).
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
