<!--
  Shown in place of the AI analysis summary when it was never generated. The
  application is saved first and the summary asked for afterwards, so a Gemini
  outage at submit leaves it missing rather than losing the application.
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Sparkles, Loader } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import axiosInstance from '$lib/axios';

  let {
    startupId,
    onGenerated
  }: {
    startupId: number;
    onGenerated: (summary: string, verdict: unknown) => void;
  } = $props();

  let generating = $state(false);

  async function generate() {
    generating = true;
    try {
      const { data } = await axiosInstance.post(
        `/startups/${startupId}/analysis-summary`
      );
      onGenerated(data.aiAnalysisSummary, data.summaryVerdict);
      toast.success('AI analysis summary generated');
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          'Could not generate the summary. Try again.'
      );
    } finally {
      generating = false;
    }
  }
</script>

<div class="mb-6 rounded-lg border border-dashed border-border p-4">
  <h3 class="mb-1 text-lg font-semibold text-foreground">
    AI Analysis Summary
  </h3>
  <p class="mb-3 text-sm text-muted-foreground">
    Not generated yet. The AI service was unavailable when this application was
    submitted.
  </p>
  <Button size="sm" onclick={generate} disabled={generating} class="gap-2">
    {#if generating}
      <Loader class="h-4 w-4 animate-spin" />
      Generating…
    {:else}
      <Sparkles class="h-4 w-4" />
      Generate summary
    {/if}
  </Button>
</div>
