<script lang="ts">
  import type { PageData } from './$types';
  import { superForm } from 'sveltekit-superforms';
  import { Eye, EyeOff, AlertCircle } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  import { SubmitButton, dur, MOVE } from '$lib/motion';
  import AuthShell from '../AuthShell.svelte';

  let { data }: { data: PageData } = $props();

  const { form, errors, enhance, submitting } = superForm(data.form);

  let showPassword = $state(false);

  // The server puts both the zod format complaint and the sign-in failures on
  // `email`. A format complaint belongs under the field; anything else is about
  // the submission as a whole and belongs in the alert above the form.
  const emailError = $derived($errors.email?.[0]);
  const isFormatError = $derived(
    !!emailError && /invalid email/i.test(emailError)
  );
  const fieldError = $derived(isFormatError ? emailError : undefined);
  const formError = $derived(!isFormatError ? emailError : undefined);
</script>

<svelte:head>
  <title>Login — LaunchUp</title>
</svelte:head>

<AuthShell
  title="Sign in to LaunchUp"
  subtitle="Pick up where you left off with your startup's assessment."
  switchPrompt="Don't have an account?"
  switchHref="/register"
  switchLabel="Create one"
>
  <form method="post" use:enhance novalidate class="grid gap-5">
    {#if formError}
      <p
        transition:slide={{ duration: dur(MOVE) }}
        class="lu-alert"
        role="alert"
      >
        <AlertCircle class="mt-0.5 h-4 w-4 flex-none" />
        <span>{formError}</span>
      </p>
    {/if}

    <div>
      <label class="lu-field" for="email">Email</label>
      <input
        class="lu-input"
        name="email"
        id="email"
        type="email"
        autocomplete="email"
        placeholder="you@company.com"
        aria-invalid={fieldError ? 'true' : undefined}
        aria-describedby={fieldError ? 'email-error' : undefined}
        bind:value={$form.email}
      />
      {#if fieldError}
        <p
          transition:slide={{ duration: dur(MOVE) }}
          class="lu-error"
          id="email-error"
        >
          <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{fieldError}</span>
        </p>
      {/if}
    </div>

    <div>
      <div class="flex items-baseline justify-between gap-3">
        <label class="lu-field" for="password">Password</label>
        <a href="/forgot-password" class="lu-link mb-[7px] text-[13px]"
          >Forgot password?</a
        >
      </div>
      <div class="relative">
        <input
          class="lu-input lu-input-pw"
          name="password"
          id="password"
          type={showPassword ? 'text' : 'password'}
          autocomplete="current-password"
          bind:value={$form.password}
        />
        <button
          type="button"
          onclick={() => (showPassword = !showPassword)}
          class="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#94a3b8] transition-colors hover:text-[#f1f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
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

    <SubmitButton
      status={$submitting ? 'busy' : 'idle'}
      label="Sign in"
      busyLabel="Signing in"
      class="mt-1 w-full"
    />
  </form>
</AuthShell>
