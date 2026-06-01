<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import { Plus, Edit2, Trash2, Users, Loader2 } from 'lucide-svelte';
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

  let { data } = $props<{ data: { users: Array<any>; access: string } }>();
  let users = $state(data.users);
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
    email: '',
    firstName: '',
    lastName: '',
    role: 'Startup'
  });

  let createForm = $state({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'Startup'
  });

  function openCreateModal() {
    createForm = {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      role: 'Startup'
    };
    createError = null;
    createOpen = true;
  }

  async function createUser() {
    creating = true;
    createError = null;

    try {
      const res = await fetch(`${PUBLIC_API_URL}/admin/users/create-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.access}`
        },
        body: JSON.stringify(createForm)
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          createError = json.message || text || 'Failed to create user';
        } catch {
          createError = text || 'Failed to create user';
        }
        creating = false;
        return;
      }

      // Add new user to local list
      const result = await res.json();
      if (result.user) {
        users = [...users, result.user];
      }

      createOpen = false;
    } catch (e) {
      createError = 'Failed to create user';
    } finally {
      creating = false;
    }
  }

  function openEditModal(user: any) {
    toEdit = user;
    editForm = {
      email: user.email ?? '',
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      role: user.role ?? 'Startup'
    };
    error = null;
    editOpen = true;
  }

  async function saveUser() {
    if (!toEdit) return;
    saving = true;
    error = null;

    try {
      const res = await fetch(
        `${PUBLIC_API_URL}/admin/users/edit-json/${toEdit.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.access}`
          },
          body: JSON.stringify(editForm)
        }
      );

      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          error = json.message || text || 'Failed to update user';
        } catch {
          error = text || 'Failed to update user';
        }
        saving = false;
        return;
      }

      // Update local users list
      const updated = await res.json();
      users = users.map((u: any) =>
        u.id === toEdit.id ? { ...u, ...editForm } : u
      );

      editOpen = false;
      toEdit = null;
    } catch (e) {
      error = 'Failed to update user';
    } finally {
      saving = false;
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'default';
      case 'Manager':
        return 'secondary';
      case 'Mentor':
        return 'outline';
      case 'Startup':
        return 'outline';
      default:
        return 'outline';
    }
  };
</script>

<div class="space-y-8 max-w-7xl mx-auto pb-12">
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
        <Users class="h-8 w-8 text-primary opacity-80" />
        Manage Users
      </h1>
      <p class="mt-2 text-muted-foreground">
        Administer user accounts, permissions, and roles across the platform.
      </p>
    </div>
    <Button onclick={openCreateModal} class="gap-2 shadow-sm transition-all hover:-translate-y-0.5">
      <Plus class="h-4 w-4" />
      Create User
    </Button>
  </div>

  <div class="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
    <div
      class="bg-muted/40 flex items-center justify-between border-b border-border/50 px-6 py-4"
    >
      <h2 class="font-semibold text-foreground flex items-center gap-2">
        <Users class="h-4 w-4 text-muted-foreground" />
        All Users
      </h2>
      {#if users.length}
        <span class="text-xs font-medium text-muted-foreground bg-background/50 px-2.5 py-1 rounded-full border border-border/30"
          >{users.length} {users.length === 1 ? 'user' : 'users'}</span
        >
      {/if}
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-muted/40 border-b border-border/50">
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">ID</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Name</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Email</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Role</th>
            <th class="px-6 py-4 text-right font-semibold text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if users.length === 0}
            <tr>
              <td colspan="5" class="px-6 py-16 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center space-y-4">
                  <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Users class="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p class="text-lg font-medium">No users found</p>
                  <p class="text-sm opacity-80">Create a user to get started.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each users as u}
              <tr class="hover:bg-muted/30 group border-b border-border/50 transition-colors last:border-0">
                <td class="px-6 py-5 font-mono text-xs text-muted-foreground/70"
                  >#{u.id}</td
                >
                <td class="px-6 py-5">
                  <span class="font-medium text-foreground">
                    {(u.firstName ?? '') + ' ' + (u.lastName ?? '')}
                  </span>
                </td>
                <td class="px-6 py-5 text-muted-foreground">{u.email}</td>
                <td class="px-6 py-5">
                  <Badge variant={getRoleBadgeVariant(u.role)} class="shadow-none">
                    {u.role}
                  </Badge>
                </td>
                <td class="px-6 py-5 text-right">
                  <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="sm"
                      onclick={() => openEditModal(u)}
                      class="h-8 bg-secondary/60 hover:bg-secondary text-xs"
                    >
                      <Edit2 class="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-8 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs shadow-none border border-destructive/20"
                      onclick={() => {
                        toDelete = u;
                        deleteOpen = true;
                      }}
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

<!-- Create User Modal -->
<Dialog.Root
  bind:open={createOpen}
  onOpenChange={(open) => {
    if (!open && creating) return;
    createOpen = open;
  }}
>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Create New User</Dialog.Title>
      <Dialog.Description class="pt-2">
        Add a new user to the system
      </Dialog.Description>
    </Dialog.Header>

    {#if createError}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
        {createError}
      </div>
    {/if}

    <div class="space-y-4 pt-4">
      <div class="grid gap-2">
        <Label for="create-email">Email *</Label>
        <Input
          id="create-email"
          type="email"
          required
          bind:value={createForm.email}
        />
      </div>

      <div class="grid gap-2">
        <Label for="create-password">Password *</Label>
        <Input
          id="create-password"
          type="password"
          required
          bind:value={createForm.password}
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="create-firstName">First Name</Label>
          <Input id="create-firstName" bind:value={createForm.firstName} />
        </div>
        <div class="grid gap-2">
          <Label for="create-lastName">Last Name</Label>
          <Input id="create-lastName" bind:value={createForm.lastName} />
        </div>
      </div>

      <div class="grid gap-2">
        <Label for="create-role">Role</Label>
        <Select.Root type="single" bind:value={createForm.role}>
          <Select.Trigger id="create-role">
            {createForm.role}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="Startup">Startup</Select.Item>
            <Select.Item value="Mentor">Mentor</Select.Item>
            <Select.Item value="Manager">Manager</Select.Item>
            <Select.Item value="Admin">Admin</Select.Item>
          </Select.Content>
        </Select.Root>
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
        onclick={createUser}
        disabled={creating || !createForm.email || !createForm.password}
        class="gap-2"
      >
        {#if creating}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        Create User
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Edit User Modal -->
<Dialog.Root
  bind:open={editOpen}
  onOpenChange={(open) => {
    if (!open && saving) return;
    editOpen = open;
  }}
>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Edit User</Dialog.Title>
      <Dialog.Description class="pt-2">
        Update user information for <span class="font-semibold text-foreground"
          >{toEdit?.email}</span
        >
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <div class="rounded-md bg-red-50 p-3 text-sm text-red-600">
        {error}
      </div>
    {/if}

    <div class="space-y-4 pt-4">
      <div class="grid gap-2">
        <Label for="edit-email">Email</Label>
        <Input id="edit-email" type="email" bind:value={editForm.email} />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="edit-firstName">First Name</Label>
          <Input id="edit-firstName" bind:value={editForm.firstName} />
        </div>
        <div class="grid gap-2">
          <Label for="edit-lastName">Last Name</Label>
          <Input id="edit-lastName" bind:value={editForm.lastName} />
        </div>
      </div>

      <div class="grid gap-2">
        <Label for="edit-role">Role</Label>
        <Select.Root type="single" bind:value={editForm.role}>
          <Select.Trigger id="edit-role">
            {editForm.role}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="Startup">Startup</Select.Item>
            <Select.Item value="Mentor">Mentor</Select.Item>
            <Select.Item value="Manager">Manager</Select.Item>
            <Select.Item value="Admin">Admin</Select.Item>
          </Select.Content>
        </Select.Root>
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
      <Button onclick={saveUser} disabled={saving} class="gap-2">
        {#if saving}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        Save Changes
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete User Modal -->
<Dialog.Root
  bind:open={deleteOpen}
  onOpenChange={(open) => {
    if (!open && deleting) return;
    deleteOpen = open;
  }}
>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Delete User</Dialog.Title>
      <Dialog.Description class="pt-2">
        Are you sure you want to delete <span
          class="font-semibold text-foreground">{toDelete?.email}</span
        >? This action cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    <form method="post" action="?/delete" onsubmit={() => (deleting = true)}>
      <input type="hidden" name="id" value={toDelete?.id} />
      <div class="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={deleting}
          onclick={() => {
            if (!deleting) {
              toDelete = null;
              deleteOpen = false;
            }
          }}
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
          Delete User
        </Button>
      </div>
    </form>
  </Dialog.Content>
</Dialog.Root>
