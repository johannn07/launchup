<script lang="ts">
  import { useQuery } from '@sveltestack/svelte-query';
  import axiosInstance from '$lib/axios';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card/index.js';
  import ReadinessAssessmentCard from '$lib/components/startups/assessment/ReadinessAssessmentCard.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import ReadinessAssessmentForm from '$lib/components/startups/assessment/ReadinessAssessmentForm.svelte';
  import type { Assessment } from '$lib/types/assessment.types';
  import Loading from '$lib/components/startup/Loading.svelte';
  import {
    getReadinessTypes,
    getReadinessStyles,
    canRateReadiness
  } from '$lib/utils';
  import ShortAnswerField from '$lib/components/startups/assessment/AssessmentTypes/ShortAnswerField.svelte';
  import LongAnswerField from '$lib/components/startups/assessment/AssessmentTypes/LongAnswerField.svelte';
  import FileUploadField from '$lib/components/startups/assessment/AssessmentTypes/FileUploadField.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Select from '$lib/components/ui/select';
  import { ReadinessLevelGuide } from '$lib/components/startups/readiness';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { CircleCheck, Info, Loader } from 'lucide-svelte';
  import { Cpu, TrendingUp, CheckCircle2, Building2, ShieldCheck, Wallet } from 'lucide-svelte';

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
  const typeConfig: Record<string, { icon: any; accent: string }> = {
    Technology:     { icon: Cpu,          accent: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
    Market:         { icon: TrendingUp,   accent: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    Acceptance:     { icon: CheckCircle2, accent: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    Organizational: { icon: Building2,    accent: 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    Regulatory:     { icon: ShieldCheck,  accent: 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
    Investment:     { icon: Wallet,       accent: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400' }
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
</script>

{#if isLoading}
  {@render loading()}
{:else if hasAssessment}
  {@render hasAssessments()}
{:else if !hasAssessment}
  {@render noAssessments()}
{:else if isError}
  {@render error()}
{/if}

{#snippet hasAssessments()}
    {#if data.role === 'Startup'}
      <div class="mt-2 flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <CircleCheck class="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
        <p class="text-sm font-medium text-emerald-100">
          Your application has been approved. Please complete the following readiness assessments.
        </p>
      </div>
    {:else}
      <div class="mt-2 flex items-start gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <Info class="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-400" />
        <p class="text-sm font-medium text-indigo-100">
          Here are the current assessments of the startup. Click on "View Assessment" to see their progress.
        </p>
      </div>
    {/if}
  <h2 class="mt-6 text-xl font-bold">Required Assessments</h2>

  <!-- Readiness Type Cards -->
  <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {#each readinessTypes as type}
    {@const assessments = assessmentsByType()[type.name] || []}
    {@const applicableAssessments = assessments.filter((a: any) => a.isApplicable)}
    {@const completedCount = applicableAssessments.filter((a: any) => {
      const hasAnswer = a.response?.answerValue && String(a.response.answerValue).trim() !== '';
      return a.status === 'Completed' && hasAnswer;
    }).length}
    {@const pendingCount = applicableAssessments.length - completedCount}
    {@const currentLevel = readinessLevelsByType()[type.name]}
    {@const progress = applicableAssessments.length > 0
      ? Math.round((completedCount / applicableAssessments.length) * 100)
      : 0}
    {@const config = typeConfig[type.name] ?? typeConfig['Technology']}
    {@const Icon = config.icon}

    <Card.Root
      class="group cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md"
      onclick={() => openTypeModal(type.name)}
    >
      <Card.Content class="p-5">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary/20">
            <Icon class="h-5 w-5 text-primary" />
          </div>
          <div class="min-w-0">
            <h3 class="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">{type.name}</h3>
            {#if currentLevel}
              <span class="text-xs font-medium text-muted-foreground">Readiness Level {currentLevel}</span>
            {:else}
              <span class="text-xs font-medium text-muted-foreground/70">Not yet rated</span>
            {/if}
          </div>
        </div>

        <div class="mb-3 flex items-center justify-between text-sm">
          <span class="text-muted-foreground">{assessments.length} assessment{assessments.length === 1 ? '' : 's'}</span>
          {#if assessments.length > 0}
            <div class="flex items-center gap-3">
              {#if pendingCount > 0}
                <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>{pendingCount} Pending
                </span>
              {/if}
              {#if completedCount > 0}
                <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>{completedCount} Done
                </span>
              {/if}
            </div>
          {/if}
        </div>

        {#if applicableAssessments.length > 0}
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-all"
              style={`width: ${progress}%`}
            ></div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/each}
</div>

  <!-- Type Modal with Assessments -->
  <Dialog.Root open={showTypeModal} onOpenChange={closeTypeModal}>
    <Dialog.Content class="max-h-[85vh] max-w-[900px]">
      <Dialog.Header class="text-left">
        <div class="flex items-center gap-3">
          <div class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${selectedTypeConfig.accent}`}>
            <ModalTypeIcon class="h-5 w-5" />
          </div>
          <div>
            <Dialog.Title class="text-xl font-semibold leading-snug">
              {selectedReadinessType} Assessments
            </Dialog.Title>
            <Dialog.Description>
              {#if data.role === 'Startup'}
                Complete all assessments below to improve your readiness level
              {:else}
                View and rate the startup's assessment responses
              {/if}
            </Dialog.Description>
          </div>
        </div>
      </Dialog.Header>

      <div class="assessment-scroll max-h-[calc(85vh-180px)] overflow-y-auto px-4">
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

              <div class="rounded-lg border border-border/60 bg-muted/10 p-4">
                <!-- Assessment Header -->
                <div class="mb-3 flex items-start justify-between gap-3">
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
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-base font-semibold leading-snug">
                          {assessmentData.assessment.name}
                        </h3>
                        <Badge variant="secondary" class="shrink-0 text-[10px] font-medium">
                          {assessmentData.assessment.answerType}
                        </Badge>
                      </div>
                      {#if !assessmentData.isApplicable}
                        <p
                          class="mt-1.5 text-xs text-orange-600 dark:text-orange-400"
                        >
                          Not applicable to this startup
                        </p>
                      {/if}
                    </div>
                  </div>
                  {#if assessmentData.isApplicable}
                    <Badge
                      variant={isCompleted ? 'default' : 'secondary'}
                      class={isCompleted
                        ? 'shrink-0 border border-emerald-500/30 bg-emerald-600/90 text-emerald-100'
                        : 'shrink-0 border border-amber-500/30 bg-amber-600/90 text-amber-100'}
                    >
                      {isCompleted ? 'Completed' : 'Pending'}
                    </Badge>
                  {/if}
                </div>

                <!-- Assessment Field Based on Type -->
                <div class="mb-3">
                  {#if assessmentData.assessment.answerType === 'ShortAnswer'}
                    <ShortAnswerField
                      description={assessmentData.assessment.name}
                      bind:value={assessmentAnswers[assessmentId]}
                      isReadOnly={canRateReadiness(data.role) || !assessmentData.isApplicable}
                    />
                  {:else if assessmentData.assessment.answerType === 'LongAnswer'}
                    <LongAnswerField
                      description={assessmentData.assessment.name}
                      bind:value={assessmentAnswers[assessmentId]}
                      isReadOnly={canRateReadiness(data.role) || !assessmentData.isApplicable}
                    />
                  {:else if assessmentData.assessment.answerType === 'File'}
                    <FileUploadField
                      bind:this={fileUploadComponents[assessmentId]}
                      description={assessmentData.assessment.name}
                      fileUrl={assessmentData.response?.fileUrl || ''}
                      bind:value={assessmentAnswers[assessmentId]}
                      isReadOnly={canRateReadiness(data.role) || !assessmentData.isApplicable}
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
                    <Button
                      variant="default"
                      size="sm"
                      class="gap-1.5"
                      disabled={isSubmitting || !assessmentData.isApplicable}
                      onclick={() => submitSingleAssessment(assessmentData)}
                    >
                      {#if isSubmitting}
                        <Loader class="h-3.5 w-3.5 animate-spin" />
                        Submitting...
                      {:else}
                        <CircleCheck class="h-3.5 w-3.5" />
                        Submit Assessment
                      {/if}
                    </Button>
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

      <div class="flex items-center justify-between gap-3 border-t pt-4">
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
            <Button
              variant="default"
              size="sm"
              disabled={isRatingAssessment || !hasApplicableAssessments}
              onclick={rateAssessmentType}
            >
              {isRatingAssessment ? 'Rating...' : 'Rate'}
            </Button>
            {#if !hasApplicableAssessments}
              <span class="text-xs text-muted-foreground">
                No applicable assessments to rate
              </span>
            {/if}
          </div>
        {/if}
        <Button variant="outline" onclick={closeTypeModal}>Close</Button>
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <!-- Original Assessment Form Modal -->
  <Dialog.Root open={showAssessmentForm} onOpenChange={toggleAssessmentForm}>
    <Dialog.Content class="h-4/5 max-w-[800px]">
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
  <Card.Root class="h-full">
    <Card.Content
      class="flex h-full flex-col items-center justify-center gap-5"
    >
      <img src="/pending.svg" alt="pending" class="h-[300px] w-[300px]" />
      <h1>
        This startup is currently not assigned with an assessment right now.
      </h1>
    </Card.Content>
  </Card.Root>
{/snippet}

{#snippet loading()}
  <Loading {data}></Loading>
{/snippet}

{#snippet error()}
  ERROR
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
