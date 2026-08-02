<script lang="ts">
  export let stepName: string;
  export let currentStep: string;
  export let question: any[];
  export let startup: any = null;
  import { Label } from '$lib/components/ui/label/index.js';
  import { Textarea } from '$lib/components/ui/textarea';

  $: technologyAnswers =
    startup?.uratQuestionAnswers
      ?.filter(
        (answer: any) => answer.uratQuestion.readinessType === 'Technology'
      )
      ?.sort((a: any, b: any) => a.uratQuestion.id - b.uratQuestion.id) ?? [];
</script>

<div class="flex-1 overflow-auto px-1" class:hidden={currentStep !== stepName}>
  <div class="flex flex-col gap-5">
    <div class="rounded-xl border border-slate-200/50 bg-[#6366f1]/5 px-4 py-2.5 dark:border-[#6366f1]/20 dark:bg-[#6366f1]/10">
      <span class="text-xs font-bold uppercase tracking-wider text-[#6366f1]">Technology Readiness Level</span>
    </div>
    {#each question as q, i}
      <div class="group grid w-full gap-3 rounded-2xl border border-slate-200/60 bg-white/60 p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:bg-white/90 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/[0.04] backdrop-blur-md relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-[#6366f1]/[0.03] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"></div>
        <div class="flex items-start gap-3 relative z-10">
          <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/10 text-xs font-bold text-[#6366f1] ring-1 ring-[#6366f1]/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]">
            {i + 1}
          </span>
          <Label for="tech_{i}" class="text-sm font-bold leading-relaxed text-slate-800 dark:text-white/90">{q.question}</Label>
        </div>
        <div class="relative z-10 pl-10">
          <Textarea
            placeholder="Provide a detailed answer here..."
            id="tech_{i}"
            name="technology{i}"
            value={technologyAnswers[i]?.response ?? ''}
            class="min-h-[100px] rounded-xl border-slate-200/70 bg-white/80 resize-none p-4 text-sm shadow-inner focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:border-transparent dark:border-white/10 dark:bg-black/20 dark:focus-visible:bg-black/40 transition-colors"
          />
          <div class="mt-2 flex items-center justify-end">
            <span class="text-[11px] font-medium text-slate-400 dark:text-white/40 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
              {(technologyAnswers[i]?.response ?? '').length} chars
            </span>
          </div>
          <input type="hidden" name="technology{i}id" value={`${q.id}`} />
          {#if technologyAnswers[i]?.id}
            <input type="hidden" name="technology{i}answerId" value={`${technologyAnswers[i].id}`} />
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
