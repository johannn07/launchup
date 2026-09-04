<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { Loader, Sun, Moon, Rocket, Eye, EyeOff } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  const { form, errors, enhance, message, submitting } = superForm(data.form);

  let dark = $state(false);
  let showPassword = $state(false);

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
  }

  $effect(() => {
    dark = document.documentElement.classList.contains('dark');
  });

  $effect(() => {
    if ($message && !$submitting) {
      toast.dismiss();
      toast.success('Manager login successful');
      goto('/startups');
    }
    if ($errors.email && !$submitting) {
      toast.dismiss();
      toast.error(($errors.email as unknown) as string);
    }
  });
</script>

<svelte:head>
  <title>Manager Login</title>
</svelte:head>

<div class="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
  <!-- LEFT PANEL -->
  <div class="relative hidden overflow-hidden bg-slate-50 dark:bg-slate-950 lg:flex lg:flex-col">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.06),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.28),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.2),transparent_30%)]"></div>
    <div class="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.02),transparent_40%,rgba(0,0,0,0.01))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_40%,rgba(255,255,255,0.03))]"></div>

    <!-- Navbar -->
    <div class="relative z-10 flex items-center justify-between px-10 py-8">
      <div class="flex items-center gap-2">
        <Rocket class="h-5 w-5 text-[#6366f1]" />
        <a href="/" class="text-xl font-black tracking-tight text-slate-950 dark:text-white">LaunchUp Manager</a>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={toggleTheme}
          class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/60 text-slate-600 backdrop-blur transition-all hover:border-[#6366f1]/30 hover:text-[#6366f1] dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          aria-label="Toggle theme"
        >
          {#if dark}
            <Sun class="h-4 w-4" />
          {:else}
            <Moon class="h-4 w-4" />
          {/if}
        </button>
        <div class="rounded-full border border-slate-200 bg-white/60 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-white/90">
          System Control
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 flex flex-1 items-center px-10 pb-10">
      <div class="max-w-xl space-y-6">
        <p class="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-white/60">Manager</p>
        <h1 class="text-5xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">
          Manage the LaunchUp ecosystem.
        </h1>
        <p class="text-lg leading-8 text-slate-600 dark:text-white/72">
          Oversee startups, track readiness progress, and manage the platform from the command center.
        </p>
        <div class="grid gap-4 pt-4 sm:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/60">
            <p class="text-sm text-slate-500 dark:text-white/55">Oversight</p>
            <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Review startups</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/60">
            <p class="text-sm text-slate-500 dark:text-white/55">Control</p>
            <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Manage users</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/60">
            <p class="text-sm text-slate-500 dark:text-white/55">Insights</p>
            <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Track progress</p>
          </div>
        </div>
      </div>
    </div>

    <div class="absolute bottom-10 right-10 w-[24rem]">
      <img src="/loginv2.svg" alt="" class="w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.28)]" />
    </div>
  </div>

  <!-- RIGHT PANEL -->
  <div class="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_36%),linear-gradient(to_bottom,#ffffff,#f7f9ff)] px-6 py-10 dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_36%),linear-gradient(to_bottom,#020617,#050816)]">
    <div class="absolute left-6 top-6 lg:hidden">
      <a href="/" class="text-xl font-black tracking-tight">LaunchUp Manager</a>
    </div>
    <form
      method="post"
      use:enhance
      class="relative w-full max-w-md rounded-[2.5rem] border border-white/40 bg-white/60 p-8 shadow-[0_8px_32px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] sm:p-10"
    >
      <div class="absolute -inset-0.5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-[#6366f1]/20 via-transparent to-[#0ea5e9]/20 blur-xl dark:from-[#6366f1]/10 dark:to-[#0ea5e9]/10"></div>
      <div class="space-y-3 text-center">
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-[#6366f1]">Manager</p>
        <h1 class="text-4xl font-black tracking-tight text-slate-950 dark:text-white">Welcome back</h1>
        <p class="text-balance text-base leading-7 text-slate-600 dark:text-slate-300">
          Enter your manager credentials to continue.
        </p>
      </div>
      <div class="mt-8 grid gap-5">
        <div class="grid gap-2.5">
          <Label for="email">Email</Label>
          <Input
            name="email"
            id="email"
            type="email"
            placeholder="manager@example.com"
            required
            bind:value={$form.email}
            class="h-12 rounded-2xl border-white/50 bg-white/70 shadow-sm transition-all focus-visible:border-[#6366f1]/50 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#6366f1]/10 focus-visible:ring-offset-0 dark:border-white/10 dark:bg-white/5 dark:focus-visible:border-[#6366f1]/50 dark:focus-visible:bg-white/10"
          />
        </div>
        <div class="grid gap-2.5">
          <Label for="password">Password</Label>
          <div class="relative">
            <Input
              name="password"
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              bind:value={$form.password}
              class="h-12 rounded-2xl border-white/50 bg-white/70 pr-12 shadow-sm transition-all focus-visible:border-[#6366f1]/50 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-[#6366f1]/10 focus-visible:ring-offset-0 dark:border-white/10 dark:bg-white/5 dark:focus-visible:border-[#6366f1]/50 dark:focus-visible:bg-white/10"
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {#if showPassword}
                <EyeOff class="h-4 w-4" />
              {:else}
                <Eye class="h-4 w-4" />
              {/if}
            </button>
          </div>
        </div>
        {#if $errors.email}
          <p class="text-sm font-medium text-rose-500">{$errors.email}</p>
        {/if}
        <Button
          type="submit"
          class="group mt-2 h-12 w-full rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 px-6 text-base font-semibold text-white shadow-[0_8px_30px_rgba(15,23,42,0.25),inset_0_1px_1px_rgba(255,255,255,0.15)] ring-1 ring-slate-950/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.35)] dark:from-white dark:to-slate-200 dark:text-slate-950 dark:shadow-[0_8px_30px_rgba(255,255,255,0.1)]"
          disabled={$submitting}
        >
          {#if $submitting}
            <Loader class="mr-2 h-5 w-5 animate-spin" />
          {/if}
          Sign In
        </Button>
      </div>
    </form>
  </div>
</div>