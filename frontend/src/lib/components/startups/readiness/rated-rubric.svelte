<script lang="ts">
  import { RadioButton } from '$lib/components/ui/radio';
  import { LevelRubricPanel } from '.';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';

  const { questionnaires, type, current, scores = [] } = $props();

  const currentLevel = $derived(scores?.[0]?.readinessLevel?.level ?? null);
</script>

<div class="flex flex-col gap-2" class:hidden={type !== current}>
  {#each questionnaires as questionnaire (questionnaire.id)}
    {@const isCurrent = questionnaire.level === currentLevel}
    <details
      class="group rounded-xl border border-slate-200/70 bg-white/60 open:bg-white/80 dark:border-white/10 dark:bg-white/[0.03] dark:open:bg-white/[0.05]"
      open={isCurrent}
    >
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden"
      >
        <div class="flex items-center gap-3">
          <RadioButton
            readonly={true}
            value={questionnaire.id}
            checked={isCurrent}
            name={`${type}ReadinessLevel`}
            id={`${type}ReadinessLevel${questionnaire.id}`}
            {questionnaire}
          />
          {#if isCurrent}
            <span
              class="rounded-full bg-[#6366f1]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6366f1]"
            >
              Current
            </span>
          {/if}
        </div>
        <ChevronDown
          class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 dark:text-white/40"
        />
      </summary>
      <div class="border-t border-slate-200/60 px-4 py-3 dark:border-white/10">
        <LevelRubricPanel rubric={questionnaire.rubric} />
      </div>
    </details>
  {/each}
</div>
