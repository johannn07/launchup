<script lang="ts">
  export let stepName: string;
  export let currentStep: string;
  export let calculatorQuestions: any;
  export let startup: any = null;

  $: calculatorAnswers =
    startup?.calculatorQuestionAnswers?.sort(
      (a: any, b: any) => a.question.id - b.question.id
    ) ?? [];

  $: selectedAnswers = calculatorAnswers.reduce(
    (acc: Record<string, number>, answer: any) => {
      acc[answer.question.category] = answer.question.id;
      return acc;
    },
    {}
  );

  $: answerIds = calculatorAnswers.reduce(
    (acc: Record<string, number>, answer: any) => {
      acc[answer.question.category] = answer.id;
      return acc;
    },
    {}
  );

  // Track selections locally for new applications
  let localSelections: Record<string, string> = {};

  function selectOption(category: string, questionId: number) {
    localSelections = { ...localSelections, [category]: `${questionId}` };
  }

  function isSelected(category: string, questionId: number, locals: Record<string, string>, selected: Record<string, number>): boolean {
    if (locals[category]) return locals[category] === `${questionId}`;
    if (selected[category]) return selected[category] === questionId;
    return false;
  }

  $: answeredCount = calculatorQuestions
    ? calculatorQuestions.filter((cat: any) =>
        localSelections[cat.category] || selectedAnswers[cat.category]
      ).length
    : 0;
</script>

<div class="flex-1 overflow-auto px-1" class:hidden={currentStep !== stepName}>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-between">
      <span class="text-xs text-slate-500 dark:text-white/50">Answer all technology & commercialization readiness questions</span>
      <span class="text-xs font-semibold text-[#6366f1]">{answeredCount} / {calculatorQuestions?.length ?? 0} answered</span>
    </div>

    {#each calculatorQuestions as category, catIdx}
      <div class="rounded-2xl border border-slate-200/50 bg-white/40 p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white/90 mb-3">{catIdx + 1}. {category.category}</h4>
        <div class="flex flex-col gap-2">
          {#each category.questions as question}
            <button
              type="button"
              class="flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-all duration-200
                {isSelected(category.category, question.id, localSelections, selectedAnswers)
                  ? 'border-[#6366f1]/40 bg-[#6366f1]/5 text-slate-800 dark:border-[#6366f1]/30 dark:bg-[#6366f1]/10 dark:text-white/90'
                  : 'border-slate-200/50 bg-white/30 text-slate-600 hover:border-slate-300 hover:bg-white/60 dark:border-white/5 dark:bg-white/5 dark:text-white/60 dark:hover:border-white/10'}"
              onclick={(e) => { e.preventDefault(); selectOption(category.category, question.id); }}
            >
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200
                  {isSelected(category.category, question.id, localSelections, selectedAnswers)
                    ? 'border-[#6366f1] bg-[#6366f1]'
                    : 'border-slate-300 dark:border-white/20'}"
              >
                {#if isSelected(category.category, question.id, localSelections, selectedAnswers)}
                  <div class="h-2 w-2 rounded-full bg-white"></div>
                {/if}
              </div>
              <span class="font-medium">{question.question}</span>
            </button>
          {/each}
        </div>

        <!-- Hidden input for form submission -->
        <input
          type="hidden"
          name={category.category}
          value={localSelections[category.category] || selectedAnswers[category.category] || category.questions[0]?.id || ''}
        />
        {#if answerIds[category.category]}
          <input
            type="hidden"
            name={`${category.category}AnswerId`}
            value={`${answerIds[category.category]}`}
          />
        {/if}
      </div>
    {/each}
  </div>
</div>
