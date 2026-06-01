<script lang="ts">
  import { Users, Rocket, ClipboardList, Layers, Scan, Scale, LayoutDashboard, ArrowRight, Activity, Clock } from 'lucide-svelte';
  export let data: {
    recent: Array<{ date: string; action: string; details: string }>;
  };
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
      description: 'Configure threshold & mathematical weights for startup tiers',
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

<div class="space-y-8 max-w-7xl mx-auto pb-12">
  <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
        <LayoutDashboard class="h-8 w-8 text-primary opacity-80" />
        Admin Dashboard
      </h1>
      <p class="mt-2 text-muted-foreground">
        Manage your platform from one centralized command center.
      </p>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
    {#each cards as card}
      <a
        data-sveltekit-preload-data="tap"
        href={card.href}
        class="bg-card/50 backdrop-blur-sm hover:border-primary/40 group relative overflow-hidden rounded-xl border border-border/50 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:bg-card/80"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 space-y-3">
            <div class="flex items-center gap-4">
              <div
                class="bg-background/80 group-hover:bg-primary/10 rounded-xl p-2.5 transition-colors border border-border/30 shadow-sm"
              >
                <svelte:component
                  this={card.icon}
                  class="h-6 w-6 {card.color} transition-transform group-hover:scale-110"
                />
              </div>
              <h3 class="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{card.title}</h3>
            </div>
            <p class="text-muted-foreground text-sm leading-relaxed opacity-80">
              {card.description}
            </p>
          </div>
          <div
            class="text-muted-foreground/0 group-hover:text-primary transition-all group-hover:translate-x-1 mt-3"
          >
            <ArrowRight class="h-5 w-5" />
          </div>
        </div>
        <!-- Decorative glow effect -->
        <div class="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10 group-hover:scale-150"></div>
      </a>
    {/each}
  </div>

  <div class="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
    <div
      class="bg-muted/40 flex items-center justify-between border-b border-border/50 px-6 py-4"
    >
      <h2 class="font-semibold text-foreground flex items-center gap-2">
        <Activity class="h-4 w-4 text-muted-foreground" />
        Recent Activity
      </h2>
      <span class="text-xs font-medium text-muted-foreground bg-background/50 px-2.5 py-1 rounded-full border border-border/30">{recent.length} items</span>
    </div>
    {#if recent.length > 0}
      <div class="divide-y divide-border/50">
        {#each recent as item}
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-5 hover:bg-muted/30 transition-colors">
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
              <div class="text-sm font-medium text-muted-foreground bg-background/50 px-3 py-1.5 rounded-md border border-border/30 max-w-md truncate">
                {item.details}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="px-6 py-16 text-center text-muted-foreground">
        <div class="flex flex-col items-center justify-center space-y-4">
          <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
            <Activity class="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p class="text-lg font-medium">No recent activity</p>
        </div>
      </div>
    {/if}
  </div>
</div>
