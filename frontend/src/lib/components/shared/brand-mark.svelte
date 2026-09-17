<script lang="ts">
  import { Rocket } from 'lucide-svelte';

  let { href = '/', size = 'md' }: { href?: string; size?: 'sm' | 'md' } =
    $props();
</script>

<a {href} class="flex items-center gap-2">
  <Rocket
    class="{size === 'sm'
      ? 'h-3.5 w-3.5'
      : 'h-4 w-4'} -rotate-12 text-[#6366f1]"
  />
  <span class="lu-d-xw {size === 'sm' ? 'text-lg' : 'text-xl'} text-white"
    >LaunchUp</span
  >
</a>
