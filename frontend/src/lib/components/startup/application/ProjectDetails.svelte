<script lang="ts">
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';
  export let stepName: string;
  export let currentStep: string;
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Upload, FileText, Loader } from 'lucide-svelte';

  let files: any;
  export let access: string;
  export let startup: any = null;
  let processing = false;
  let information: {
    title: string;
    startup_description: string;
    problem_statement: string;
    target_market: string;
    solution_description: string;
    objectives: string;
    scope: string;
    methodology: string;
    fieldConfidence?: Record<string, 'verified' | 'low' | 'failed'>;
    legibilityStatus?: 'verified' | 'failed';
    legibilityReason?: string | null;
    sketchDetected?: boolean;
    sketchConfidence?: number;
  };

  const reviewFields = [
    { key: 'title', label: 'Acceleration Proposal Title' },
    { key: 'startup_description', label: 'Startup Description' },
    { key: 'problem_statement', label: 'Problem Statement' },
    { key: 'target_market', label: 'Target Market' },
    { key: 'solution_description', label: 'Solution Description' },
    { key: 'objectives', label: 'Objectives' },
    { key: 'scope', label: 'Scope' },
    { key: 'methodology', label: 'Methodology' }
  ] as const;

  let formData = {
    name: startup?.name ?? '',
    links: startup?.links ?? ''
  };

  // Initialize information with existing capsule proposal data if available
  $: if (startup?.capsuleProposal && !files) {
    information = {
      title: startup.capsuleProposal.title || '',
      startup_description: startup.capsuleProposal.description || '',
      problem_statement: startup.capsuleProposal.problemStatement || '',
      target_market: startup.capsuleProposal.targetMarket || '',
      solution_description: startup.capsuleProposal.solutionDescription || '',
      objectives: startup.capsuleProposal.objectives || '',
      scope: startup.capsuleProposal.scope || '',
      methodology: startup.capsuleProposal.methodology || ''
    };
  }

  import { toast } from 'svelte-sonner';

  async function getInformation() {
    processing = true;
    if (!files || !files[0]) {
      console.error('No file selected');
      processing = false;
      return;
    }

    const formData = new FormData();
    formData.append('capsuleProposal', files[0]);

    try {
      const response = await fetch(
        `${PUBLIC_API_URL}/startups/parse-capsule-proposal`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access}`
          },
          body: formData
        }
      );

      const data = await response.json();

      if (response.ok) {
        information = {
          title: data.title || '',
          startup_description: data.startup_description || '',
          problem_statement: data.problem_statement || '',
          target_market: data.target_market || '',
          solution_description: data.solution_description || '',
          objectives: data.objectives || '',
          scope: data.scope || '',
          methodology: data.methodology || '',
          fieldConfidence: data.fieldConfidence || {},
          legibilityStatus: data.legibilityStatus || 'verified',
          legibilityReason: data.legibilityReason || null,
          sketchDetected: data.sketchDetected || false,
          sketchConfidence: data.sketchConfidence || 0,
        };
      } else {
        toast.error(data.message || 'Failed to process document. Please try again.');
        resetUpload();
      }
    } catch (err) {
      toast.error('Network error occurred while processing document.');
      resetUpload();
    } finally {
      processing = false;
    }
  }

  function resetUpload() {
    files = null;
    information = undefined as never;
  }

  function getReviewStatus(value: string | undefined) {
    if (!value || !value.trim()) {
      return {
        label: 'Failed',
        tone: 'border-rose-200 bg-rose-50 text-rose-700'
      };
    }

    if (value.trim().length < 40) {
      return {
        label: 'Low',
        tone: 'border-amber-200 bg-amber-50 text-amber-700'
      };
    }

    return {
      label: 'Verified',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700'
    };
  }

  function getConfidenceLabel(fieldKey: keyof typeof information.fieldConfidence | string) {
    const confidence = information?.fieldConfidence?.[fieldKey] ?? 'verified';
    if (confidence === 'failed') return 'Failed';
    if (confidence === 'low') return 'Low';
    return 'Verified';
  }

  function getConfidenceTone(fieldKey: keyof typeof information.fieldConfidence | string) {
    const confidence = information?.fieldConfidence?.[fieldKey] ?? 'verified';
    if (confidence === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
    if (confidence === 'low') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  $: if (files) {
    getInformation();
  }
</script>

<div class="flex-1 min-h-0 overflow-auto px-1" class:hidden={currentStep !== stepName}>
  <div class="flex flex-col gap-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="startup_name" class="text-sm font-semibold text-slate-700 dark:text-white/70">Startup name <span class="text-red-500">*</span></Label>
        <Input
          name="startup_name"
          id="startup_name"
          type="text"
          placeholder="e.g. GreenPath Technologies"
          required
          bind:value={formData.name}
          class="h-11 rounded-xl border-slate-200/70 bg-white/70 backdrop-blur focus-visible:ring-2 focus-visible:ring-[#6366f1] dark:border-white/10 dark:bg-white/5"
        />
      </div>
      <div class="grid gap-2">
        <Label for="links" class="text-sm font-semibold text-slate-700 dark:text-white/70">Supporting links <span class="text-slate-400">(optional)</span></Label>
        <Input
          name="links"
          id="links"
          type="text"
          placeholder="e.g. GitHub, demo, pitch deck URL"
          bind:value={formData.links}
          class="h-11 rounded-xl border-slate-200/70 bg-white/70 backdrop-blur focus-visible:ring-2 focus-visible:ring-[#6366f1] dark:border-white/10 dark:bg-white/5"
        />
      </div>
    </div>

    <div class="grid gap-2">
      <Label class="text-sm font-semibold text-slate-700 dark:text-white/70">Capsule proposal <span class="text-red-500">*</span></Label>
      <p class="text-xs text-slate-500 dark:text-white/40">Upload a typed PDF or an image of a handwritten/annotated canvas document.</p>
      <label
        for="capsuleProposal"
        class="flex h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200/70 bg-slate-50/40 transition-all duration-200 hover:border-[#6366f1]/40 hover:bg-[#6366f1]/5 dark:border-white/10 dark:bg-white/5 dark:hover:border-[#6366f1]/30"
      >
        {#if files}
          {#if processing}
            <div class="flex flex-col items-center justify-center gap-2">
              <Loader class="h-6 w-6 animate-spin text-[#6366f1]" />
              <span class="text-sm font-medium text-slate-600 dark:text-white/60">Processing your capsule proposal...</span>
            </div>
          {:else}
            <div class="flex flex-col items-center gap-2">
              <FileText class="h-6 w-6 text-[#6366f1]" />
              <span class="text-sm font-medium text-slate-700 dark:text-white/70">{files[0].name}</span>
              <span class="text-xs text-emerald-600 dark:text-emerald-400">✓ Processed successfully</span>
            </div>
          {/if}
        {:else if startup?.capsuleProposal?.fileName}
          <div class="flex flex-col items-center justify-center gap-2">
            <FileText class="h-6 w-6 text-[#6366f1]" />
            <span class="text-sm font-medium text-slate-700 dark:text-white/70">{startup.capsuleProposal.fileName}</span>
          </div>
        {:else}
          <Upload class="h-6 w-6 text-slate-400 dark:text-white/30 mb-2" />
          <span class="text-sm font-medium text-slate-600 dark:text-white/50">Click to upload or drag and drop</span>
          <span class="text-xs text-slate-400 dark:text-white/30">PDF or image (JPG, PNG) up to 10MB</span>
        {/if}
      </label>
      <input
        id="capsuleProposal"
        name="capsuleProposal"
        class="hidden"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        bind:files
      />
    </div>

    {#if information}
      <div class="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/40">OCR review</p>
            <h3 class="mt-1 text-lg font-bold text-slate-900 dark:text-white">Review the extracted proposal before continuing</h3>
            {#if information.legibilityStatus === 'failed'}
              <p class="mt-2 max-w-2xl text-sm leading-6 text-rose-700 dark:text-rose-300">
                The image quality check failed{information.legibilityReason ? `: ${information.legibilityReason}` : '.'} Re-upload a clearer image or switch to a PDF.
              </p>
            {/if}
            {#if information.sketchDetected}
              <p class="mt-2 max-w-2xl text-sm leading-6 text-amber-700 dark:text-amber-300">
                The uploaded image appears to be a sketch/diagram (confidence {information.sketchConfidence}). Please provide a typed proposal if possible or transcribe key points manually below.
              </p>
            {/if}
          </div>
          <button
            type="button"
            class="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#6366f1]/30 hover:text-[#4f46e5] dark:border-white/10 dark:text-white/70"
            onclick={resetUpload}
          >
            Re-upload file
          </button>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2">
          {#each reviewFields as field}
            {@const status = getReviewStatus(information[field.key])}
            <div class={`rounded-xl border p-4 ${status.tone}`}>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{field.label}</p>
                  <textarea
                    bind:value={information[field.key]}
                    disabled={information.legibilityStatus === 'failed'}
                    class="mt-2 min-h-[7rem] w-full rounded-xl border border-slate-200 bg-white/90 p-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/15 dark:border-white/10 dark:bg-slate-950/40 dark:text-white/85"
                    placeholder="No text extracted yet"
                  ></textarea>
                </div>
                <span class={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${getConfidenceTone(field.key)}`}>
                  {getConfidenceLabel(field.key)}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if information}
      <input type="hidden" name="title" value={information.title} />
      <input type="hidden" name="startupDescription" value={information.startup_description} />
      <input type="hidden" name="problemStatement" value={information.problem_statement} />
      <input type="hidden" name="targetMarket" value={information.target_market} />
      <input type="hidden" name="solutionDescription" value={information.solution_description} />
      <input type="hidden" name="objectives" value={information.objectives} />
      <input type="hidden" name="scope" value={information.scope} />
      <input type="hidden" name="methodology" value={information.methodology} />
    {/if}
  </div>
</div>
