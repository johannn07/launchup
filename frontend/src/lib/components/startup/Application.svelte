<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

  export async function getData() {
    const uratQuestions = await fetch(
      `${PUBLIC_API_URL}/readinesslevel/urat-questions`
    );

    const data = await uratQuestions.json();
    if (uratQuestions.ok) {
      const calculatorQuestions = await fetch(
        `${PUBLIC_API_URL}/readinesslevel/calculator-questions`
      );

      const data2 = await calculatorQuestions.json();

      if (calculatorQuestions.ok) {
        return {
          technologyQuestions: data.filter(
            (d: any) => d.readinessType === 'Technology'
          ),
          marketQuestions: data.filter(
            (d: any) => d.readinessType === 'Market'
          ),
          acceptanceQuestions: data.filter(
            (d: any) => d.readinessType === 'Acceptance'
          ),
          organizationalQuestions: data.filter(
            (d: any) => d.readinessType === 'Organizational'
          ),
          regulatoryQuestions: data.filter(
            (d: any) => d.readinessType === 'Regulatory'
          ),
          investmentQuestions: data.filter(
            (d: any) => d.readinessType === 'Investment'
          ),
          calculator: data2
        };
      }
    }
  }

  import Button from '../ui/button/button.svelte';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import DataPrivacy from './application/DataPrivacy.svelte';
  import EligibilityAgreement from './application/EligibilityAgreement.svelte';
  import ProjectDetails from './application/ProjectDetails.svelte';
  import GroupInformation from './application/GroupInformation.svelte';
  import Technology from './application/Technology.svelte';
  import Acceptance from './application/Acceptance.svelte';
  import Market from './application/Market.svelte';
  import Regulatory from './application/Regulatory.svelte';
  import Investment from './application/Investment.svelte';
  import Organizational from './application/Organizational.svelte';
  import TechnologyCalculator from './application/Calculator.svelte';
  import Waitlisted from './application/Waitlisted.svelte';
  import { ChevronLeft, ChevronRight, Check, Shield, FileText, ClipboardList, Cpu } from 'lucide-svelte';

  let data: any;
  let doneFetching = false;
  export let access: string;
  export let startup: any = null;

  const stepGroups = [
    { id: 'consent', label: 'Consent', icon: Shield, description: 'Data privacy & eligibility agreement' },
    { id: 'details', label: 'Details', icon: FileText, description: 'Startup information & capsule proposal' },
    { id: 'urat', label: 'URAT', icon: ClipboardList, description: 'Readiness diagnostic questions' },
    { id: 'techcomm', label: 'Tech & Comm.', icon: Cpu, description: 'Technology & commercialization assessment' }
  ];

  let steps = [
    'data-privacy',
    'eligibility-agreement',
    'project-details',
    'group-information',
    'technology',
    'market',
    'regulatory',
    'acceptance',
    'organizational',
    'investment',
    'calculator'
  ];

  let labels = [
    'Data Privacy and Consent',
    'Eligibility and Agreement',
    'Project Details',
    'Group Information',
    'Technology Readiness Level',
    'Market Readiness Level',
    'Regulatory Readiness Level',
    'Acceptance Readiness Level',
    'Organizational Readiness Level',
    'Investment Readiness Level',
    'Technology and Commercialization Readiness Level Calculator'
  ];

  // Map steps to step groups
  function getStepGroupIndex(stepIndex: number): number {
    if (stepIndex <= 1) return 0; // Consent
    if (stepIndex <= 3) return 1; // Details
    if (stepIndex <= 9) return 2; // URAT
    return 3; // Tech & Comm
  }

  if (startup?.qualificationStatus === QualificationStatus.WAITLISTED) {
    steps = ['waitlisted'];
    labels = ['Your startup is currently waitlisted....'];
  }

  let currentActive = 0;
  let currentStep = steps[currentActive];

  let formData = {
    dataPrivacy: startup?.dataPrivacy ?? false,
    eligibility: startup?.eligibility ?? false
  };

  const toggleDataPrivacy = (value: boolean) => {
    formData.dataPrivacy = value;
  };

  const toggleEligibility = (value: boolean) => {
    formData.eligibility = value;
  };
  function handleStep(stepIncrement: number) {
    currentActive += stepIncrement;
    currentStep = steps[currentActive];
  }

  onMount(() => {
    async function test() {
      const d = await getData();
      data = d;
      doneFetching = true;
    }
    test();
  });

  let submitting = false;

  // Extract waitlist message
  let waitlistMessage: string;
  $: {
    if (startup?.waitlistMessages && startup.waitlistMessages.length > 0) {
      const messages = startup.waitlistMessages;
      const latestMessage = messages[messages.length - 1];
      waitlistMessage = latestMessage.message;
    } else {
      waitlistMessage = "Unable to load waitlisted message";
    }
  }

  $: currentGroupIndex = getStepGroupIndex(currentActive);
  $: progressPercent = Math.round((currentActive / (steps.length - 1)) * 100);

  // Count completed URAT dimensions
  $: uratCompleted = (() => {
    if (currentActive < 4) return 0;
    if (currentActive > 9) return 6;
    return currentActive - 3;
  })();
</script>

<form
  method="post"
  class="flex flex-col w-full flex-1 min-h-0"
  enctype="multipart/form-data"
>
  {#if startup?.id}
    <input type="hidden" name="startupId" value={startup.id} />
  {/if}

  <!-- Premium Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between mb-1">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[#6366f1]">LaunchUp Enhanced</p>
        <h2 class="text-xl font-black tracking-tight text-slate-950 dark:text-white">Startup application</h2>
      </div>
      <span class="text-sm font-medium text-[#6366f1]">Step {currentGroupIndex + 1} of {stepGroups.length}</span>
    </div>

    <!-- Step Indicator -->
    <div class="flex items-center gap-0 mt-4">
      {#each stepGroups as group, i}
        <div class="flex items-center {i < stepGroups.length - 1 ? 'flex-1' : ''}">
          <div class="flex flex-col items-center gap-1.5">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300
                {i < currentGroupIndex
                  ? 'bg-[#6366f1] text-white shadow-[0_0_16px_rgba(99,102,241,0.4)]'
                  : i === currentGroupIndex
                    ? 'bg-[#6366f1] text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] ring-4 ring-[#6366f1]/20'
                    : 'bg-slate-200/60 text-slate-500 dark:bg-white/10 dark:text-white/40'}"
            >
              {#if i < currentGroupIndex}
                <Check class="h-4 w-4" />
              {:else}
                {i + 1}
              {/if}
            </div>
            <span class="text-[11px] font-semibold whitespace-nowrap
              {i <= currentGroupIndex ? 'text-[#6366f1]' : 'text-slate-400 dark:text-white/40'}"
            >{group.label}</span>
          </div>
          {#if i < stepGroups.length - 1}
            <div class="flex-1 h-0.5 mx-3 mt-[-18px] rounded-full transition-all duration-500
              {i < currentGroupIndex ? 'bg-[#6366f1]' : 'bg-slate-200 dark:bg-white/10'}"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex-1 min-h-0 overflow-auto rounded-2xl border border-slate-200/70 bg-white/50 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/40">
    <!-- Step Title -->
    <div class="mb-4 pb-3 border-b border-slate-200/50 dark:border-white/10">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#6366f1]/10 dark:bg-[#6366f1]/20">
          <svelte:component this={stepGroups[currentGroupIndex].icon} class="h-4 w-4 text-[#6366f1]" />
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white">{labels[currentActive]}</h3>
          <p class="text-xs text-slate-500 dark:text-white/50">{stepGroups[currentGroupIndex].description}</p>
        </div>
      </div>

      <!-- URAT dimension progress -->
      {#if currentGroupIndex === 2}
        <div class="mt-3 flex items-center gap-2">
          <span class="text-xs text-slate-500 dark:text-white/50">Answer all questions across each readiness dimension</span>
          <span class="ml-auto text-xs font-semibold text-[#6366f1]">{uratCompleted} / 6 complete</span>
        </div>
        <div class="mt-1.5 flex gap-1.5">
          {#each ['TRL', 'MRL', 'RRL', 'ARL', 'ORL', 'IRL'] as dim, i}
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200
                {currentActive === i + 4
                  ? 'bg-[#6366f1] text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]'
                  : currentActive > i + 4
                    ? 'bg-[#6366f1]/15 text-[#6366f1] dark:bg-[#6366f1]/25'
                    : 'bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/30'}"
              on:click|preventDefault={() => { currentActive = i + 4; currentStep = steps[currentActive]; }}
            >
              {dim}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Calculator progress -->
      {#if currentGroupIndex === 3}
        <div class="mt-3 flex items-center gap-2">
          <span class="text-xs text-slate-500 dark:text-white/50">Answer all technology & commercialization readiness questions</span>
        </div>
      {/if}
    </div>

    <!-- TO ADD WAITLISTED SCREEN -->
    <Waitlisted
      stepName="waitlisted"
      message={waitlistMessage}
      {currentStep}
    />
    <DataPrivacy
      stepName="data-privacy"
      {currentStep}
      dataPrivacy={formData.dataPrivacy}
      {toggleDataPrivacy}
    />
    <EligibilityAgreement
      stepName="eligibility-agreement"
      {currentStep}
      {toggleEligibility}
      eligibility={formData.eligibility}
    />
    <ProjectDetails stepName="project-details" {currentStep} {access} {startup} />
    <GroupInformation stepName="group-information" {currentStep} {access} {startup} />
    {#if doneFetching && data}
      <Technology stepName="technology" {currentStep} question={data.technologyQuestions} {startup} />
      <Market stepName="market" {currentStep} question={data.marketQuestions} {startup} />
      <Regulatory stepName="regulatory" {currentStep} question={data.regulatoryQuestions} {startup} />
      <Acceptance stepName="acceptance" {currentStep} question={data.acceptanceQuestions} {startup} />
      <Organizational
        stepName="organizational" {currentStep}
        question={data.organizationalQuestions}
        {startup}
      />
      <Investment stepName="investment" {currentStep} question={data.investmentQuestions} {startup} />
      <TechnologyCalculator
        stepName="calculator"
        {currentStep}
        calculatorQuestions={data.calculator}
        {startup}
      />
    {/if}
  </div>

  <!-- Bottom Navigation -->
  <div class="flex items-center justify-between pt-4 mt-auto">
    {#if currentActive != 0}
      <Button
        variant="outline"
        class="flex items-center gap-2 rounded-xl border-slate-200 bg-white/60 px-5 backdrop-blur dark:border-white/10 dark:bg-white/5"
        onclick={() => handleStep(-1)}
      >
        <ChevronLeft class="h-4 w-4" />
        Previous
      </Button>
    {:else}
      <div></div>
    {/if}

    <!-- Progress -->
    <span class="text-xs font-medium text-slate-500 dark:text-white/50">{progressPercent}% complete</span>

    {#if currentActive < steps.length - 1}
      <Button
        type="button"
        class="flex items-center gap-2 rounded-xl bg-[#6366f1] px-5 text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] hover:shadow-[0_8px_24px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition-all duration-200"
        onclick={() => handleStep(1)}
        disabled={currentActive == 0 && !formData.dataPrivacy
          ? true
          : currentActive == 1 && !formData.eligibility
            ? true
            : false}
      >
        Next
        <ChevronRight class="h-4 w-4" />
      </Button>
    {:else}
      {#if startup?.qualificationStatus === QualificationStatus.WAITLISTED}
        <div class="flex justify-end gap-3">
          <a href="/apply?startupId={startup.id}">
            <Button class="rounded-xl bg-[#6366f1] px-5 text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)]">
              Edit application
            </Button>
          </a>
        </div>
      {:else}
        <Button
          class="rounded-xl bg-[#6366f1] px-6 text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] hover:shadow-[0_8px_24px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition-all duration-200"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      {/if}
    {/if}
  </div>
</form>
