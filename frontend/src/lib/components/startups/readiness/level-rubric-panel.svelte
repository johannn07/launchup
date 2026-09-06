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
  <div class="rounded-md border bg-background p-3 text-sm">
    <p class="font-semibold">{rubric.title}</p>
    <p class="mt-1 text-muted-foreground">{rubric.content}</p>
    <p class="mt-2 text-xs text-muted-foreground">
      <span class="font-semibold">{PROVENANCE_LABEL[rubric.provenance]}</span>
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
  <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
    No rubric text for this level yet.
  </div>
{/if}
