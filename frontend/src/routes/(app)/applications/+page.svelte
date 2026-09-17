<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { goto } from '$app/navigation';
  import StartupCard from '$lib/components/dashboard/StartupCard.svelte';
  import type { PageData } from './$types';
  import { page } from '$app/stores';
  import PendingDialog from '$lib/components/dashboard/PendingDialog.svelte';
  import WaitlistedDialog from '$lib/components/dashboard/WaitlistedDialog.svelte';
  import QualifiedDialog from '$lib/components/dashboard/QualifiedDialog.svelte';
  import CompletedDialog from '$lib/components/dashboard/CompletedDialog.svelte';
  import { LoadingState, EmptyState } from '$lib/components/shared';
  import { ClipboardList } from 'lucide-svelte';
  import axiosInstance from '$lib/axios';
  import { useQueries } from '@sveltestack/svelte-query';

  let { data }: { data: PageData } = $props();

  let access = data.access;

  let selectedTab = $state($page.url.searchParams.get('tab') || 'pending');
  let applicants: any = $state([]);

  let dialogLoading = $state(false);
  let showDialog = $state(false);
  let selectedStartup: any = $state(null);
  let startupAssessments: Array<{
    name: string;
    assessmentStatus: string;
    assessmentFields?: any[];
  }> = $state([]);

  async function fetchStartupAssessments(startupId: number) {
    try {
      const { data } = await axiosInstance.get(
        `/assessments/startup/${startupId}`,
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );
      startupAssessments = data ?? [];
    } catch (e) {
      console.error('Failed to load startup assessments', e);
      startupAssessments = [];
    }
  }

  async function openStartupDialog(startup: any) {
    selectedStartup = startup;
    if (startup?.id) {
      await fetchStartupAssessments(startup.id);
    }
    showDialog = true;
  }

  function toggleDialog() {
    showDialog = !showDialog;
    if (!showDialog) {
      selectedStartup = null;
      startupAssessments = [];
    }
  }

  async function assignAssessmentsToStartup(startupId: number) {
    try {
      const response = await axiosInstance.post(
        `/assessments/startup-assessment/${startupId}`,
        {},
        { headers: { Authorization: `Bearer ${access}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error assigning assessments:', error);
      throw error;
    }
  }

  async function approveStartup(
    startupId: number,
    selectedMentor: any,
    acknowledgedFlaggedSummary = false
  ) {
    const response = await fetch(
      `/api/startups/${startupId}/approve-applicant/`,
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access}`
        },
        body: JSON.stringify({ acknowledgedFlaggedSummary })
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || 'Failed to approve this application.');
    }

    const assignmentor = await fetch(
      `/api/startups/${startupId}/appoint-mentors/`,
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access}`
        },
        body: JSON.stringify({
          mentorIds: [selectedMentor]
        })
      }
    );
    if (assignmentor.ok) {
      await Promise.all([
        $queries[0].refetch(),
        $queries[1].refetch(),
        $queries[2].refetch()
      ]);

      showDialog = false;
      selectedStartup = null;
    }
  }

  async function waitlistStartup(startupId: number, message: string) {
    try {
      const response = await axiosInstance.patch(
        `/startups/${startupId}/waitlist-applicant`,
        {
          message: message,
          managerId: data.user.id
        },
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );
      if (response.status === 200) {
        await Promise.all([
          $queries[0].refetch(),
          $queries[1].refetch(),
          $queries[2].refetch()
        ]);

        showDialog = false;
        selectedStartup = null;
      }
      return response.data;
    } catch (error) {
      console.error('Error waitlisting startup:', error);
      throw error;
    }
  }

  async function getAssessmentTypesWithFields() {
    const { data: grouped } = await axiosInstance.get('/assessments/grouped', {
      headers: {
        Authorization: `Bearer ${data.access}`
      }
    });

    const assessmentTypes = Object.entries(grouped).map(
      ([typeName, assessments]) => ({
        name: typeName,
        assessments: assessments
      })
    );

    return assessmentTypes;
  }

  const queries = useQueries([
    {
      queryKey: ['getAllStartups'],
      queryFn: async () => {
        const response = await axiosInstance.get(`/startups/all`, {
          headers: {
            Authorization: `Bearer ${data.access}`
          }
        });
        return response.data;
      },
      cacheTime: 0,
      staleTime: 0
    },
    {
      queryKey: ['mentors'],
      queryFn: async () =>
        (
          await axiosInstance.get(`/users?userRole=Mentor`, {
            headers: {
              Authorization: `Bearer ${data.access}`
            }
          })
        ).data,
      cacheTime: 0,
      staleTime: 0
    },
    {
      queryKey: ['assessments'],
      queryFn: async () => getAssessmentTypesWithFields(),
      cacheTime: 0,
      staleTime: 0
    }
  ]);

  async function markComplete(startupId: number) {
    try {
      dialogLoading = true;
      const response = await axiosInstance.patch(
        `/startups/${startupId}/mark-complete`,
        {},
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );
      if (response.status === 200) {
        await Promise.all([$queries[0].refetch(), $queries[1].refetch()]);

        showDialog = false;
        selectedStartup = null;
      }
    } catch (error) {
      console.error('Error marking startup as complete:', error);
    } finally {
      dialogLoading = false;
    }
  }

  async function changeMentor(startupId: number, mentorId: number) {
    try {
      dialogLoading = true;
      const response = await axiosInstance.patch(
        `/startups/${startupId}/change-mentor`,
        { mentorId },
        {
          headers: {
            Authorization: `Bearer ${access}`
          }
        }
      );
      if (response.status === 200) {
        await Promise.all([$queries[0].refetch(), $queries[1].refetch()]);

        const updatedStartup = $queries[0].data.find(
          (s: any) => s.id === startupId
        );
        if (updatedStartup) {
          selectedStartup = updatedStartup;
        }
      }
    } catch (error) {
      console.error('Error changing mentor:', error);
    } finally {
      dialogLoading = false;
    }
  }

  $effect(() => {
    if ($queries[0].isSuccess) {
      if ($queries[0].data.length > 0) {
        if (selectedTab === 'pending') {
          applicants = $queries[0].data.filter(
            (applicant: any) => applicant.qualificationStatus === 1
          );
        } else if (selectedTab === 'waitlisted') {
          applicants = $queries[0].data.filter(
            (applicant: any) => applicant.qualificationStatus === 2
          );
        } else if (selectedTab === 'qualified') {
          applicants = $queries[0].data.filter(
            (applicant: any) => applicant.qualificationStatus === 3
          );
        } else if (selectedTab === 'completed') {
          applicants = $queries[0].data.filter(
            (applicant: any) => applicant.qualificationStatus === 4
          );
        }
      } else {
        applicants = [];
      }
    }
  });

  function getEmptyTitle() {
    if (selectedTab === 'pending') return 'No pending applications';
    if (selectedTab === 'waitlisted') return 'No waitlisted applications';
    if (selectedTab === 'qualified') return 'No qualified startups';
    return 'No completed applications';
  }
</script>

<svelte:head>
  <title>LaunchUp - Applications</title>
</svelte:head>

{#if $queries[0].isLoading || $queries[1].isLoading || $queries[2].isLoading}
  <LoadingState variant="spinner" />
{:else}
  {@const mentors = $queries[1].data}
  {@const assessments = $queries[2].data}
  <div class="flex flex-col gap-5">
    <div class="glass-card p-1">
      <Tabs.Root value={selectedTab}>
        <Tabs.List class="glass-subtle rounded-xl">
          <Tabs.Trigger
            value="pending"
            onclick={() => {
              selectedTab = 'pending';
              showDialog = false;
              goto('/applications?tab=pending');
            }}>Pending</Tabs.Trigger
          >
          <Tabs.Trigger
            value="waitlisted"
            onclick={() => {
              selectedTab = 'waitlisted';
              showDialog = false;
              goto('/applications?tab=waitlisted');
            }}>Waitlisted</Tabs.Trigger
          >
          <Tabs.Trigger
            value="qualified"
            onclick={() => {
              selectedTab = 'qualified';
              showDialog = false;
              goto('/applications?tab=qualified');
            }}>Qualified</Tabs.Trigger
          >
          <Tabs.Trigger
            value="completed"
            onclick={() => {
              selectedTab = 'completed';
              showDialog = false;
              goto('/applications?tab=completed');
            }}>Completed</Tabs.Trigger
          >
        </Tabs.List>
      </Tabs.Root>
    </div>

    <div class="space-y-4">
      {#if applicants.length > 0}
        {#each applicants as applicant}
          <StartupCard
            startup={applicant}
            {selectedTab}
            onOpenStartupDialog={() => {
              openStartupDialog(applicant);
            }}
          />
        {/each}
      {:else}
        <EmptyState
          icon={ClipboardList}
          title={getEmptyTitle()}
          description="There are no applications in this category at the moment."
        />
      {/if}
    </div>
  </div>

  {#if dialogLoading}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div class="glass-card flex items-center gap-4 p-6">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
        <span class="text-sm font-medium">Processing...</span>
      </div>
    </div>
  {/if}

  {#if selectedTab === 'pending'}
    <PendingDialog
      startup={selectedStartup}
      {showDialog}
      {toggleDialog}
      {waitlistStartup}
      mentors={mentors || []}
      assessments={assessments || []}
      {approveStartup}
      {assignAssessmentsToStartup}
    />
  {:else if selectedTab === 'waitlisted'}
    <WaitlistedDialog
      startup={selectedStartup}
      {showDialog}
      {toggleDialog}
      mentors={mentors || []}
      assessments={assessments || []}
      {approveStartup}
      {assignAssessmentsToStartup}
    />
  {:else if selectedTab === 'qualified'}
    <QualifiedDialog
      startup={selectedStartup}
      {showDialog}
      {toggleDialog}
      mentors={mentors || []}
      assessments={assessments || []}
      onMarkComplete={markComplete}
      onChangeMentor={changeMentor}
      {startupAssessments}
      {assignAssessmentsToStartup}
      refetchStartupAssessments={fetchStartupAssessments}
    />
  {:else if selectedTab === 'completed'}
    <CompletedDialog
      startup={selectedStartup}
      {showDialog}
      {toggleDialog}
      {startupAssessments}
    />
  {/if}
{/if}
