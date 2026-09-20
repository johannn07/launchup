<script lang="ts">
  import type { PageData } from './$types';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff, AlertCircle } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  import { SubmitButton, dur, MOVE } from '$lib/motion';
  import AuthShell from '../../(auth)/AuthShell.svelte';

  let { data }: { data: PageData } = $props();

  const { form, errors, enhance, message, submitting } = superForm(data.form);

  let showPassword = $state(false);

  // Same split as /login: a format complaint belongs under the field, a failed
  // sign-in belongs above the form.
  const emailError = $derived($errors.email?.[0]);
  const isFormatError = $derived(
    !!emailError && /invalid email/i.test(emailError)
  );
  const fieldError = $derived(isFormatError ? emailError : undefined);
  const formError = $derived(!isFormatError ? emailError : undefined);

  $effect(() => {
    if ($message && !$submitting) {
      toast.dismiss();
      goto('/startups');
    }
  });
</script>

<svelte:head>
  <title>Manager sign-in — LaunchUp</title>
</svelte:head>

<AuthShell
  title="Manager sign-in"
  subtitle="Review applications, rate readiness and manage the programme."
  switchPrompt="Signing in as a startup?"
  switchHref="/login"
  switchLabel="Use the startup sign-in"
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
        placeholder="manager@launchup.local"
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
      <label class="lu-field" for="password">Password</label>
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
