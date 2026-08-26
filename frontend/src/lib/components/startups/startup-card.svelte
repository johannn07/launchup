<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { QualificationStatus } from '$lib/enums/qualification-status.enum';
  import { getBadgeColor } from '$lib/utils';
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
      border: string;
      text: string;
      bg: string;
    }
  > = {
    1: {
      label: 'Pending',
      border: 'border-yellow-400',
      text: 'text-yellow-400',
      bg: 'bg-yellow-900'
    },
    2: {
      label: 'Waitlisted',
      border: 'border-purple-400',
      text: 'text-purple-400',
      bg: 'bg-purple-900'
    },
    3: {
      label: 'Qualified',
      border: 'border-blue-500',
      text: 'text-blue-500',
      bg: 'bg-slate-900'
    },
    4: {
      label: 'Completed',
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
  href={`/startups/${startup.id}/${startup?.qualificationStatus === QualificationStatus.QUALIFIED ? 'assessment' : 'pending'}`}
  class="block"
  onclick={(e) => {
    if (startup?.qualificationStatus === QualificationStatus.WAITLISTED) {
      e.preventDefault();
      const event = new CustomEvent('openApplication', { detail: { startup } });
      window.dispatchEvent(event);
    }
  }}
>
  <Card.Root
    class="cursor-pointer rounded-[1.5rem] border border-white/40 bg-white/60 p-0 shadow-[0_4px_24px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.7)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50 dark:shadow-[0_4px_24px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
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
          <Badge class={`rounded px-2 py-0.5 text-xs font-semibold ${getBadgeColor(status.label)}`}>
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