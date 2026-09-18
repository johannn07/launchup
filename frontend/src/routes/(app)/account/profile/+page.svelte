<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let editing = $state(false);
  let profileSubmitting = $state(false);
  let passwordSubmitting = $state(false);
  let showCurrent = $state(false);
  let showNew = $state(false);
  let passwordForm = $state<HTMLFormElement | null>(null);

  const user = $derived(data.user);
  const fullName = $derived(
    [user.firstName, user.lastName].filter(Boolean).join(' ')
  );
  const initials = $derived(
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((n) => n!.charAt(0).toUpperCase())
      .join('')
  );

  const statLabel = $derived(
    user.role === 'Startup'
      ? 'Applications'
      : user.role === 'Mentor'
        ? 'Startups mentored'
        : 'Startups in programme'
  );

  // The one warm touch on the most personal page: greet by the reader's own
  // clock. Computed after mount so SSR (server clock) and hydration agree;
  // until then it reads "Hello", on the same line, so nothing shifts.
  let greeting = $state('Hello');
  $effect(() => {
    const h = new Date().getHours();
    greeting =
      h < 5
        ? 'Working late'
        : h < 12
          ? 'Good morning'
          : h < 18
            ? 'Good afternoon'
            : 'Good evening';
  });
</script>

<svelte:head>
  <title>Profile — LaunchUp</title>
</svelte:head>

<div class="space-y-6">
  <!-- ============ Header moment ============ -->
  <section
    class="flex flex-wrap items-center gap-x-6 gap-y-5 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220] p-6"
    aria-label="Your account"
  >
    <!-- Circle for a person; startups use a rounded square -->
    <span
      class="lu-d flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#4f46e5]/50 bg-[#4f46e5]/20 text-[22px] text-white"
      aria-hidden="true"
    >
      {initials}
    </span>

    <div class="min-w-0 flex-1">
      <p class="text-[13.5px] text-[#94a3b8]">{greeting}, {user.firstName}</p>
      <p class="lu-d-xw mt-0.5 truncate text-[24px] leading-tight text-white">
        {fullName}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          class="rounded-full border border-[#1f2c47] bg-[#07111f] px-2.5 py-0.5 text-[12.5px] font-medium text-[#c7d2fe]"
        >
          {user.role}
        </span>
        <span class="truncate text-[13.5px] text-[#94a3b8]">{user.email}</span>
      </div>
    </div>

    {#if data.startupCount !== null}
      <div class="border-[#17213a] sm:border-l sm:pl-6">
        <p class="text-[12.5px] text-[#94a3b8]">{statLabel}</p>
        <p class="lu-d-xw lu-num mt-1 text-[28px] leading-none text-white">
          {data.startupCount}
        </p>
      </div>
    {/if}
  </section>

  <!-- ============ Personal details ============ -->
  <!-- Read-only by default. Editing is a distinct mode: indigo edge, inputs,
       and an explicit Save/Cancel, so it's never ambiguous what will change. -->
  <section
    class="rounded-[1.25rem] border bg-[#0b1220] transition-colors {editing
      ? 'border-[#4f46e5]/60'
      : 'border-[#1f2c47]'}"
    aria-labelledby="details-heading"
  >
    <div
      class="flex flex-wrap items-start justify-between gap-4 border-b border-[#17213a] px-6 py-5"
    >
      <div>
        <h2 id="details-heading" class="lu-d-md text-[17px] text-white">
          Personal details
        </h2>
        <p class="mt-1 text-[13.5px] text-[#94a3b8]">
          {editing
            ? 'Editing. Your name and email update everywhere once saved.'
            : 'How you appear to mentors and programme managers.'}
        </p>
      </div>
      {#if !editing}
        <button
          type="button"
          class="lu-btn lu-btn-secondary lu-btn-sm"
          onclick={() => (editing = true)}
        >
          Edit details
        </button>
      {/if}
    </div>

    {#if form?.success}
      <p
        class="mx-6 mt-5 flex items-start gap-2.5 rounded-[12px] border border-[#34d399]/30 bg-[#34d399]/10 px-3.5 py-3 text-[14px] text-[#34d399]"
        role="status"
      >
        <CheckCircle2 class="mt-0.5 h-4 w-4 flex-none" />
        <span>Details saved.</span>
      </p>
    {:else if form?.error}
      <p class="lu-alert mx-6 mt-5" role="alert">
        <AlertCircle class="mt-0.5 h-4 w-4 flex-none" />
        <span>{form.error}</span>
      </p>
    {/if}

    {#if !editing}
      <dl class="divide-y divide-[#17213a] px-6">
        <div class="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
          <dt class="text-[13.5px] text-[#94a3b8]">Name</dt>
          <dd class="text-[15px] text-white">{fullName}</dd>
        </div>
        <div class="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
          <dt class="text-[13.5px] text-[#94a3b8]">Email</dt>
          <dd class="break-all text-[15px] text-white">{user.email}</dd>
        </div>
        <div class="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
          <dt class="text-[13.5px] text-[#94a3b8]">Role</dt>
          <dd class="text-[15px] text-white">
            {user.role}
            <span class="ml-2 text-[13px] text-[#94a3b8]"
              >Set by your programme</span
            >
          </dd>
        </div>
      </dl>
    {:else}
      <form
        method="POST"
        action="?/updateProfile"
        use:enhance={() => {
          profileSubmitting = true;
          return async ({ update, result }) => {
            await update();
            profileSubmitting = false;
            if (result.type === 'success') {
              editing = false;
              await invalidateAll();
            }
          };
        }}
      >
        <div class="grid gap-5 px-6 py-6 sm:grid-cols-2">
          <div>
            <label class="lu-field" for="firstName">First name</label>
            <input
              class="lu-input"
              name="firstName"
              id="firstName"
              type="text"
              autocomplete="given-name"
              required
              value={user.firstName}
            />
          </div>
          <div>
            <label class="lu-field" for="lastName">Last name</label>
            <input
              class="lu-input"
              name="lastName"
              id="lastName"
              type="text"
              autocomplete="family-name"
              required
              value={user.lastName}
            />
          </div>
          <div class="sm:col-span-2">
            <label class="lu-field" for="email">Email</label>
            <input
              class="lu-input"
              name="email"
              id="email"
              type="email"
              autocomplete="email"
              required
              value={user.email}
            />
          </div>
        </div>

        <div class="flex justify-end gap-3 border-t border-[#17213a] px-6 py-4">
          <button
            type="button"
            class="lu-btn lu-btn-secondary lu-btn-sm"
            onclick={() => (editing = false)}
            disabled={profileSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="lu-btn lu-btn-primary lu-btn-sm"
            disabled={profileSubmitting}
          >
            {profileSubmitting ? 'Saving' : 'Save details'}
          </button>
        </div>
      </form>
    {/if}
  </section>

  <!-- ============ Sign-in & security ============ -->
  <!-- #security is the target of the old /account/password route. The scroll
       margin clears the fixed 64px app header. -->
  <section
    id="security"
    class="scroll-mt-24 rounded-[1.25rem] border border-[#1f2c47] bg-[#0b1220]"
    aria-labelledby="security-heading"
  >
    <div class="border-b border-[#17213a] px-6 py-5">
      <h2 id="security-heading" class="lu-d-md text-[17px] text-white">
        Sign-in &amp; security
      </h2>
      <p class="mt-1 text-[13.5px] text-[#94a3b8]">
        Change the password you use to sign in. You stay signed in on this
        device.
      </p>
    </div>

    <form
      method="POST"
      action="?/changePassword"
      bind:this={passwordForm}
      use:enhance={() => {
        passwordSubmitting = true;
        return async ({ update, result }) => {
          await update();
          passwordSubmitting = false;
          if (result.type === 'success') passwordForm?.reset();
        };
      }}
    >
      <div class="grid gap-5 px-6 py-6 sm:grid-cols-2">
        {#if form?.passwordSuccess}
          <p
            class="flex items-start gap-2.5 rounded-[12px] border border-[#34d399]/30 bg-[#34d399]/10 px-3.5 py-3 text-[14px] text-[#34d399] sm:col-span-2"
            role="status"
          >
            <CheckCircle2 class="mt-0.5 h-4 w-4 flex-none" />
            <span>Password changed.</span>
          </p>
        {:else if form?.passwordError}
          <p class="lu-alert sm:col-span-2" role="alert">
            <AlertCircle class="mt-0.5 h-4 w-4 flex-none" />
            <span>{form.passwordError}</span>
          </p>
        {/if}

        <div>
          <label class="lu-field" for="oldPassword">Current password</label>
          <div class="relative">
            <input
              class="lu-input lu-input-pw"
              name="oldPassword"
              id="oldPassword"
              type={showCurrent ? 'text' : 'password'}
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              onclick={() => (showCurrent = !showCurrent)}
              class="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#94a3b8] transition-colors hover:text-[#f1f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {#if showCurrent}<EyeOff class="h-4 w-4" />{:else}<Eye
                  class="h-4 w-4"
                />{/if}
            </button>
          </div>
        </div>

        <div>
          <label class="lu-field" for="newPassword">New password</label>
          <div class="relative">
            <input
              class="lu-input lu-input-pw"
              name="newPassword"
              id="newPassword"
              type={showNew ? 'text' : 'password'}
              autocomplete="new-password"
              minlength="6"
              required
            />
            <button
              type="button"
              onclick={() => (showNew = !showNew)}
              class="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#94a3b8] transition-colors hover:text-[#f1f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {#if showNew}<EyeOff class="h-4 w-4" />{:else}<Eye
                  class="h-4 w-4"
                />{/if}
            </button>
          </div>
          <p class="lu-hint">At least 6 characters.</p>
        </div>
      </div>

      <div class="flex justify-end border-t border-[#17213a] px-6 py-4">
        <button
          type="submit"
          class="lu-btn lu-btn-primary lu-btn-sm"
          disabled={passwordSubmitting}
        >
          {passwordSubmitting ? 'Changing' : 'Change password'}
        </button>
      </div>
    </form>
  </section>
</div>
