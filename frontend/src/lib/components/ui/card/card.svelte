<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants';

  export const cardVariants = tv({
    base: 'text-card-foreground',
    variants: {
      variant: {
        default: 'rounded-xl border bg-card shadow',
        glass: 'glass-card',
        'glass-strong': 'glass-strong rounded-2xl',
        'glass-subtle': 'glass-subtle rounded-2xl',
        solid: 'rounded-xl border bg-card shadow-md',
        ghost: 'rounded-xl border border-transparent bg-transparent'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  });

  export type CardVariant = VariantProps<typeof cardVariants>['variant'];
</script>

<script lang="ts">
  import type { WithElementRef } from 'bits-ui';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'default',
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    variant?: CardVariant;
  } = $props();
</script>

<div
  bind:this={ref}
  class={cn(cardVariants({ variant, className }))}
  {...restProps}
>
  {@render children?.()}
</div>
