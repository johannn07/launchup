<script lang="ts">
  import { RadioButton } from '$lib/components/ui/radio';
  import { LevelRubricPanel } from '.';

  const { questionnaires, step, current, type } = $props();
</script>

<div class="flex flex-col gap-3" class:hidden={step - 1 !== current}>
  {#each questionnaires as questionnaire, index}
    <div class="flex flex-col gap-1">
      <div class="flex gap-3">
        <div>
          <RadioButton
            name={`${type}ReadinessLevel`}
            value={questionnaire.id}
            checked={index === 0}
            id={`${type}ReadinessLevel${questionnaire.id}`}
            {questionnaire}
          />
        </div>
      </div>
      <LevelRubricPanel rubric={questionnaire.rubric} />
    </div>
  {/each}
</div>
