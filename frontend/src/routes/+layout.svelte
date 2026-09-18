<script lang="ts">
  import '../app.css';
  import { ModeWatcher, setMode } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import { QueryClient, QueryClientProvider } from '@sveltestack/svelte-query';
  import { onMount } from 'svelte';

  let { children } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false
      }
    }
  });

  // The product is dark-only. Anyone who picked Light or System under the old
  // Appearance page still has that stored, which would leave the pages that
  // rely on shadcn variables rendering light. Normalise it once.
  onMount(() => setMode('dark'));
</script>

<ModeWatcher defaultMode="dark" />
<Toaster richColors duration={2000} />
<QueryClientProvider client={queryClient}>
  <div class="h-screen w-full overflow-x-clip">
    {@render children()}
  </div>
</QueryClientProvider>
