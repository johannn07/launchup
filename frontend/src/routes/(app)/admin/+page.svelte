<script lang="ts">
  import { Users, Rocket, ClipboardList, Layers, Scan, Scale, LayoutDashboard, ArrowRight, Activity, Clock } from 'lucide-svelte';
  import { PageHeader } from '$lib/components/shared';

  let { data } = $props();
  let recent = data.recent;

  const cards = [
    {
      title: 'Manage Users',
      description: 'Create, edit, and manage user accounts',
      href: '/admin/users',
      icon: Users,
      color: 'text-blue-500'
    },
    {
      title: 'Manage Startups',
      description: 'Oversee startup applications and data',
      href: '/admin/startups',
      icon: Rocket,
      color: 'text-purple-500'
    },
    {
      title: 'Assessment Types',
      description: 'Configure assessment fields and types',
      href: '/admin/assessments',
      icon: ClipboardList,
      color: 'text-green-500'
    },
    {
      title: 'Dynamic Tiers',
      description: 'Configure thresholds for startup tiers',
      href: '/admin/tiers',
      icon: Layers,
      color: 'text-amber-500'
    },
    {
      title: 'OCR Documents',
      description: 'Review document legibility & computer vision parses',
      href: '/admin/ocr-documents',
      icon: Scan,
      color: 'text-cyan-500'
    },
    {
      title: 'AI Bias Audits',
      description: 'Review and override AI evaluation bias normalizations',
      href: '/admin/ai/bias-audits',
      icon: Scale,
      color: 'text-rose-500'
    }
  ];
</script>

<div class="space-y-8 pb-12">
  <PageHeader icon={LayoutDashboard} title="Manager Dashboard" description="Manage the platform from one centralized command center." />

  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
    {#each cards as card}
      <a
        data-sveltekit-preload-data="tap"
        href={card.href}
        class="glass-card group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 space-y-3">
            <div class="flex items-center gap-4">
              <div class="rounded-xl border border-border/30 bg-background/80 p-2.5 shadow-sm transition-colors group-hover:bg-primary/10">
                <svelte:component
                  this={card.icon}
                  class="h-6 w-6 transition-transform group-hover:scale-110 {card.color}"
                />
              </div>
              <h3 class="text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">{card.title}</h3>
            </div>
            <p class="text-sm leading-relaxed text-muted-foreground opacity-80">
              {card.description}
            </p>
          </div>
          <div class="mt-3 text-primary/0 transition-all group-hover:translate-x-1 group-hover:text-primary">
            <ArrowRight class="h-5 w-5" />
          </div>
        </div>
        <div class="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover:scale-150 group-hover:bg-primary/10"></div>
      </a>
    {/each}
  </div>

  <div class="glass-card overflow-hidden">
    <div class="glass-subtle flex items-center justify-between border-b border-border/50 px-6 py-4">
      <h2 class="flex items-center gap-2 font-semibold text-foreground">
        <Activity class="h-4 w-4 text-muted-foreground" />
        Recent Activity
      </h2>
      <span class="rounded-full border border-border/30 bg-background/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">{recent.length} items</span>
    </div>
    {#if recent.length > 0}
      <div class="divide-y divide-border/50">
        {#each recent as item}
          <div class="flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
            <div class="space-y-1.5">
              <p class="text-sm font-medium text-foreground">
                {item.action}
              </p>
              <div class="flex items-center gap-1.5 text-xs text-muted-foreground opacity-80">
                <Clock class="h-3 w-3" />
                <span>{new Date(item.date).toLocaleString()}</span>
              </div>
            </div>
            {#if item.details}
              <div class="max-w-md truncate rounded-md border border-border/30 bg-background/50 px-3 py-1.5 text-sm font-medium text-muted-foreground">
                {item.details}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center px-6 py-16 text-center text-muted-foreground">
        <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
          <Activity class="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p class="text-lg font-medium">No recent activity</p>
      </div>
    {/if}
  </div>
</div>
