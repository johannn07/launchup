<script>
  import ReadinessDashboard from '$lib/components/dashboard/ReadinessDashboard.svelte';
</script>

<div class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="mb-6">
    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">LaunchUp</p>
    <h1 class="mt-2 text-3xl font-black text-foreground sm:text-4xl">Readiness dashboard</h1>
    <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
      A sharper, branded view of startup readiness with prioritized actions and clearer differentiation across dimensions.
    </p>
  </div>
  <ReadinessDashboard startupId={1} />
</div>
