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
        <Rocket class="h-5 w-5 text-primary" />
        <a href="/" class="text-xl font-black tracking-tight text-foreground">LaunchUp</a>
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
          Build a stronger first signal
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 flex flex-1 items-center px-10 pb-32">
      <div class="max-w-xl space-y-6">
    
        <p class="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">Create your account</p>
        <h1 class="text-4xl font-black tracking-[-0.05em] text-foreground sm:text-5xl">
          A cleaner onboarding path starts here.
        </h1>
        <p class="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          The form is intentionally focused so startups can get in quickly, without feeling like they are battling the interface.
        </p>
        <div class="grid gap-4 pt-2 sm:grid-cols-3 sm:pt-4">
          <div class="glass rounded-2xl p-4">
            <p class="text-sm text-muted-foreground">Signup</p>
            <p class="mt-2 text-lg font-semibold text-foreground">Shorter path</p>
          </div>
          <div class="glass rounded-2xl p-4">
            <p class="text-sm text-muted-foreground">Password</p>
            <p class="mt-2 text-lg font-semibold text-foreground">Strength meter</p>
          </div>
          <div class="glass rounded-2xl p-4">
            <p class="text-sm text-muted-foreground">Friction</p>
            <p class="mt-2 text-lg font-semibold text-foreground">Minimized</p>
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
      class="glass-card w-full max-w-[32rem] p-6 sm:p-8"
      use:enhance
    >
      <div class="space-y-2 text-center">
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-primary">Register</p>
          <h1 class="text-3xl font-black tracking-tight text-foreground pb-10 sm:text-4xl">Create your account</h1>       
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
              class="h-10"
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
              class="h-10"
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
            class="h-10"
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
              class="h-10 pr-10"
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
                    : 'bg-muted'
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
              class="h-11 pr-10"
            />
            <button
              type="button"
              onclick={() => (showRepeatPassword = !showRepeatPassword)}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
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
          variant="glass-primary"
          class="h-11 w-full text-base"
          disabled={$submitting}
        >
          Create account
        </Button>
      </div>
      <div class="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?
        <a href="/login" class="font-semibold text-primary underline-offset-4 hover:underline">Login</a>
      </div>
    </form>
  </div>
</div>