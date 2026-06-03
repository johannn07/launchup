<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label/index.js';
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';
import { UserRound, Lock, Mail, User, KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let profileSubmitting = $state(false);
  let passwordSubmitting = $state(false);
  let showCurrentPassword = $state(false);
  let showNewPassword = $state(false);
  $effect(() => {
    if (form?.success) toast.success(form.message);
    else if (form?.error) toast.error(form.error);
    if (form?.passwordSuccess) toast.success(form.passwordMessage);
    else if (form?.passwordError) toast.error(form.passwordError);
  });
</script>

<svelte:head>
  <title>Account - Profile</title>
</svelte:head>

<div class="flex flex-col gap-6">

  <!-- Profile Card -->
  <div class="rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden shadow-xl">
    <!-- Card Header -->
    <div class="flex items-center gap-4 border-b border-white/5 bg-white/[0.02] px-6 py-5">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#6366f1]/15 text-[#6366f1]">
        <UserRound class="h-5 w-5" />
      </div>
      <div>
        <h3 class="font-semibold text-foreground">Profile</h3>
        <p class="text-xs text-muted-foreground">Manage your personal information.</p>
      </div>
    </div>

    <form
      method="POST"
      action="?/updateProfile"
      use:enhance={() => {
        profileSubmitting = true;
        return async ({ update, result }) => {
          await update();
          profileSubmitting = false;
          if (result.type === 'success') await invalidateAll();
        };
      }}
    >
      <div class="grid grid-cols-2 gap-5 px-6 py-6">
        <div class="grid gap-2">
          <Label for="firstName" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">First Name</Label>
          <div class="relative">
            <User class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              name="firstName"
              id="firstName"
              type="text"
              required
              value={data.user.firstName}
              class="pl-9 bg-white/[0.03] border-white/10 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20 transition-all"
            />
          </div>
        </div>
        <div class="grid gap-2">
          <Label for="lastName" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Name</Label>
          <div class="relative">
            <User class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              name="lastName"
              id="lastName"
              type="text"
              required
              value={data.user.lastName}
              class="pl-9 bg-white/[0.03] border-white/10 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20 transition-all"
            />
          </div>
        </div>
        <div class="col-span-2 grid gap-2">
          <Label for="email" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
          <div class="relative">
            <Mail class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              name="email"
              id="email"
              type="email"
              value={data.user.email}
              required
              class="pl-9 bg-white/[0.03] border-white/10 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20 transition-all"
            />
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-white/5 bg-white/[0.02] px-6 py-4">
        <p class="text-xs text-muted-foreground">Changes will be reflected immediately.</p>
        <Button
          type="submit"
          size="sm"
          disabled={profileSubmitting}
          class="bg-[#6366f1] hover:bg-[#4f46e5] text-white px-5 transition-all"
        >
          {profileSubmitting ? 'Updating...' : 'Update Profile'}
        </Button>
      </div>
    </form>
  </div>

  <!-- Change Password Card -->
  <div class="rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden shadow-xl">
    <!-- Card Header -->
    <div class="flex items-center gap-4 border-b border-white/5 bg-white/[0.02] px-6 py-5">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#6366f1]/15 text-[#6366f1]">
        <ShieldCheck class="h-5 w-5" />
      </div>
      <div>
        <h3 class="font-semibold text-foreground">Change Password</h3>
        <p class="text-xs text-muted-foreground">Update your password to keep your account secure.</p>
      </div>
    </div>

    <form
      method="POST"
      action="?/changePassword"
      use:enhance={() => {
        passwordSubmitting = true;
        return async ({ update, result }) => {
          await update();
          passwordSubmitting = false;
          if (result.type === 'success') {
            const formElement = document.querySelector('form[action="?/changePassword"]') as HTMLFormElement;
            if (formElement) formElement.reset();
          }
        };
      }}
    >
      <div class="grid gap-5 px-6 py-6">
        <div class="grid gap-2">
          <Label for="oldPassword" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Password</Label>
          <div class="relative">
            <Lock class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              name="oldPassword"
              id="oldPassword"
              type={showCurrentPassword ? 'text' : 'password'}
              required
              autocomplete="current-password"
              class="pl-9 pr-10 bg-white/[0.03] border-white/10 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20 transition-all"
            />
            <button
              type="button"
              onclick={() => (showCurrentPassword = !showCurrentPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {#if showCurrentPassword}
                <EyeOff class="h-3.5 w-3.5" />
              {:else}
                <Eye class="h-3.5 w-3.5" />
              {/if}
            </button>
          </div>

        </div>
        <div class="grid gap-2">
          <Label for="newPassword" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Password</Label>
          <div class="relative">
            <KeyRound class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              name="newPassword"
              id="newPassword"
              type={showNewPassword ? 'text' : 'password'}
              required
              minlength="6"
              autocomplete="new-password"
              class="pl-9 pr-10 bg-white/[0.03] border-white/10 focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20 transition-all"
            />
            <button
              type="button"
              onclick={() => (showNewPassword = !showNewPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {#if showNewPassword}
                <EyeOff class="h-3.5 w-3.5" />
              {:else}
                <Eye class="h-3.5 w-3.5" />
              {/if}
            </button>
          </div>
          <p class="text-xs text-muted-foreground">Password must be at least 6 characters.</p>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-white/5 bg-white/[0.02] px-6 py-4">
        <p class="text-xs text-muted-foreground">Use a strong password you don't use elsewhere.</p>
        <Button
          type="submit"
          size="sm"
          disabled={passwordSubmitting}
          class="bg-[#6366f1] hover:bg-[#4f46e5] text-white px-5 transition-all"
        >
          {passwordSubmitting ? 'Changing...' : 'Change Password'}
        </Button>
      </div>
    </form>
  </div>

</div>