import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/** design system 的字級 utility 要歸在 font-size，否則預設會被當成文字色而互相吃掉 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: { 'font-size': [{ text: ['display', 'label', 'title', 'ui', 'body', 'mono', 'num', 'num-xl'] }] },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
