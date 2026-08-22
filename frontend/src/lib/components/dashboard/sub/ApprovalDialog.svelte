<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Select from '$lib/components/ui/select';
  import { toast } from 'svelte-sonner';

  export let startup: any;
  export let showDialog: boolean = false;
  export let toggleDialog: () => void;
  export let mentors: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }[] = [];
  export let assessments: {
    id: number;
    name: string;
    fields?: { id: number; label: string; fieldType: number }[];
    assessmentType?: string;
  }[] = [];
  export let onApprove: (
    startupId: number,
    mentorId: any,
    acknowledgedFlaggedSummary?: boolean
  ) => Promise<void>;
  export let assignAssessmentsToStartup: (startupId: number) => Promise<any>;

  let selectedMentor: string;
  let isLoading = false;

  // SO 4.4 — a predominantly-positive summary is unreliable decision support,
  // so approving on it takes a deliberate confirmation. The server enforces
  // this too; the checkbox is the affordance, not the control.
  let acknowledged = false;
  $: flagged = startup?.summaryVerdict?.status === 'positive-language-flagged';
  // Reset whenever the dialog reopens, so one acknowledgement cannot carry over
  // to the next applicant.
  $: if (!showDialog) acknowledged = false;

  // Local selection state for assessments
  let selectedAssessments = new Set<number>();

  // Group assessments by type
  $: groupedAssessments = assessments.reduce(
    (acc, asmt) => {
      const type = asmt.assessmentType || 'Other';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(asmt);
      return acc;
    },
    {} as Record<string, typeof assessments>
  );

  function toggleAssessment(id: number, assessmentType: string) {
    const next = new Set(selectedAssessments);

    const sameTypeAssessments = assessments
      .filter((a) => a.assessmentType === assessmentType)
      .map((a) => a.id);

    // If clicking the already selected assessment, uncheck it
    if (next.has(id)) {
      next.delete(id);
    } else {
      sameTypeAssessments.forEach((asmtId) => next.delete(asmtId));
      next.add(id);
    }

    selectedAssessments = next;
  }

  async function handleApprove() {
    if (!selectedMentor) {
      toast.error(
        'Please select at least one readiness level assessment and assign a mentor.'
      );
      return;
    }
    isLoading = true;
    try {
      await assignAssessmentsToStartup(startup.id);
      await onApprove(startup.id, selectedMentor, acknowledged);
      toast.success('Startup has been approved successfully');
      toggleDialog();
    } catch (error) {
      console.error('Error during approval:', error);
      // Show what the server said — SO 4.4's refusal explains what to do next,
      // and a generic message would hide it.
      toast.error(
        (error as Error)?.message ||
          'An error occurred during approval. Please try again.'
      );
    } finally {
      isLoading = false;
    }
  }
</script>

{#if startup}
  <Dialog.Root open={showDialog} onOpenChange={toggleDialog}>
    <Dialog.Content class="sm:max-w-[500px]">
      <Dialog.Header>
        <Dialog.Title>
          Approve {startup.capsuleProposal?.title || startup.name}
        </Dialog.Title>
      </Dialog.Header>

      <!-- Dialog Content -->
      <div class="space-y-6">
        <div>
          <!-- Mentor Selection -->
          <div>
            <h3 class="mb-4 text-lg font-medium">Assign a Mentor</h3>
            <Select.Root type="single" bind:value={selectedMentor}>
              <Select.Trigger class="w-full">
                {#if mentors && mentors.length > 0 && selectedMentor}
                  {mentors.find((m) => m.id === Number(selectedMentor))
                    ?.firstName}
                  {mentors.find((m) => m.id === Number(selectedMentor))
                    ?.lastName}
                {:else}
                  Select Mentor
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each mentors as mentor}
                  <Select.Item value={String(mentor.id)}>
                    {mentor.firstName}
                    {mentor.lastName}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        {#if flagged}
          <div
            class="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-100/40 dark:bg-amber-950"
          >
            <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
              This analysis summary reads as predominantly positive
            </p>
            <p class="mt-1 text-xs text-amber-800 dark:text-amber-200">
              It contains little critical observation, so it is weak evidence
              for approval on its own.
            </p>
            <label
              class="mt-3 flex cursor-pointer items-start gap-2 text-xs text-amber-900 dark:text-amber-100"
            >
              <input
                type="checkbox"
                bind:checked={acknowledged}
                class="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
              />
              <span>
                I have reviewed this application against its unmet criteria.
              </span>
            </label>
          </div>
        {/if}

        <!-- Actions -->
        <div class="flex justify-end gap-3 pt-0">
          <Button
            variant="outline"
            class="transition-transform duration-200 hover:scale-105"
            disabled={isLoading}
            onclick={toggleDialog}
          >
            Cancel
          </Button>
          <Button
            class="transition-transform duration-200 hover:scale-105"
            disabled={!selectedMentor ||
              isLoading ||
              (flagged && !acknowledged)}
            onclick={handleApprove}
          >
            {isLoading ? 'Approving...' : 'Approve'}
          </Button>
        </div>

        {#if !selectedMentor}
          <p class="mt-4 text-sm text-red-500">Please assign a mentor.</p>
        {/if}
      </div></Dialog.Content
    >
  </Dialog.Root>
{/if}
