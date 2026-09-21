<script lang="ts">
  import { useQuery } from '@sveltestack/svelte-query';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';
  import * as Dialog from '$lib/components/ui/dialog';
  import ReadinessAssessmentForm from '$lib/components/startups/assessment/ReadinessAssessmentForm.svelte';
  import type { Assessment } from '$lib/types/assessment.types';
  import { getReadinessTypes, canRateReadiness } from '$lib/utils';
  import ShortAnswerField from '$lib/components/startups/assessment/AssessmentTypes/ShortAnswerField.svelte';
  import LongAnswerField from '$lib/components/startups/assessment/AssessmentTypes/LongAnswerField.svelte';
  import FileUploadField from '$lib/components/startups/assessment/AssessmentTypes/FileUploadField.svelte';
  import * as Select from '$lib/components/ui/select';
  import { ReadinessLevelGuide } from '$lib/components/startups/readiness';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { CircleCheck, Loader } from 'lucide-svelte';
  import { arrive } from '$lib/motion';
  import { StatePanel } from '$lib/components/workspace';
  import {
    Cpu,
    TrendingUp,
    CheckCircle2,
    Building2,
    ShieldCheck,
    Wallet
  } from 'lucide-svelte';

  const { data } = $props();
  const { access, startupId } = data;

  let showAssessmentForm = $state(false);
  let showTypeModal = $state(false);
  let selectedReadinessType = $state<string | null>(null);
  let assessmentAnswers = $state<Record<number, string>>({});
  let fileUploadComponents = $state<Record<number, FileUploadField>>({});
  let isSubmittingAssessment = $state<Record<number, boolean>>({});
  let readinessLevel = $state<string>('1');
  let isRatingAssessment = $state(false);
  let togglingApplicable = $state<Record<number, boolean>>({});

  const readinessLevelQuery = useQuery({
    queryKey: ['startupReadinessLevels', startupId],
    queryFn: async () => {
      const response = await axiosInstance.get(
        `/readinesslevel/readiness-level?startupId=${startupId}`,
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );
      return response.data;
    }
  });

  const rubricsQuery = useQuery({
    queryKey: ['readinessRubrics'],
    queryFn: async () => {
      const response = await axiosInstance.get(`/readinesslevel/rubrics`, {
        headers: {
          Authorization: `Bearer ${access}`
        }
      });
      return response.data;
    }
  });

  const readinessLevelsByType = $derived(() => {
    const levels: Record<string, string> = {};
    $readinessLevelQuery.data?.forEach((item: any) => {
      levels[item.readinessLevel.readinessType] =
        item.readinessLevel.level.toString();
    });
    return levels;
  });

  function toggleAssessmentForm(): void {
    showAssessmentForm = !showAssessmentForm;
  }

  async function toggleAssessmentApplicability(
    startupAssessmentId: number,
    currentApplicable: boolean
  ): Promise<void> {
    try {
      togglingApplicable[startupAssessmentId] = true;

      await axiosInstance.patch(
        `/assessments/startup-assessment/${startupAssessmentId}/toggle-applicable`,
        {
          isApplicable: !currentApplicable
        },
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );

      toast.success(
        `Assessment marked as ${!currentApplicable ? 'applicable' : 'not applicable'}`
      );
      await $assessmentQuery.refetch();
    } catch (error: any) {
      console.error('Error toggling assessment applicability:', error);
      toast.error('Failed to update assessment applicability');
    } finally {
      togglingApplicable[startupAssessmentId] = false;
    }
  }

  function openTypeModal(typeName: string): void {
    selectedReadinessType = typeName;
    showTypeModal = true;
    readinessLevel = readinessLevelsByType()[typeName] || '1';
    const typeAssessments = assessmentsByType()[typeName] || [];
    typeAssessments.forEach((assessment: any) => {
      if (
        assessment.response?.answerValue &&
        !assessmentAnswers[assessment.assessment.id]
      ) {
        assessmentAnswers[assessment.assessment.id] =
          assessment.response.answerValue;
      }
    });
  }

  function closeTypeModal(): void {
    showTypeModal = false;
    selectedReadinessType = null;
    readinessLevel = '1';
  }

  async function rateAssessmentType(): Promise<void> {
    if (!selectedReadinessType) return;

    try {
      isRatingAssessment = true;
      await axiosInstance.post(
        `/readinesslevel/startup/${startupId}/rate`,
        {
          readinessType: selectedReadinessType,
          level: Number(readinessLevel)
        },
        {
          headers: { Authorization: `Bearer ${access}` }
        }
      );

      toast.success(
        `${selectedReadinessType} readiness level set to ${readinessLevel}`
      );
      await $assessmentQuery.refetch();
      await $readinessLevelQuery.refetch();
    } catch (error) {
      console.error('Error rating assessment:', error);
      toast.error('Failed to rate assessment');
    } finally {
      isRatingAssessment = false;
    }
  }

  async function submitSingleAssessment(assessmentData: any): Promise<void> {
    const assessmentId = assessmentData.assessment.id;

    try {
      isSubmittingAssessment[assessmentId] = true;

      const fileComponent = fileUploadComponents[assessmentId];
      if (
        fileComponent &&
        typeof fileComponent.uploadPendingFiles === 'function'
      ) {
        await fileComponent.uploadPendingFiles();
      }

      await axiosInstance.post(
        `/startups/${startupId}/responses`,
        {
          responses: [
            {
              assessmentId: assessmentId,
              answerValue: assessmentAnswers[assessmentId] || '',
              fileUrl: assessmentData.response?.fileUrl || '',
              fileName: assessmentData.response?.fileName || ''
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );

      toast.success(`${assessmentData.assessment.name} submitted successfully`);
      await $assessmentQuery.refetch();
    } catch (error: any) {
      console.error('Error submitting assessment:', error);
      toast.error(`Failed to submit ${assessmentData.assessment.name}`);
    } finally {
      isSubmittingAssessment[assessmentId] = false;
    }
  }

  async function handleAssessmentSubmit(detail: {
    assessmentId: number;
    startupId: string;
    answer?: string;
    fileUrl?: string;
    fileName?: string;
  }): Promise<void> {
    const { assessmentId, startupId, answer, fileUrl, fileName } = detail;

    try {
      await axiosInstance.post(
        `/startups/${startupId}/responses`,
        {
          responses: [
            {
              assessmentId: assessmentId,
              answerValue: answer || '',
              fileUrl: fileUrl || '',
              fileName: fileName || ''
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );

      toast.success('Assessment submitted successfully');

      await $assessmentQuery.refetch();
      toggleAssessmentForm();
    } catch (error: any) {
      console.error('=== SUBMISSION ERROR ===');
      console.error('Error submitting assessment:', error);
      console.error('Error response:', error.response?.data);
      console.error('=== END ERROR ===');
      toast.error('Failed to submit assessment');
    }
  }

  const assessmentQuery = useQuery({
    queryKey: ['assessmentData', startupId],
    queryFn: async () => {
      const response = await axiosInstance.get(
        `/assessments/startup/${startupId}`,
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );
      return response.data;
    }
  });

  const isLoading = $derived($assessmentQuery.isLoading);
  const isError = $derived($assessmentQuery.isError);
  let hasAssessment = $state(false);

  $effect(() => {
    if ($assessmentQuery.data) {
      hasAssessment = $assessmentQuery.data.length > 0;
    }
  });

  let selectedAssessment = $state<any | null>(null);

  function openAssessment(assessmentData: any): void {
    selectedAssessment = assessmentData;
    toggleAssessmentForm();
  }

  const displayedAssessments = $derived(() => {
    let filtered = $assessmentQuery.data;

    return (
      filtered?.sort((a: any, b: any) => {
        const getPriority = (assessment: any) => {
          if (!assessment.isApplicable) return 3;
          if (assessment.status === 'Pending') return 1;
          return 2;
        };
        return getPriority(a) - getPriority(b);
      }) || []
    );
  });
  const typeConfig: Record<string, { icon: any }> = {
    Technology: { icon: Cpu },
    Market: { icon: TrendingUp },
    Acceptance: { icon: CheckCircle2 },
    Organizational: { icon: Building2 },
    Regulatory: { icon: ShieldCheck },
    Investment: { icon: Wallet }
  };

  const readinessTypes = getReadinessTypes();

  const selectedTypeConfig = $derived(
    typeConfig[selectedReadinessType ?? ''] ?? typeConfig['Technology']
  );
  const ModalTypeIcon = $derived(selectedTypeConfig.icon);

  // Group assessments by readiness type
  const assessmentsByType = $derived(() => {
    const grouped: Record<string, any[]> = {};

    readinessTypes.forEach((type) => {
      grouped[type.name] = [];
    });

    displayedAssessments()?.forEach((assessment: any) => {
      const typeName = assessment.assessment?.assessmentType;
      if (typeName && grouped[typeName]) {
        grouped[typeName].push(assessment);
      }
    });

    return grouped;
  });

  const modalProgress = $derived(() => {
    const typeAssessments = selectedReadinessType
      ? assessmentsByType()[selectedReadinessType] || []
      : [];
    const applicable = typeAssessments.filter((a: any) => a.isApplicable);
    if (applicable.length === 0) return 0;
    const completed = applicable.filter((a: any) => {
      const hasAnswer =
        a.response?.answerValue && String(a.response.answerValue).trim() !== '';
      return a.status === 'Completed' && hasAnswer;
    }).length;
    return Math.round((completed / applicable.length) * 100);
  });
</script>

{#if isLoading}
  {@render loading()}
{:else if isError}
  {@render error()}
{:else if hasAssessment}
  {@render hasAssessments()}
{:else}
  {@render noAssessments()}
{/if}

{#snippet hasAssessments()}
  <p class="text-[14px] leading-relaxed text-[#94a3b8]">
    {#if data.role === 'Startup'}
      Your application is approved. Complete each dimension below; every answer
      feeds the readiness level your mentor rates.
    {:else}
      One card per dimension. Open one to read the answers and rate its
      readiness level.
    {/if}
  </p>

  <div class="lu-enter grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each readinessTypes as type}
      {@const assessments = assessmentsByType()[type.name] || []}
      {@const applicableAssessments = assessments.filter(
        (a: any) => a.isApplicable
      )}
      {@const completedCount = applicableAssessments.filter((a: any) => {
        const hasAnswer =
          a.response?.answerValue &&
          String(a.response.answerValue).trim() !== '';
        return a.status === 'Completed' && hasAnswer;
      }).length}
      {@const currentLevel = readinessLevelsByType()[type.name]}
      {@const progress =
        applicableAssessments.length > 0
          ? Math.round((completedCount / applicableAssessments.length) * 100)
          : 0}
      {@const config = typeConfig[type.name] ?? typeConfig['Technology']}
      {@const Icon = config.icon}

      <div
        class="lu-card group flex cursor-pointer flex-col rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-5 hover:border-[#2b3a5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
        role="button"
        tabindex="0"
        onclick={() => openTypeModal(type.name)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openTypeModal(type.name);
          }
        }}
      >
        <div class="mb-4 flex items-center gap-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.7rem] border border-[#2b3a5c] bg-[#111b2e] transition-colors duration-quick group-hover:border-[#4f46e5]/70"
            aria-hidden="true"
          >
            <Icon class="h-4 w-4 text-[#c7d2fe]" />
          </span>
          <div class="min-w-0">
            <h3 class="truncate text-[15px] font-semibold text-white">
              {type.name}
            </h3>
            <span class="text-[12.5px] text-[#94a3b8]">
              {currentLevel ? `Level ${currentLevel}` : 'Not yet rated'}
            </span>
          </div>
        </div>

        <div class="mb-3 flex items-center justify-between gap-3 text-[12.5px]">
          <span class="text-[#94a3b8]">
            {assessments.length}
            {assessments.length === 1 ? 'question' : 'questions'}
          </span>
          {#if applicableAssessments.length > 0}
            <span class="lu-num text-[#94a3b8]">
              <span class="text-[#f1f5f9]">{completedCount}</span>
              / {applicableAssessments.length} answered
            </span>
          {/if}
        </div>

        {#if applicableAssessments.length > 0}
          <div
            class="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-[#17213a]"
          >
            <div
              class="lu-fill h-full rounded-full bg-[#6366f1]"
              style={`width: ${progress}%`}
              use:arrive
            ></div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Type Modal with Assessments -->
  <Dialog.Root open={showTypeModal} onOpenChange={closeTypeModal}>
    <Dialog.Content size="full" class="flex flex-col">
      <Dialog.Header class="mb-1 shrink-0 text-left">
        <div class="flex items-center gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] border border-[#2b3a5c] bg-[#111b2e]"
            aria-hidden="true"
          >
            <ModalTypeIcon class="h-5 w-5 text-[#c7d2fe]" />
          </span>
          <div>
            <Dialog.Title class="lu-d-md text-[20px] leading-tight text-white">
              {selectedReadinessType}
            </Dialog.Title>
            <p class="mt-0.5 text-[12.5px] text-[#94a3b8]">Assessment</p>
          </div>
        </div>
        <Dialog.Description class="mt-2 text-xs text-muted-foreground">
          {#if data.role === 'Startup'}
            Complete all assessments below to improve your readiness level
          {:else}
            View and rate the startup's assessment responses
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div
        class="assessment-scroll min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#1f2c47] bg-[#0b1220] p-5"
      >
        {#if selectedReadinessType && assessmentsByType()[selectedReadinessType]?.length > 0}
          <div class="flex flex-col gap-5">
            {#each assessmentsByType()[selectedReadinessType] as assessmentData, index}
              {@const assessmentId = assessmentData.assessment.id}
              {@const isSubmitting =
                isSubmittingAssessment[assessmentId] || false}
              {@const hasAnswer =
                assessmentData.response?.answerValue &&
                String(assessmentData.response.answerValue).trim() !== ''}
              {@const isCompleted =
                assessmentData.status === 'Completed' && hasAnswer}
              {@const isToggling =
                togglingApplicable[assessmentData.id] || false}

              <div class="rounded-2xl border border-[#1f2c47] bg-[#111b2e] p-4">
                <!-- Assessment Header -->
                <div
                  class="border-border/50 mb-3 flex items-start justify-between gap-3 border-b pb-3"
                >
                  <div class="flex flex-1 items-start gap-3">
                    <div class="flex items-center pt-1">
                      <Checkbox
                        checked={assessmentData.isApplicable}
                        disabled={isToggling}
                        onCheckedChange={() =>
                          toggleAssessmentApplicability(
                            assessmentData.id,
                            assessmentData.isApplicable
                          )}
                        aria-label="Toggle assessment applicability"
                      />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3
                        class="text-base font-bold leading-snug text-foreground"
                      >
                        {assessmentData.assessment.name}
                      </h3>
                      <p class="text-xs text-muted-foreground">
                        {assessmentData.assessment.answerType}
                      </p>
                      {#if !assessmentData.isApplicable}
                        <p class="mt-1.5 text-[12px] text-[#fbbf24]">
                          Not applicable to this startup
                        </p>
                      {/if}
                    </div>
                  </div>
                  {#if assessmentData.isApplicable}
                    <span class="lu-chip-sm shrink-0">
                      {isCompleted ? 'Answered' : 'Not answered'}
                    </span>
                  {/if}
                </div>

                <!-- Assessment Field Based on Type -->
                <div class="mb-3">
                  {#if assessmentData.assessment.answerType === 'ShortAnswer'}
                    <ShortAnswerField
                      description={assessmentData.assessment.name}
                      bind:value={assessmentAnswers[assessmentId]}
                      isReadOnly={canRateReadiness(data.role) ||
                        !assessmentData.isApplicable}
                    />
                  {:else if assessmentData.assessment.answerType === 'LongAnswer'}
                    <LongAnswerField
                      description={assessmentData.assessment.name}
                      bind:value={assessmentAnswers[assessmentId]}
                      isReadOnly={canRateReadiness(data.role) ||
                        !assessmentData.isApplicable}
                    />
                  {:else if assessmentData.assessment.answerType === 'File'}
                    <FileUploadField
                      bind:this={fileUploadComponents[assessmentId]}
                      description={assessmentData.assessment.name}
                      fileUrl={assessmentData.response?.fileUrl || ''}
                      bind:value={assessmentAnswers[assessmentId]}
                      isReadOnly={canRateReadiness(data.role) ||
                        !assessmentData.isApplicable}
                      {access}
                      {startupId}
                      assessmentId={assessmentId.toString()}
                      assessmentName={assessmentData.assessment.name}
                      on:fileRemoved={() => $assessmentQuery.refetch()}
                    />
                  {/if}
                </div>

                <!-- Submit Button (Only for Startup) -->
                {#if data.role === 'Startup'}
                  <div class="flex justify-end">
                    <button
                      type="button"
                      class="lu-btn lu-btn-primary lu-btn-sm"
                      disabled={isSubmitting || !assessmentData.isApplicable}
                      onclick={() => submitSingleAssessment(assessmentData)}
                    >
                      {#if isSubmitting}
                        <Loader class="h-3.5 w-3.5 animate-spin" />
                        Submitting…
                      {:else}
                        <CircleCheck class="h-3.5 w-3.5" />
                        Submit
                      {/if}
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center gap-3 py-8">
            <p class="text-muted-foreground">
              No assessments found for {selectedReadinessType}
            </p>
          </div>
        {/if}

        {#if canRateReadiness(data.role) && selectedReadinessType}
          <ReadinessLevelGuide
            readinessType={selectedReadinessType}
            rubrics={$rubricsQuery.data ?? []}
            selectedLevel={Number(readinessLevel)}
          />
        {/if}
      </div>

      <div
        class="border-border/50 flex shrink-0 items-center justify-between gap-3 border-t pt-4"
      >
        {#if canRateReadiness(data.role)}
          {@const typeAssessments = selectedReadinessType
            ? assessmentsByType()[selectedReadinessType] || []
            : []}
          {@const hasApplicableAssessments = typeAssessments.some(
            (a: any) => a.isApplicable
          )}
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">Rate Readiness Level:</span>
            <Select.Root type="single" bind:value={readinessLevel}>
              <Select.Trigger
                class="w-[120px]"
                disabled={!hasApplicableAssessments}
              >
                Level {readinessLevel}
              </Select.Trigger>
              <Select.Content>
                {#each Array.from( { length: 9 }, (_, i) => (i + 1).toString() ) as level}
                  <Select.Item value={level}>Level {level}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <button
              type="button"
              class="lu-btn lu-btn-primary lu-btn-sm"
              disabled={isRatingAssessment || !hasApplicableAssessments}
              onclick={rateAssessmentType}
            >
              {isRatingAssessment ? 'Rating…' : 'Rate'}
            </button>
            {#if !hasApplicableAssessments}
              <span class="text-xs text-muted-foreground">
                No applicable assessments to rate
              </span>
            {/if}
          </div>
        {:else}
          <div></div>
        {/if}

        <span class="hidden text-xs font-medium text-muted-foreground sm:block">
          {modalProgress()}% complete
        </span>

        <button
          type="button"
          class="lu-btn lu-btn-secondary lu-btn-sm"
          onclick={closeTypeModal}
        >
          Close
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <!-- Original Assessment Form Modal -->
  <Dialog.Root open={showAssessmentForm} onOpenChange={toggleAssessmentForm}>
    <Dialog.Content size="lg">
      {#if selectedAssessment}
        <ReadinessAssessmentForm
          {access}
          {startupId}
          assessment={selectedAssessment}
          onclose={toggleAssessmentForm}
          onsubmit={handleAssessmentSubmit}
          onstatusChanged={() => $assessmentQuery.refetch()}
          isRater={canRateReadiness(data.role)}
        />
      {/if}
    </Dialog.Content>
  </Dialog.Root>
{/snippet}

{#snippet noAssessments()}
  <StatePanel title="No assessments assigned yet">
    {#if data.role === 'Startup'}
      Nothing to complete right now. Your mentor assigns the questions for each
      dimension.
    {:else}
      This startup has no assessment questions assigned yet.
    {/if}
  </StatePanel>
{/snippet}

{#snippet loading()}
  <div
    class="flex flex-col gap-4"
    role="status"
    aria-label="Loading assessments"
  >
    <span class="lu-skel h-4 w-80 max-w-full"></span>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}
        <span class="lu-skel h-[9.5rem] rounded-2xl"></span>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet error()}
  <StatePanel kind="error" title="Assessments could not be loaded">
    Refresh the page to try again.
    {#snippet action()}
      <button
        type="button"
        class="lu-btn lu-btn-secondary lu-btn-sm"
        onclick={() => $assessmentQuery.refetch()}
      >
        Try again
      </button>
    {/snippet}
  </StatePanel>
{/snippet}

<style>
  .assessment-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .assessment-scroll::-webkit-scrollbar {
    width: 8px;
  }

  .assessment-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .assessment-scroll::-webkit-scrollbar-thumb {
    background-color: var(--border);
    border-radius: 9999px;
  }

  .assessment-scroll::-webkit-scrollbar-thumb:hover {
    background-color: var(--muted-foreground);
  }
</style>
