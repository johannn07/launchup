<!--
  SO 4.4 — the tone verdict shown beside an AI analysis summary, so a reviewing
  Manager knows when a summary reads as predominantly positive.

  `source` is deliberately visible rather than hidden. A `recorded` verdict was
  computed and stored when the summary was generated; a `recomputed` one is
  read live because no verdict was ever stored for that proposal. The two can
  disagree for the same text — a stored verdict keeps whatever rule shipped
  when it was written — and a Manager seeing two different verdicts needs to be
  able to tell which is which rather than assume a bug.

  Amber, not red: this is "look harder before approving", not an error. The
  balanced case stays quiet on purpose, so the flagged one carries the signal.
-->
<script lang="ts">
  import { TriangleAlert, Check } from 'lucide-svelte';

  interface SummaryVerdict {
    status: 'positive-language-flagged' | 'balanced';
    source: 'recorded' | 'recomputed';
    runId?: number;
    ratio?: number;
    criticalCount?: number;
    positiveCount?: number;
  }

  let { verdict }: { verdict?: SummaryVerdict } = $props();

  const flagged = $derived(verdict?.status === 'positive-language-flagged');

  // Counts exist only on a recomputed verdict; a recorded row stores a status
  // alone, so there is nothing to show its reading was derived from.
  const detail = $derived(
    verdict === undefined
      ? ''
      : verdict.source === 'recorded'
        ? `Recorded when this summary was generated${verdict.runId ? ` (run ${verdict.runId})` : ''}.`
        : `Read from the summary text just now: ${verdict.criticalCount} critical vs ${verdict.positiveCount} positive observation(s).`
  );
</script>

{#if verdict}
  <span
    class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold {flagged
      ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-100/40 dark:bg-amber-900 dark:text-amber-100'
      : 'border-border bg-muted text-muted-foreground'}"
    title={detail}
  >
    {#if flagged}
      <TriangleAlert class="h-3.5 w-3.5" aria-hidden="true" />
      Predominantly positive
    {:else}
      <Check class="h-3.5 w-3.5" aria-hidden="true" />
      Balanced
    {/if}
    <span class="font-normal opacity-70">
      · {verdict.source === 'recorded' ? 'recorded' : 'live reading'}
    </span>
  </span>
  {#if flagged}
    <p class="mt-2 text-xs text-amber-700 dark:text-amber-200">
      This summary is mostly positive language with little critical observation.
      Review the application against its unmet criteria before changing status.
    </p>
  {/if}
{/if}
