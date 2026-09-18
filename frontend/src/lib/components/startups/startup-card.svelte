<script lang="ts">
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import { ChevronRight } from 'lucide-svelte';
  import { arrive } from '$lib/motion';

  let {
    startup,
    role,
    initiatives
  }: { startup: any; role: any; initiatives: any[] } = $props();

  // Same mapping as the .lu-status tokens in brand.css.
  const STATUS: Record<number, { key: string; label: string }> = {
    [QualificationStatus.PENDING]: { key: 'pending', label: 'Pending' },
    [QualificationStatus.WAITLISTED]: {
      key: 'waitlisted',
      label: 'Waitlisted'
    },
    [QualificationStatus.QUALIFIED]: { key: 'qualified', label: 'Qualified' },
    [QualificationStatus.COMPLETED]: { key: 'completed', label: 'Completed' }
  };

  const status = $derived(
    STATUS[startup?.qualificationStatus] ?? STATUS[QualificationStatus.PENDING]
  );
  // Mentors only ever see qualified startups as the ones they are working with.
  const statusLabel = $derived(
    status.key === 'qualified' && role === 'Mentor' ? 'Active' : status.label
  );

  const tier = $derived.by(() => {
    if (startup?.qualificationStatus !== QualificationStatus.QUALIFIED)
      return null;
    const evals = startup?.readinessEvaluations;
    return evals?.length ? evals[evals.length - 1].tierLabel : null;
  });

  const initials = $derived(
    (startup?.name ?? '?')
      .split(' ')
      .filter(Boolean)
      .map((w: string) => w.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2)
  );

  const done = $derived(initiatives.filter((i) => i.status === 4).length);
  const pct = $derived(
    initiatives.length ? Math.round((done / initiatives.length) * 100) : 0
  );

  // Only qualified and completed startups have an assessment to open; the
  // rest open on their overview (upstream 139026c).
  const isAssessable = $derived(
    startup?.qualificationStatus === QualificationStatus.QUALIFIED ||
      startup?.qualificationStatus === QualificationStatus.COMPLETED
  );
  const href = $derived(
    `/startups/${startup.id}/${isAssessable ? 'assessment' : 'overview/general'}`
  );

  function onClick(e: MouseEvent) {
    // Founders reapply from a waitlisted startup; everyone else reviews the
    // overview (upstream 139026c).
    if (
      role === 'Startup' &&
      startup?.qualificationStatus === QualificationStatus.WAITLISTED
    ) {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent('openApplication', { detail: { startup } })
      );
    }
  }
</script>

<!--
  A row, not a centred card: the job on this page is comparing many startups on
  the same four fields, and aligned columns let the eye run straight down them.
  Rounded square for an organisation, circle for a person (the header avatar).
-->
<a
  {href}
  onclick={onClick}
  class="lu-row group grid items-center gap-x-5 gap-y-3 px-5 py-4 transition-colors hover:bg-[#0f1a2c] focus-visible:bg-[#0f1a2c] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#818cf8] sm:grid-cols-[minmax(0,1.6fr)_8.5rem_minmax(0,1fr)_1.25rem] lg:grid-cols-[minmax(0,1.6fr)_8.5rem_minmax(0,1fr)_minmax(0,1.1fr)_1.25rem]"
>
  <!-- Identity -->
  <div class="flex min-w-0 items-center gap-3.5">
    <span
      class="lu-d flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] border border-[#2b3a5c] bg-[#111b2e] text-[14px] text-[#c7d2fe] transition-colors group-hover:border-[#4f46e5]/70 group-hover:text-white"
      aria-hidden="true"
    >
      {initials}
    </span>
    <div class="min-w-0">
      <p
        class="truncate text-[15px] font-semibold text-white"
        title={startup.name}
      >
        {startup.name}
      </p>
      <p class="mt-0.5 truncate text-[12.5px] text-[#94a3b8]">
        {tier ? `${tier} tier` : 'Not yet tiered'}
      </p>
    </div>
  </div>

  <!-- Status -->
  <div>
    <span class="lu-status" data-status={status.key}>{statusLabel}</span>
  </div>

  <!-- Progress -->
  <div class="min-w-0">
    <div class="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span class="text-[#94a3b8]">Initiatives</span>
      <span class="lu-num font-semibold text-[#f1f5f9]">
        {done}<span class="font-normal text-[#94a3b8]">
          / {initiatives.length}</span
        >
      </span>
    </div>
    <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#17213a]">
      <div
        class="lu-fill h-full rounded-full bg-[#6366f1]"
        style="width:{pct}%"
        use:arrive
      ></div>
    </div>
  </div>

  <!-- Next step (wide screens only) -->
  <p class="hidden min-w-0 truncate text-[13px] text-[#94a3b8] lg:block">
    {startup.consultationText ?? 'No consultation pending'}
  </p>

  <ChevronRight
    class="hidden h-4 w-4 text-[#54648a] transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-[#818cf8] sm:block"
  />
</a>
