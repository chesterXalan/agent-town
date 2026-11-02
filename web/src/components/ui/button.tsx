import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Slot } from 'radix-ui'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 text-ui whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-invalid:border-block [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'press border-2 border-border bg-primary text-primary-foreground',
        destructive: 'press border-2 border-border bg-block text-block-fg',
        outline: 'press border-2 border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'press border-2 border-border bg-secondary text-secondary-foreground',
        ghost: 'border-2 border-transparent hover:border-border hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-(--control-h) px-4 has-[>svg]:px-3',
        xs: "h-(--control-h-xs) gap-1 px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-(--control-h-sm) px-3 has-[>svg]:px-2',
        lg: 'h-(--control-h-lg) px-6 has-[>svg]:px-4',
        icon: 'size-(--control-h)',
        'icon-xs': "size-(--control-h-xs) [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-(--control-h-sm)',
        'icon-lg': 'size-(--control-h-lg)',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
