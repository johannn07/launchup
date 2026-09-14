<script lang="ts">
  // Replaces the graded criteria table that stood under every readiness level.
  // `level_criteria` has never held a row, so that table rendered an
  // Excellent/Good/Fair/Poor header over nothing. This shows the corpus
  // descriptor for the level instead — the same sourced text
  // GET /readinesslevel/rubrics serves.
  type LevelRubric = {
    title: string;
    content: string;
    provenance: 'standard' | 'framework-derived' | 'authored';
    citation: string | null;
    sourceUrl?: string;
  };

  const { rubric }: { rubric?: LevelRubric | null } = $props();

  // Only TRL is transcribed from a published standard. Labelling it keeps
  // authored text from reading as one.
  const PROVENANCE_LABEL = {
    standard: 'Published standard',
    'framework-derived': 'Derived from a published framework',
    authored: 'Authored for LaunchUp — no external standard'
  } as const;
</script>

{#if rubric}
  <!-- No title: the radio label above already renders it as
       "Level {level} - {name}" once readiness_levels.name is backfilled from
       this same corpus row. -->
  <div class="text-sm">
    <p class="leading-relaxed text-slate-600 dark:text-white/70">{rubric.content}</p>
    <p class="mt-3 text-xs text-slate-400 dark:text-white/40">
      <span class="font-semibold text-slate-500 dark:text-white/50">{PROVENANCE_LABEL[rubric.provenance]}</span>
      {#if rubric.citation}
        &middot; {rubric.citation}
      {/if}
      {#if rubric.sourceUrl}
        &middot; <a
          class="underline underline-offset-2"
          href={rubric.sourceUrl}
          target="_blank"
          rel="noreferrer">source</a
        >
      {/if}
    </p>
  </div>
{:else}
  <p class="text-sm text-slate-400 dark:text-white/40">No rubric text for this level yet.</p>
{/if}
