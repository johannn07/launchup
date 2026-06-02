<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import type { PageData } from './$types';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { Sun, Moon, Rocket, ArrowLeft, Eye, EyeOff } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();
  let isLoading = false;

  const { form, errors, enhance, message, submitting } = superForm(data.form);

  let dark = $state(false);
  let showPassword = $state(false);
  let showRepeatPassword = $state(false);

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
  }

  $effect(() => {
    dark = document.documentElement.classList.contains('dark');
  });

  function getPasswordStrength(password: string) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(score, 4);
  }

  const passwordStrength = $derived(getPasswordStrength($form.password ?? ''));

  $effect(() => {
    if ($submitting) {
      toast.dismiss();
      toast.info('Creating account...');
    }
    if ($message && !$submitting) {
      toast.dismiss();
      toast.success('Account created successfully');
      goto('/login');
    }
    if ($errors.repeatPassword && !$submitting) {
      toast.dismiss();
      toast.error('Signup failed', { description: $errors.repeatPassword.toString() });
    }
  });
</script>

<svelte:head>
  <title>Register</title>
</svelte:head>

<div class="grid h-screen overflow-hidden lg:grid-cols-[0.96fr_1.04fr]">
  <!-- LEFT PANEL -->
  <div class="relative hidden overflow-hidden bg-slate-50 dark:bg-slate-950 lg:flex lg:flex-col">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.06),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.08),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.24),transparent_30%)]"></div>
    <div class="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.02),transparent_38%,rgba(0,0,0,0.01))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%,rgba(255,255,255,0.03))]"></div>

    <!-- Navbar -->
    <div class="relative z-10 flex items-center justify-between px-10 py-8">
      <div class="flex items-center gap-3">
        <Rocket class="h-5 w-5 text-[#6366f1]" />
        <a href="/" class="text-xl font-black tracking-tight text-slate-950 dark:text-white">LaunchUp</a>
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
          Build a stronger first signal
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 flex flex-1 items-center px-10 pb-32">
      <div class="max-w-xl space-y-6">
    
        <p class="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-white/60">Create your account</p>
        <h1 class="text-4xl font-black tracking-[-0.05em] text-slate-950 dark:text-white sm:text-5xl">
          A cleaner onboarding path starts here.
        </h1>
        <p class="text-base leading-7 text-slate-600 dark:text-white/72 sm:text-lg sm:leading-8">
          The form is intentionally focused so startups can get in quickly, without feeling like they are battling the interface.
        </p>
        <div class="grid gap-4 pt-2 sm:grid-cols-3 sm:pt-4">
          <div class="rounded-2xl border border-slate-200 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/60">
            <p class="text-sm text-slate-500 dark:text-white/55">Signup</p>
            <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Shorter path</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/60">
            <p class="text-sm text-slate-500 dark:text-white/55">Password</p>
            <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Strength meter</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/60">
            <p class="text-sm text-slate-500 dark:text-white/55">Friction</p>
            <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Minimized</p>
          </div>
        </div>
      </div>
    </div>

    <div class="absolute bottom-8 right-8 w-[22rem]">
      <img src="register.svg" alt="" class="w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.28)]" />
    </div>
  </div>

  <!-- RIGHT PANEL (untouched except eye icons) -->
  <div class="relative flex h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_36%),linear-gradient(to_bottom,#ffffff,#f7f9ff)] px-6 py-6 dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_36%),linear-gradient(to_bottom,#020617,#050816)]">
    <div class="absolute left-6 top-6 lg:hidden">
      <a href="/" class="text-xl font-black tracking-tight">LaunchUp</a>
    </div>
    <form
      method="post"
      class="w-full max-w-[32rem] rounded-[2rem] border border-slate-200/70 bg-white/85 p-6 shadow-[0_26px_80px_rgba(15,23,42,0.14)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70 sm:p-8"
      use:enhance
    >
      <div class="space-y-2 text-center">
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-[#6366f1]">Register</p>
          <h1 class="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl pb-10">Create your account</h1>       
      </div>
      <div class="mt-6 grid gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-2.5">
            <Label for="firstName">First name</Label>
            <Input
              name="firstName"
              id="firstName"
              type="text"
              required
              placeholder="John"
              bind:value={$form.firstName}
              class="h-10 rounded-xl border-slate-200 bg-white/90 focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.18)] dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <div class="grid gap-2.5">
            <Label for="lastName">Last name</Label>
            <Input
              name="lastName"
              id="lastName"
              type="text"
              required
              bind:value={$form.lastName}
              placeholder="Doe"
              class="h-10 rounded-xl border-slate-200 bg-white/90 focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.18)] dark:border-white/10 dark:bg-white/5"
            />
          </div>
        </div>
        <div class="grid gap-2.5">
          <Label for="email">Email</Label>
          <Input
            name="email"
            id="email"
            type="email"
            placeholder="johndoe@example.com"
            required
            bind:value={$form.email}
            class="h-10 rounded-xl border-slate-200 bg-white/90 focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.18)] dark:border-white/10 dark:bg-white/5"
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
              class="h-10 rounded-xl border-slate-200 bg-white/90 pr-10 focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.18)] dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {#if showPassword}
                <EyeOff class="h-4 w-4" />
              {:else}
                <Eye class="h-4 w-4" />
              {/if}
            </button>
          </div>
          <div class="grid grid-cols-4 gap-2 pt-0.5" aria-hidden="true">
            {#each Array(4) as _, segment}
              <span
                class={`h-1.5 rounded-full transition-colors duration-200 ${
                  segment < passwordStrength
                    ? passwordStrength >= 4
                      ? 'bg-emerald-500'
                      : passwordStrength >= 3
                        ? 'bg-sky-500'
                        : passwordStrength >= 2
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              ></span>
            {/each}
          </div>
        </div>
        <div class="grid gap-2.5">
          <Label for="repeatPassword">Repeat password</Label>
          <div class="relative">
            <Input
              name="repeatPassword"
              id="repeatPassword"
              type={showRepeatPassword ? 'text' : 'password'}
              required
              bind:value={$form.repeatPassword}
              class="h-11 rounded-xl border-slate-200 bg-white/90 pr-10 focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.18)] dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="button"
              onclick={() => (showRepeatPassword = !showRepeatPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
              aria-label={showRepeatPassword ? 'Hide password' : 'Show password'}
            >
              {#if showRepeatPassword}
                <EyeOff class="h-4 w-4" />
              {:else}
                <Eye class="h-4 w-4" />
              {/if}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          class="h-11 w-full rounded-full bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          disabled={$submitting}
        >
          Create account
        </Button>
      </div>
      <div class="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?
        <a href="/login" class="font-semibold text-[#4f46e5] underline-offset-4 hover:underline">Login</a>
      </div>
    </form>
  </div>
</div>