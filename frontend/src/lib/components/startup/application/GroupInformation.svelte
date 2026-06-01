<script lang="ts">
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';
  export let stepName: string;
  export let currentStep: string;
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Plus, X, Search } from 'lucide-svelte';

  export let access: string;
  export let startup: any = null;

  let members: any = [];
  let search: string;
  let searchedUsers: any[] = [];
  let formData = {
    groupName: startup?.groupName ?? '',
    universityName: startup?.universityName ?? ''
  };

  async function searchUsers() {
    const response = await fetch(`${PUBLIC_API_URL}/users/?search=${search}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${access}`
      }
    });
    const d = await response.json();

    if (response.ok) {
      const membersSet = new Set(members.map((member: any) => member.id));
      searchedUsers = d.results.filter((user: any) => !membersSet.has(user.id));
    }
  }

  function addMember(member: any) {
    members = [...members, member];
    searchedUsers = searchedUsers.filter((d) => d.email != member.email);
  }

  function removeMember(member: any) {
    members = members.filter((d: any) => d != member);
    searchedUsers = [...searchedUsers, member];
  }
</script>

<div class="flex-1 overflow-auto px-1" class:hidden={currentStep !== stepName}>
  <div class="flex flex-col gap-5">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-2">
        <Label for="group_name" class="text-sm font-semibold text-slate-700 dark:text-white/70">Group / Incubation group name <span class="text-red-500">*</span></Label>
        <Input
          name="group_name"
          id="group_name"
          type="text"
          placeholder="e.g. Green Techs V2"
          required
          bind:value={formData.groupName}
          class="h-11 rounded-xl border-slate-200/70 bg-white/70 backdrop-blur focus-visible:ring-2 focus-visible:ring-[#6366f1] dark:border-white/10 dark:bg-white/5"
        />
      </div>
      <div class="grid gap-2">
        <Label for="university_name" class="text-sm font-semibold text-slate-700 dark:text-white/70">University / Institution <span class="text-red-500">*</span></Label>
        <Input
          name="university_name"
          id="university_name"
          type="text"
          placeholder="e.g. CIT-U"
          required
          bind:value={formData.universityName}
          class="h-11 rounded-xl border-slate-200/70 bg-white/70 backdrop-blur focus-visible:ring-2 focus-visible:ring-[#6366f1] dark:border-white/10 dark:bg-white/5"
        />
      </div>
    </div>

    <!-- Members list -->
    <div class="grid gap-2">
      <Label class="text-sm font-semibold text-slate-700 dark:text-white/70">Team Members</Label>
      {#each members as user, i}
        <input type="hidden" name={`member_${i + 2}`} value={user.id} />
        <div class="flex items-center justify-between rounded-xl border border-slate-200/50 bg-white/40 p-3 backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#6366f1]/10 text-xs font-bold text-[#6366f1]">
              {user.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <span class="text-sm font-medium text-slate-700 dark:text-white/70">{user.email}</span>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all dark:hover:bg-red-500/10"
            on:click|preventDefault={() => removeMember(user)}
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      {/each}
    </div>

    <!-- Search and invite -->
    <div class="grid gap-2">
      <Label for="email" class="text-sm font-semibold text-slate-700 dark:text-white/70">Invite team members</Label>
      <form on:submit|preventDefault={searchUsers} class="flex gap-2">
        <div class="relative flex-1">
          <Input
            name="email"
            id="email"
            type="text"
            placeholder="Search by email..."
            bind:value={search}
            class="h-11 rounded-xl border-slate-200/70 bg-white/70 pl-10 backdrop-blur focus-visible:ring-2 focus-visible:ring-[#6366f1] dark:border-white/10 dark:bg-white/5"
          />
          <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </form>
    </div>

    {#if searchedUsers.length > 0}
      <div class="flex flex-col gap-2 rounded-xl border border-slate-200/50 bg-white/30 p-2 dark:border-white/5 dark:bg-white/5">
        {#each searchedUsers as user}
          <button
            type="button"
            class="flex items-center justify-between rounded-lg p-2.5 transition-all hover:bg-[#6366f1]/5 dark:hover:bg-[#6366f1]/10"
            on:click|preventDefault={() => addMember(user)}
          >
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-white/10 dark:text-white/50">
                {user.email?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <span class="text-sm text-slate-600 dark:text-white/60">{user.email}</span>
            </div>
            <Plus class="h-4 w-4 text-[#6366f1]" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
