<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { Calendar, Users, Clock, Eye } from 'lucide-svelte';
  import Badge from '../ui/badge/badge.svelte';
  import { getStartupMemberCount } from '$lib/utils';

  export let startup: any;
  export let selectedTab: string;
  export let onOpenStartupDialog: (startup: any) => void;

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  const memberCount = getStartupMemberCount(startup);

  const badgeVariant = $derived((() => {
    if (selectedTab === 'pending') return 'pending';
    if (selectedTab === 'waitlisted') return 'waitlisted';
    if (selectedTab === 'qualified') return 'qualified';
    if (selectedTab === 'completed') return 'completed';
    return 'secondary';
  })());
</script>

<Card.Root
  variant="glass"
  class="cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
  onclick={() => onOpenStartupDialog(startup)}
>
  <Card.Content class="p-6">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <!-- Company Name -->
        <h3 class="mb-2 text-lg font-semibold text-foreground">
          {startup.capsuleProposal?.title || startup.name}
        </h3>

        <!-- Metadata -->
        <div class="mb-3 flex items-center gap-4 text-sm text-muted-foreground">
          <div class="flex items-center gap-1">
            <Calendar class="h-4 w-4" />
            <span
              >{formatDate(
                startup.createdAt ||
                  startup.dateCreated ||
                  new Date().toISOString()
              )}</span
            >
          </div>
          <div class="flex items-center gap-1">
            <Users class="h-4 w-4" />
            <span>{memberCount} member{memberCount > 1 ? 's' : ''}</span>
          </div>
        </div>

        <!-- Description -->
        <p class="text-sm leading-relaxed text-muted-foreground">
          {startup.capsuleProposal?.description ||
            startup.description ||
            startup.businessDescription ||
            'No description available'}
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="ml-4 flex items-center gap-2">
        <Badge variant={badgeVariant}>
          <Clock size={12} class="mr-1" />
          {selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)}
        </Badge>
        <Button
          variant="outline"
          class="h-auto px-4 py-2 text-sm text-muted-foreground"
          onclick={(e) => onOpenStartupDialog(startup)}
        >
          <Eye class="mr-1 h-3 w-3" />
          View Details
        </Button>
      </div>
    </div>
  </Card.Content>
</Card.Root>

