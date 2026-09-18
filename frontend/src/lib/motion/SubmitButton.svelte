<script lang="ts">
  import { Loader2 } from 'lucide-svelte';

  type State = 'idle' | 'busy' | 'done';

  let {
    status = 'idle',
    label,
    busyLabel,
    doneLabel = 'Saved',
    variant = 'primary',
    small = false,
    type = 'submit',
    disabled = false,
    class: cls = '',
    onclick
  }: {
    status?: State;
    label: string;
    busyLabel: string;
    doneLabel?: string;
    variant?: 'primary' | 'secondary';
    small?: boolean;
    type?: 'submit' | 'button';
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
  } = $props();

  // `done` is a moment, not a state to stay in: show the tick, then settle
  // back to the idle label on its own.
  let shown = $state<State>('idle');
  $effect(() => {
    shown = status;
    if (status !== 'done') return;
    const t = setTimeout(() => (shown = 'idle'), 1600);
    return () => clearTimeout(t);
  });
</script>

<button
  {type}
  {onclick}
  disabled={disabled || status === 'busy'}
  aria-busy={status === 'busy'}
  class="lu-btn lu-btn-{variant} lu-submit {small ? 'lu-btn-sm' : ''} {cls}"
>
  <span class="lu-submit__layer" data-active={shown === 'idle' ? '' : undefined} aria-hidden={shown !== 'idle'}>
    {label}
  </span>
  <span class="lu-submit__layer" data-active={shown === 'busy' ? '' : undefined} aria-hidden={shown !== 'busy'}>
    <Loader2 class="h-4 w-4 animate-spin" />
    {busyLabel}
  </span>
  <span class="lu-submit__layer" data-active={shown === 'done' ? '' : undefined} aria-hidden={shown !== 'done'}>
    {#if shown === 'done'}
      <svg class="lu-tick h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    {/if}
    {doneLabel}
  </span>
</button>
<!-- Button text changes aren't reliably announced; say it here instead. -->
<span class="sr-only" aria-live="polite">
  {status === 'busy' ? busyLabel : status === 'done' ? doneLabel : ''}
</span>
