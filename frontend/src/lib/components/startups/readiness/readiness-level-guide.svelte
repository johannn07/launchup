<script lang="ts">
  // The rubric behind each level, so a mentor picking one can read what it
  // means rather than guessing from the number.
  type Rubric = {
    readinessType: string;
    level: number;
    title: string;
    content: string;
    provenance: 'standard' | 'framework-derived' | 'authored';
    citation: string | null;
    sourceUrl?: string;
  };

  const {
    readinessType,
    rubrics = [],
    selectedLevel
  }: {
    readinessType: string;
    rubrics: Rubric[];
    selectedLevel?: number;
  } = $props();

  const levels = $derived(
    rubrics
      .filter((rubric) => rubric.readinessType === readinessType)
      .sort((a, b) => a.level - b.level)
  );

  // Uniform per dimension in the corpus, so it is stated once, not per level.
  const source = $derived(levels[0]);

  // Not every rubric carries the same authority: only TRL is transcribed from
  // a published standard. Saying so keeps authored text from reading as one.
  const PROVENANCE_LABEL = {
    standard: 'Published standard',
    'framework-derived': 'Derived from a published framework',
    authored: 'Authored for LaunchUp — no external standard'
  } as const;
</script>

{#if levels.length > 0}
  <details class="mt-2 rounded-lg border border-slate-200/70 bg-slate-50/60 text-sm dark:border-white/10 dark:bg-white/[0.03]">
    <summary
      class="cursor-pointer px-3 py-2 font-medium text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
    >
      What each level means
    </summary>

    <!-- Bounded so nine levels of prose scroll inside the panel rather than
         overflowing whatever dialog or card is hosting it. -->
    <div class="max-h-[28rem] space-y-3 overflow-y-auto border-t border-slate-200/70 px-3 py-3 dark:border-white/10">
      {#if source}
        <p class="text-xs text-slate-500 dark:text-white/50">
          <span class="font-semibold">{PROVENANCE_LABEL[source.provenance]}</span>
          {#if source.citation}
            &middot; {source.citation}
          {/if}
          {#if source.sourceUrl}
            &middot; <a
              class="underline underline-offset-2"
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer">source</a
            >
          {/if}
        </p>
      {/if}

      <ol class="space-y-2">
        {#each levels as rubric (rubric.level)}
          <li
            class="rounded-md border p-2 {rubric.level === selectedLevel
              ? 'border-[#6366f1]/30 bg-[#6366f1]/5'
              : 'border-transparent'}"
          >
            <p class="font-semibold text-slate-900 dark:text-white">
              {rubric.title}
              {#if rubric.level === selectedLevel}
                <span class="ml-1 text-xs font-normal text-[#6366f1]">selected</span>
              {/if}
            </p>
            <p class="mt-1 text-slate-500 dark:text-white/50">{rubric.content}</p>
          </li>
        {/each}
      </ol>
    </div>
  </details>
{/if}
