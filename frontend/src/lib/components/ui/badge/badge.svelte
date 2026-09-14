<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants';
  export const badgeVariants = tv({
    base: 'focus:ring-ring inline-flex select-none items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2',
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/80 border-transparent shadow',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent shadow',
        outline: 'text-foreground',
        glass:
          'glass text-foreground border-transparent',
        pending:
          'bg-pending-background text-pending-foreground border-pending-border/30',
        qualified:
          'bg-qualified-background text-qualified-foreground border-qualified-border/30',
        waitlisted:
          'bg-waitlisted-background text-waitlisted-foreground border-waitlisted-border/30',
        completed:
          'bg-completed-background text-completed-foreground border-completed-border/30'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    href,
    class: className,
    variant = 'default',
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> & {
    variant?: BadgeVariant;
  } = $props();
</script>

<svelte:element
  this={href ? 'a' : 'span'}
  bind:this={ref}
  {href}
  class={cn(badgeVariants({ variant, className }))}
  {...restProps}
>
  {@render children?.()}
</svelte:element>
