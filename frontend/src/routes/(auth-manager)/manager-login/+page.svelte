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
        <Rocket class="h-5 w-5 text-primary" />
        <a href="/" class="text-xl font-black tracking-tight text-foreground">LaunchUp Manager</a>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={toggleTheme}
          class="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:text-primary"
          aria-label="Toggle theme"
        >
          {#if dark}
            <Sun class="h-4 w-4" />
          {:else}
            <Moon class="h-4 w-4" />
          {/if}
        </button>
        <div class="glass rounded-full px-4 py-2 text-sm font-medium text-foreground">
          System Control
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 flex flex-1 items-center px-10 pb-10">
      <div class="max-w-xl space-y-6">
        <p class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">Manager</p>
        <h1 class="text-5xl font-black tracking-[-0.05em] text-foreground">
          Manage the LaunchUp ecosystem.
        </h1>
        <p class="text-lg leading-8 text-muted-foreground">
          Oversee startups, track readiness progress, and manage the platform from the command center.
        </p>
        <div class="grid gap-4 pt-4 sm:grid-cols-3">
          <div class="glass rounded-2xl p-4">
            <p class="text-sm text-muted-foreground">Oversight</p>
            <p class="mt-2 text-lg font-semibold text-foreground">Review startups</p>
          </div>
          <div class="glass rounded-2xl p-4">
            <p class="text-sm text-muted-foreground">Control</p>
            <p class="mt-2 text-lg font-semibold text-foreground">Manage users</p>
          </div>
          <div class="glass rounded-2xl p-4">
            <p class="text-sm text-muted-foreground">Insights</p>
            <p class="mt-2 text-lg font-semibold text-foreground">Track progress</p>
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
      class="glass-card relative w-full max-w-md p-8 sm:p-10"
    >
      <div class="absolute -inset-0.5 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-transparent to-primary/10 blur-xl"></div>
      <div class="space-y-3 text-center">
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Manager</p>
        <h1 class="text-4xl font-black tracking-tight text-foreground">Welcome back</h1>
        <p class="text-balance text-base leading-7 text-muted-foreground">
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
            class="glass-input h-12"
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
              class="glass-input h-12 pr-12"
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
          <p class="text-sm font-medium text-destructive">{$errors.email}</p>
        {/if}
        <Button
          type="submit"
          variant="glass-primary"
          class="group mt-2 h-12 w-full text-base"
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