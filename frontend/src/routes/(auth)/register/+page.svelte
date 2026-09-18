<script lang="ts">
  import type { PageData } from './$types';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff, AlertCircle } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  import { SubmitButton, dur, MOVE } from '$lib/motion';
  import AuthShell from '../AuthShell.svelte';

  let { data }: { data: PageData } = $props();

  let showPassword = $state(false);
  let showRepeat = $state(false);
  let acceptedTerms = $state(false);

  // A field only shows its error once the user has left it, or once they have
  // tried to submit — so the form is never red before anyone has typed.
  let touched = $state({
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    repeatPassword: false,
    terms: false
  });

  const { form, errors, enhance, message, submitting } = superForm(data.form, {
    onSubmit: ({ cancel }) => {
      touched = {
        firstName: true,
        lastName: true,
        email: true,
        password: true,
        repeatPassword: true,
        terms: true
      };
      if (!canSubmit) cancel();
    }
  });

  function strengthOf(pw: string) {
    let score = 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
    if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1;
    // Floor at 1 so a very weak password still reads "Weak" rather than
    // rendering an empty meter with no label.
    return Math.min(Math.max(score, 1), 4);
  }

  const strength = $derived(strengthOf($form.password ?? ''));
  const STRENGTH = [
    { label: '', colour: '' },
    { label: 'Weak', colour: 'var(--lu-danger)' },
    { label: 'Fair', colour: 'var(--lu-flag)' },
    { label: 'Good', colour: 'var(--lu-indigo)' },
    { label: 'Strong', colour: 'var(--lu-ok)' }
  ];

  // Client-side rules. The server still validates everything independently.
  const clientErrors = $derived({
    firstName: !($form.firstName ?? '').trim() ? 'Enter your first name' : '',
    lastName: !($form.lastName ?? '').trim() ? 'Enter your last name' : '',
    email: !($form.email ?? '').trim()
      ? 'Enter your email address'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($form.email)
        ? 'Enter a valid email address'
        : '',
    password: !($form.password ?? '')
      ? 'Choose a password'
      : ($form.password ?? '').length < 8
        ? 'Use at least 8 characters'
        : '',
    repeatPassword: !($form.repeatPassword ?? '')
      ? 'Repeat your password'
      : $form.repeatPassword !== $form.password
        ? 'Passwords do not match'
        : '',
    terms: !acceptedTerms ? 'Accept the terms to continue' : ''
  });

  const canSubmit = $derived(Object.values(clientErrors).every((e) => !e));

  /** Client rule first, then whatever the server sent back for that field. */
  function errorFor(field: keyof typeof clientErrors, serverError?: string) {
    if (touched[field] && clientErrors[field]) return clientErrors[field];
    return serverError;
  }

  $effect(() => {
    if ($message && !$submitting) {
      toast.success('Account created successfully');
      goto('/login');
    }
  });
</script>

<svelte:head>
  <title>Create an account — LaunchUp</title>
</svelte:head>

<AuthShell
  title="Create your account"
  subtitle="Submit a startup and get a readiness level on every scale we assess."
  switchPrompt="Already have an account?"
  switchHref="/login"
  switchLabel="Sign in"
>
  <form method="post" use:enhance novalidate class="grid gap-5">
    {#if $errors.email?.[0]}
      <p
        transition:slide={{ duration: dur(MOVE) }}
        class="lu-alert"
        role="alert"
      >
        <AlertCircle class="mt-0.5 h-4 w-4 flex-none" />
        <span>{$errors.email[0]}</span>
      </p>
    {/if}

    <div class="grid gap-5 sm:grid-cols-2">
      <div>
        <label class="lu-field" for="firstName">First name</label>
        <input
          class="lu-input"
          name="firstName"
          id="firstName"
          type="text"
          autocomplete="given-name"
          placeholder="Ada"
          aria-invalid={errorFor('firstName') ? 'true' : undefined}
          bind:value={$form.firstName}
          onblur={() => (touched.firstName = true)}
        />
        {#if errorFor('firstName')}
          <p transition:slide={{ duration: dur(MOVE) }} class="lu-error">
            <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span>{errorFor('firstName')}</span>
          </p>
        {/if}
      </div>

      <div>
        <label class="lu-field" for="lastName">Last name</label>
        <input
          class="lu-input"
          name="lastName"
          id="lastName"
          type="text"
          autocomplete="family-name"
          placeholder="Reyes"
          aria-invalid={errorFor('lastName') ? 'true' : undefined}
          bind:value={$form.lastName}
          onblur={() => (touched.lastName = true)}
        />
        {#if errorFor('lastName')}
          <p transition:slide={{ duration: dur(MOVE) }} class="lu-error">
            <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span>{errorFor('lastName')}</span>
          </p>
        {/if}
      </div>
    </div>

    <div>
      <label class="lu-field" for="email">Email</label>
      <input
        class="lu-input"
        name="email"
        id="email"
        type="email"
        autocomplete="email"
        placeholder="you@company.com"
        aria-invalid={errorFor('email') ? 'true' : undefined}
        bind:value={$form.email}
        onblur={() => (touched.email = true)}
      />
      {#if errorFor('email')}
        <p transition:slide={{ duration: dur(MOVE) }} class="lu-error">
          <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{errorFor('email')}</span>
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
          autocomplete="new-password"
          aria-invalid={errorFor('password') ? 'true' : undefined}
          bind:value={$form.password}
          onblur={() => (touched.password = true)}
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

      {#if $form.password}
        <div class="mt-2.5 flex items-center gap-3">
          <div class="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
            {#each [0, 1, 2, 3] as seg (seg)}
              <span
                class="h-1 rounded-full transition-colors duration-move"
                style="transition-delay:{seg * 60}ms; background:{seg < strength
                  ? STRENGTH[strength].colour
                  : '#1f2c47'}"
              ></span>
            {/each}
          </div>
          <span
            class="lu-num w-[3.2rem] text-right text-[12.5px] font-semibold"
            style="color:{STRENGTH[strength].colour || '#94a3b8'}"
          >
            {STRENGTH[strength].label}
          </span>
        </div>
      {/if}

      {#if errorFor('password')}
        <p transition:slide={{ duration: dur(MOVE) }} class="lu-error">
          <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{errorFor('password')}</span>
        </p>
      {:else if !$form.password}
        <p class="lu-hint">
          At least 8 characters. Longer is better than complicated.
        </p>
      {/if}
    </div>

    <div>
      <label class="lu-field" for="repeatPassword">Confirm password</label>
      <div class="relative">
        <input
          class="lu-input lu-input-pw"
          name="repeatPassword"
          id="repeatPassword"
          type={showRepeat ? 'text' : 'password'}
          autocomplete="new-password"
          aria-invalid={errorFor('repeatPassword', $errors.repeatPassword?.[0])
            ? 'true'
            : undefined}
          bind:value={$form.repeatPassword}
          onblur={() => (touched.repeatPassword = true)}
        />
        <button
          type="button"
          onclick={() => (showRepeat = !showRepeat)}
          class="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#94a3b8] transition-colors hover:text-[#f1f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8]"
          aria-label={showRepeat ? 'Hide password' : 'Show password'}
        >
          {#if showRepeat}
            <EyeOff class="h-4 w-4" />
          {:else}
            <Eye class="h-4 w-4" />
          {/if}
        </button>
      </div>
      {#if errorFor('repeatPassword', $errors.repeatPassword?.[0])}
        <p transition:slide={{ duration: dur(MOVE) }} class="lu-error">
          <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{errorFor('repeatPassword', $errors.repeatPassword?.[0])}</span>
        </p>
      {/if}
    </div>

    <div>
      <div class="flex items-start gap-2.5">
        <input
          class="lu-check"
          type="checkbox"
          id="terms"
          bind:checked={acceptedTerms}
          aria-invalid={errorFor('terms') ? 'true' : undefined}
          onblur={() => (touched.terms = true)}
        />
        <label for="terms" class="text-[14px] leading-[1.5] text-[#94a3b8]">
          I agree to the <a href="/legal/terms" class="lu-link"
            >Terms of Service</a
          >
          and
          <a href="/legal/privacy" class="lu-link">Privacy Policy</a>.
        </label>
      </div>
      {#if errorFor('terms')}
        <p transition:slide={{ duration: dur(MOVE) }} class="lu-error">
          <AlertCircle class="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{errorFor('terms')}</span>
        </p>
      {/if}
    </div>

    <SubmitButton
      status={$submitting ? 'busy' : 'idle'}
      label="Create account"
      busyLabel="Creating account"
      class="w-full"
    />
  </form>
</AuthShell>
