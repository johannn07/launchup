<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import Badge from '../ui/badge/badge.svelte';
  let {
    startup,
    role,
    initiatives
  }: { startup: any; role: any; initiatives: any[] } = $props();

  const statusMap: Record<
    number,
    {
      label: 'Pending' | 'Waitlisted' | 'Qualified' | 'Completed';
      badgeVariant: 'pending' | 'waitlisted' | 'qualified' | 'completed';
      border: string;
      text: string;
      bg: string;
    }
  > = {
    1: {
      label: 'Pending',
      badgeVariant: 'pending',
      border: 'border-yellow-400',
      text: 'text-yellow-400',
      bg: 'bg-yellow-900'
    },
    2: {
      label: 'Waitlisted',
      badgeVariant: 'waitlisted',
      border: 'border-purple-400',
      text: 'text-purple-400',
      bg: 'bg-purple-900'
    },
    3: {
      label: 'Qualified',
      badgeVariant: 'qualified',
      border: 'border-blue-500',
      text: 'text-blue-500',
      bg: 'bg-slate-900'
    },
    4: {
      label: 'Completed',
      badgeVariant: 'completed',
      border: 'border-green-500',
      text: 'text-green-500',
      bg: 'bg-green-900'
    }
    // 5: {
    //   label: 'Rejected',
    //   border: 'border-red-400',
    //   text: 'text-red-400',
    //   bg: 'bg-red-900'
    // },
    // 6: {
    //   label: 'Paused',
    //   border: 'border-gray-400',
    //   text: 'text-gray-400',
    //   bg: 'bg-gray-900'
    // }
  };
  const status = $derived(
    statusMap[startup?.qualificationStatus] ?? statusMap[1]
  );

  const getTierLabel = (startupData: any) => {
    if (startupData?.qualificationStatus !== QualificationStatus.QUALIFIED) {
      return 'Pending';
    }
    if (startupData?.readinessEvaluations && startupData.readinessEvaluations.length > 0) {
      return startupData.readinessEvaluations[startupData.readinessEvaluations.length - 1].tierLabel;
    }
    return 'Pending';
  };

  const tier = $derived(getTierLabel(startup));

  const isAssessable = $derived(
    startup?.qualificationStatus === QualificationStatus.QUALIFIED ||
      startup?.qualificationStatus === QualificationStatus.COMPLETED
  );

  const getTierColor = (t: string) => {
    if (t === 'Gold') return 'bg-amber-400/10 text-amber-500 border-amber-400/20';
    if (t === 'Silver') return 'bg-slate-400/10 text-slate-500 border-slate-400/20';
    if (t === 'Bronze') return 'bg-orange-600/10 text-orange-600 border-orange-600/20';
    if (t === 'Strong') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (t === 'Developing') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    if (t === 'Early') return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  };

  const initials = $derived(
    startup.name
      .split(' ')
      .map((word: any) => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 3)
  );

  const truncatedName = $derived(
    startup.name.length > 14 ? startup.name.slice(0, 14) + '...' : startup.name
  );

  const completedCount = $derived(
    initiatives.filter((initiative) => initiative.status === 4).length
  );

  const progressPct = $derived(
    initiatives.length > 0 ? (completedCount / initiatives.length) * 100 : 0
  );
</script>

<a
  href={`/startups/${startup.id}/${isAssessable ? 'assessment' : 'overview/general'}`}
  class="block"
  onclick={(e) => {
    // Founders reapply from here; everyone else reviews the overview.
    if (
      role === 'Startup' &&
      startup?.qualificationStatus === QualificationStatus.WAITLISTED
    ) {
      e.preventDefault();
      const event = new CustomEvent('openApplication', { detail: { startup } });
      window.dispatchEvent(event);
    }
  }}
>
  <Card.Root
    variant="glass"
    class="cursor-pointer p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
  >
    <Card.Content class="h-full">
      <div class="flex flex-col items-center p-6 text-center">
        <div
          class="bg-primary text-primary-foreground flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-base font-bold"
        >
          {initials}
        </div>

        <span class="mt-2.5 max-w-[160px] truncate text-[15px] font-semibold" title={startup.name}>
          {truncatedName}
        </span>

        <div class="mt-2 flex flex-wrap justify-center gap-1.5">
          <Badge variant={status.badgeVariant} class="rounded px-2 py-0.5 text-xs font-semibold">
            {status.label === 'Qualified' && role === 'Mentor' ? 'Active' : status.label}
          </Badge>
          <div class={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${getTierColor(tier)}`}>
            {tier}
          </div>
        </div>

        <div class="mt-6 w-full text-left">
          <div class="mb-1.5 flex items-center justify-between text-xs">
            <span>Initiatives</span>
            <span class="font-bold">{completedCount} / {initiatives.length}</span>
          </div>
          <div class="bg-accent h-2 w-full rounded">
            <div class="bg-primary h-2 rounded" style="width: {progressPct}%"></div>
          </div>
        </div>

        <div class="mt-3.5 flex items-center justify-center gap-2 text-xs">
          <img src="/checked.png" alt="Checked" class="h-4 w-4" />
          <span>{startup.consultationText ?? 'No consultation pending'}</span>
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</a>