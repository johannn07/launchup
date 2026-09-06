<script lang="ts">
  import { RadioButton } from '$lib/components/ui/radio';
  import { LevelRubricPanel } from '.';

  const { questionnaires, type, current } = $props();
</script>

<div class="flex flex-col gap-3" class:hidden={type !== current}>
  {#each questionnaires as questionnaire, index}
    <div class="flex flex-col gap-1">
      <div class="flex gap-3">
        <div>
          <RadioButton
            readonly={true}
            value={questionnaire.id}
            checked={index === 0}
            name={`${type}ReadinessLevel`}
            id={`${type}ReadinessLevel${questionnaire.id}`}
            {questionnaire}
          />
        </div>
      </div>
      <LevelRubricPanel rubric={questionnaire.rubric} />
    </div>
  {/each}
</div>
