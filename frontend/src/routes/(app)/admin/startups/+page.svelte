<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import { Plus, Edit2, Trash2, Rocket, Loader2, User } from 'lucide-svelte';
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

  let { data } = $props<{ data: { startups: Array<any>; users: Array<any>; access: string } }>();
  let startups = $state(data.startups);
  let users = data.users;
  let toDelete: any = $state(null);
  let toEdit: any = $state(null);
  let deleteOpen = $state(false);
  let editOpen = $state(false);
  let createOpen = $state(false);
  let deleting = $state(false);
  let saving = $state(false);
  let creating = $state(false);
  let error: string | null = $state(null);
  let createError: string | null = $state(null);

  let editForm = $state({
    name: '',
    userId: '',
    groupName: '',
    universityName: '',
    links: '',
    dataPrivacy: false,
    eligibility: false
  });

  let createForm = $state({
    name: '',
    userId: '',
    groupName: '',
    universityName: '',
    links: '',
    dataPrivacy: false,
    eligibility: false,
    qualificationStatus: 'PENDING'
  });

  function openCreateModal() {
    createForm = {
      name: '',
      userId: '',
      groupName: '',
      universityName: '',
      links: '',
      dataPrivacy: false,
      eligibility: false,
      qualificationStatus: 'PENDING'
    };
    createError = null;
    createOpen = true;
  }

  async function createStartup() {
    creating = true;
    createError = null;

    try {
      const payload: any = { ...createForm };
      if (payload.userId) payload.userId = Number(payload.userId);

      const res = await fetch(`${PUBLIC_API_URL}/admin/startups/create-json`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${data.access}` 
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          createError = json.message || text || 'Failed to create startup';
        } catch {
          createError = text || 'Failed to create startup';
        }
        creating = false;
        return;
      }

      const result = await res.json();
      if (result.startup) {
        startups = [...startups, result.startup];
      }
      
      createOpen = false;
    } catch (e) {
      createError = 'Failed to create startup';
    } finally {
      creating = false;
    }
  }

  function openEditModal(startup: any) {
    toEdit = startup;
    editForm = {
      name: startup.name ?? '',
      userId: String(startup.user?.id ?? ''),
      groupName: startup.groupName ?? '',
      universityName: startup.universityName ?? '',
      links: startup.links ?? '',
      dataPrivacy: Boolean(startup.dataPrivacy),
      eligibility: Boolean(startup.eligibility)
    };
    error = null;
    editOpen = true;
  }

  async function saveStartup() {
    if (!toEdit) return;
    saving = true;
    error = null;

    try {
      const payload: any = { ...editForm };
      if (payload.userId) payload.userId = Number(payload.userId);

      const res = await fetch(
        `${PUBLIC_API_URL}/admin/startups/edit-json/${toEdit.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.access}`
          },
          body: JSON.stringify(payload)
        }
      );

      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          error = json.message || text || 'Failed to update startup';
        } catch {
          error = text || 'Failed to update startup';
        }
        saving = false;
        return;
      }

      const updated = await res.json();
      startups = startups.map((s: any) =>
        s.id === toEdit.id ? { ...s, ...updated.startup } : s
      );

      editOpen = false;
      toEdit = null;
    } catch (e) {
      error = 'Failed to update startup';
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-8 max-w-7xl mx-auto pb-12">
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
        <Rocket class="h-8 w-8 text-primary opacity-80" />
        Manage Startups
      </h1>
      <p class="mt-2 text-muted-foreground">
        Oversee startup applications, data, and assigned owners.
      </p>
    </div>
    <Button onclick={openCreateModal} class="gap-2 shadow-sm transition-all hover:-translate-y-0.5">
      <Plus class="h-4 w-4" />
      Create Startup
    </Button>
  </div>

  <div class="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
    <div class="bg-muted/40 flex items-center justify-between border-b border-border/50 px-6 py-4">
      <h2 class="font-semibold text-foreground flex items-center gap-2">
        <Rocket class="h-4 w-4 text-muted-foreground" />
        All Startups
      </h2>
      {#if startups && startups.length}
        <span class="text-xs font-medium text-muted-foreground bg-background/50 px-2.5 py-1 rounded-full border border-border/30">
          {startups.length} {startups.length === 1 ? 'startup' : 'startups'}
        </span>
      {/if}
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-muted/40 border-b border-border/50">
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">ID</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Name</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Owner</th>
            <th class="px-6 py-4 text-right font-semibold text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if startups.length === 0}
            <tr>
              <td colspan="4" class="px-6 py-16 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center space-y-4">
                  <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Rocket class="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p class="text-lg font-medium">No startups found</p>
                  <p class="text-sm opacity-80">Create a startup to get started.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each startups as s}
              <tr class="hover:bg-muted/30 group border-b border-border/50 transition-colors last:border-0">
                <td class="px-6 py-5 font-mono text-xs text-muted-foreground/70">#{s.id}</td>
                <td class="px-6 py-5">
                  <div class="flex items-center gap-3">
                    <div class="rounded-lg bg-primary/10 p-2 border border-primary/20">
                      <Rocket class="h-4 w-4 text-primary" />
                    </div>
                    <span class="font-semibold text-foreground text-base">{s.name}</span>
                  </div>
                </td>
                <td class="px-6 py-5">
                  {#if s.user?.email}
                    <div class="flex items-center gap-2">
                      <div class="rounded-full bg-muted/50 border border-border/50 p-1.5">
                        <User class="h-3 w-3 text-muted-foreground" />
                      </div>
                      <span class="text-muted-foreground font-medium">{s.user.email}</span>
                    </div>
                  {:else}
                    <span class="italic text-muted-foreground/60 text-xs">No owner</span>
                  {/if}
                </td>
                <td class="px-6 py-5 text-right">
                  <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="sm"
                      onclick={() => openEditModal(s)}
                      class="h-8 bg-secondary/60 hover:bg-secondary text-xs"
                    >
                      <Edit2 class="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-8 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs shadow-none border border-destructive/20"
                      onclick={() => { toDelete = s; deleteOpen = true; }}
                    >
                      <Trash2 class="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Create Startup Modal -->
<Dialog.Root bind:open={createOpen} onOpenChange={(open) => { if (!open && creating) return; createOpen = open; }}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Create New Startup</Dialog.Title>
      <Dialog.Description class="pt-2">
        Add a new startup to the system
      </Dialog.Description>
    </Dialog.Header>

    {#if createError}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
        {createError}
      </div>
    {/if}

    <div class="space-y-4 pt-4">
      <div class="grid gap-2">
        <Label for="create-name">Name *</Label>
        <Input id="create-name" required bind:value={createForm.name} />
      </div>

      <div class="grid gap-2">
        <Label for="create-owner">Owner</Label>
        <Select.Root type="single" bind:value={createForm.userId}>
          <Select.Trigger id="create-owner">
            {createForm.userId ? users.find((u: any) => String(u.id) === createForm.userId)?.email || 'Select owner' : 'Select owner'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="">No owner</Select.Item>
            {#each users as u}
              <Select.Item value={String(u.id)}>{u.email}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="create-group">Group Name</Label>
          <Input id="create-group" bind:value={createForm.groupName} />
        </div>
        <div class="grid gap-2">
          <Label for="create-university">University</Label>
          <Input id="create-university" bind:value={createForm.universityName} />
        </div>
      </div>

      <div class="grid gap-2">
        <Label for="create-links">Links</Label>
        <Input id="create-links" bind:value={createForm.links} />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={createForm.dataPrivacy} />
          Data Privacy
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={createForm.eligibility} />
          Eligibility
        </label>
      </div>
    </div>

    <Dialog.Footer class="mt-6">
      <Button
        type="button"
        variant="outline"
        disabled={creating}
        onclick={() => {
          createOpen = false;
          createError = null;
        }}
      >
        Cancel
      </Button>
      <Button
        onclick={createStartup}
        disabled={creating || !createForm.name}
        class="gap-2"
      >
        {#if creating}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        Create Startup
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Edit Startup Modal -->
<Dialog.Root bind:open={editOpen} onOpenChange={(open) => { if (!open && saving) return; editOpen = open; }}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Edit Startup</Dialog.Title>
      <Dialog.Description class="pt-2">
        Update startup information for <span class="text-foreground font-semibold">{toEdit?.name}</span>
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
        {error}
      </div>
    {/if}

    <div class="space-y-4 pt-4">
      <div class="grid gap-2">
        <Label for="edit-name">Name</Label>
        <Input id="edit-name" bind:value={editForm.name} />
      </div>

      <div class="grid gap-2">
        <Label for="edit-owner">Owner</Label>
        <Select.Root type="single" bind:value={editForm.userId}>
          <Select.Trigger id="edit-owner">
            {editForm.userId ? users.find((u: any) => String(u.id) === editForm.userId)?.email || 'Select owner' : 'Select owner'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="">No owner</Select.Item>
            {#each users as u}
              <Select.Item value={String(u.id)}>{u.email}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="edit-group">Group Name</Label>
          <Input id="edit-group" bind:value={editForm.groupName} />
        </div>
        <div class="grid gap-2">
          <Label for="edit-university">University</Label>
          <Input id="edit-university" bind:value={editForm.universityName} />
        </div>
      </div>

      <div class="grid gap-2">
        <Label for="edit-links">Links</Label>
        <Input id="edit-links" bind:value={editForm.links} />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={editForm.dataPrivacy} />
          Data Privacy
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={editForm.eligibility} />
          Eligibility
        </label>
      </div>
    </div>

    <Dialog.Footer class="mt-6">
      <Button
        type="button"
        variant="outline"
        disabled={saving}
        onclick={() => {
          editOpen = false;
          toEdit = null;
          error = null;
        }}
      >
        Cancel
      </Button>
      <Button onclick={saveStartup} disabled={saving} class="gap-2">
        {#if saving}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        Save Changes
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete Startup Modal -->
<Dialog.Root bind:open={deleteOpen} onOpenChange={(open) => { if (!open && deleting) return; deleteOpen = open; }}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Delete Startup</Dialog.Title>
      <Dialog.Description class="pt-2">
        Are you sure you want to delete <span class="font-semibold text-foreground">{toDelete?.name}</span>? This action cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    <form method="post" action="?/delete" onsubmit={() => (deleting = true)}>
      <input type="hidden" name="id" value={toDelete?.id} />
      <div class="flex justify-end gap-3 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          disabled={deleting} 
          onclick={() => { if (!deleting) { toDelete = null; deleteOpen = false; } }}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          variant="destructive" 
          disabled={deleting}
          class="gap-2"
        >
          {#if deleting}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Trash2 class="h-4 w-4" />
          {/if}
          Delete Startup
        </Button>
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>
