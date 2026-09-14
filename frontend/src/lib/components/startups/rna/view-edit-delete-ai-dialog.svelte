<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Textarea } from '$lib/components/ui/textareav2';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Separator } from '$lib/components/ui/separator';
  import { Check, Trash, Copy, Sparkles, Loader, Send, Cpu, TrendingUp, CheckCircle2, Building2, ShieldCheck, Wallet } from 'lucide-svelte';
  import { TextEditor } from '$lib/components/shared';
  import { tick } from 'svelte';
  import { Input } from '$lib/components/ui/input';

  const dimensionIcon: Record<string, any> = {
    Technology: Cpu,
    Market: TrendingUp,
    Acceptance: CheckCircle2,
    Organizational: Building2,
    Regulatory: ShieldCheck,
    Investment: Wallet
  };

  type ChatMessage = {
    id?: number;
    role: 'User' | 'Ai';
    content: string;
    createdAt?: Date;
    refinedRna?: string;
  };

  let {
    open = $bindable(),
    rna,
    update,
    deleteRna,
    readinessData,
    closeDialog,
    addToRna,
    role
  } = $props();

  let rnaCopy = $state({ ...rna });
  let isLoadingHistory = $state(false);

  // Update always cleared isAiGenerated, even when nothing was edited — a
  // mentor clicking through an untouched draft recorded it as human-authored
  // identically to a substantive rewrite. Naming the action is at least
  // visible now, even though it still collapses to the same boolean.
  const contentChanged = $derived(rnaCopy.rna !== rna.rna);
  const TypeIcon = $derived(
    dimensionIcon[rnaCopy.readinessLevel?.readinessType] ?? Cpu
  );

  function handleDialogStateChange(newOpen: boolean) {
    open = newOpen;
    if (!newOpen) {
      closeDialog();
    }
  }

  async function loadChatHistory() {
    isLoadingHistory = true;
    try {
      const response = await fetch(
        `/api/chat-history/rna/${rna.id}`
      );
      if (!response.ok) throw new Error('Failed to load chat history');
      const history = await response.json();
      chatHistory = history;
      tick().then(() => {
        if (chatHistoryContainer) {
          chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
        }
      });
    } catch (error) {
      console.error('Error loading chat history:', error);
      chatHistory = [
        {
          role: 'Ai',
          content:
            'Failed to load previous chat history. But we can continue our conversation.'
        }
      ];
    } finally {
      isLoadingHistory = false;
    }
  }

  $effect(() => {
    if (open) {
      loadChatHistory();
    } else {
      rnaCopy = { ...rna };
      userInput = '';
    }
  });

  let deleteDialogOpen = $state(false);

  const deleteDialogOnOpenChange = () => {
    deleteDialogOpen = !deleteDialogOpen;
  };

  let chatHistory = $state<ChatMessage[]>([]);
  let userInput = $state('');
  let isLoading = $state(false);
  let chatHistoryContainer: HTMLDivElement;

  async function handleSendMessage() {
    if (!userInput.trim()) return;

    const currentInput = userInput;
    chatHistory = [...chatHistory, { role: 'User', content: currentInput }];
    userInput = '';
    isLoading = true;

    try {
      const response = await fetch(`/api/rna/${rna.id}/refine`, {
        method: 'POST',
        // Raw fetch, not the shared axios instance, so it does not inherit
        // withCredentials. Without this the httpOnly Access cookie is not sent
        // — fetch defaults to same-origin, and :5173 -> :3000 is cross-origin —
        // and this route now requires authentication.
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          chatHistory,
          latestPrompt: currentInput
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      await loadChatHistory();
    } catch (error) {
      console.error('Error details:', error);
      const errorMessage: ChatMessage = {
        role: 'Ai',
        content: `Sorry, I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      chatHistory = [...chatHistory, errorMessage];
    } finally {
      isLoading = false;
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={handleDialogStateChange}>
  <Dialog.Content class="flex h-[90vh] max-w-[1200px] flex-col rounded-2xl p-0">
    <div class="flex min-h-0 flex-1">
      <!-- AI Chat Section (left) -->
      <div
        class="flex w-1/2 flex-col border-r border-slate-200/60 bg-slate-50/40 p-6 dark:border-white/10 dark:bg-white/[0.015]"
      >
        <div class="mb-4 flex items-center gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10"
          >
            <Sparkles class="h-5 w-5 text-primary" />
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#6366f1]">
              AI Assistant
            </p>
            <h1 class="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              Refine RNA
            </h1>
          </div>
        </div>
        <div
          bind:this={chatHistoryContainer}
          class="flex-1 space-y-4 overflow-y-auto py-4"
        >
          {#if isLoadingHistory}
            <div class="flex h-full items-center justify-center gap-2 text-sm text-slate-400 dark:text-white/40">
              <Loader class="h-4 w-4 animate-spin" />
              Loading chat history...
            </div>
          {:else}
            <div class="flex justify-start">
              <div
                class="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:bg-white/[0.06] dark:text-white/80"
              >
                I can help you refine this Readiness and Needs Assessment. How
                would you like to modify the description or other fields?
              </div>
            </div>
            {#each chatHistory as message}
              <div
                class="flex {message.role === 'User'
                  ? 'justify-end'
                  : 'justify-start'}"
              >
                <div
                  class="flex flex-col {message.role === 'User'
                    ? 'items-end'
                    : 'items-start'} max-w-[80%]"
                >
                  {#if message.role === 'User'}
                    <div
                      class="rounded-2xl rounded-tr-sm bg-[#6366f1] px-4 py-3 text-sm text-white shadow-[0_4px_16px_rgba(99,102,241,0.25)]"
                    >
                      {message.content}
                    </div>
                  {:else}
                    <div
                      class="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:bg-white/[0.06] dark:text-white/80"
                    >
                      Here's my suggestion for improving your RNA:
                      {#if message.refinedRna}
                        <div
                          class="prose prose-sm dark:prose-invert group relative my-2 max-w-none rounded-xl border border-slate-200/70 bg-slate-50 p-4 pb-9 dark:border-white/10 dark:bg-slate-950/40"
                        >
                          {@html message.refinedRna}
                          <button
                            class="absolute bottom-2 right-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 opacity-70 transition-opacity hover:bg-slate-200/60 hover:text-slate-900 hover:opacity-100 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                            onclick={async (e) => {
                              const button = e.currentTarget as HTMLButtonElement;
                              const container = button.parentElement;
                              if (!container) return;

                              // Excludes the button, which is UI, not content.
                              const htmlContent = message.refinedRna || '';

                              try {
                                // Copy both HTML and plain text to clipboard
                                await navigator.clipboard.write([
                                  new ClipboardItem({
                                    'text/html': new Blob([htmlContent], { type: 'text/html' }),
                                    'text/plain': new Blob([container.textContent?.replace('Copy', '').trim() || ''], { type: 'text/plain' })
                                  })
                                ]);
                              } catch (err) {
                                // Fallback to plain text if HTML copy fails
                                navigator.clipboard.writeText(htmlContent);
                              }
                            }}
                          >
                            <Copy class="h-3.5 w-3.5" />
                            Copy
                          </button>
                        </div>
                        {@html message.content}
                      {:else}
                        {@html message.content}
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
        <div class="mt-auto flex gap-2">
          <Input
            type="text"
            class="rounded-xl border-slate-200/70 bg-white dark:border-white/10 dark:bg-white/[0.03]"
            placeholder="Ask how you would like to refine the RNA..."
            required
            bind:value={userInput}
            onkeydown={(e) =>
              e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            disabled={isLoadingHistory}
          />
          <Button
            class="gap-1.5 rounded-xl bg-[#6366f1] text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6366f1] hover:shadow-[0_8px_24px_rgba(99,102,241,0.4)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            disabled={isLoading || !userInput.trim() || isLoadingHistory}
            onclick={handleSendMessage}
          >
            {#if isLoading}
              <Loader class="h-4 w-4 animate-spin" />
              Sending...
            {:else}
              <Send class="h-4 w-4" />
              Send
            {/if}
          </Button>
        </div>
      </div>

      <!-- RNA Details -->
      <div class="flex w-1/2 flex-col p-6">
        <div class="flex items-start justify-between gap-3 pr-10">
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10"
            >
              <TypeIcon class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 class="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                RNA Details
              </h2>
              <div class="mt-1">
                {#if rnaCopy.isAiGenerated}
                  <Badge
                    class="border border-amber-500/30 bg-amber-600/90 text-amber-100"
                    >AI Draft &mdash; needs review</Badge
                  >
                {:else}
                  <Badge
                    class="border border-emerald-500/30 bg-emerald-600/90 text-emerald-100"
                    >Approved</Badge
                  >
                {/if}
              </div>
            </div>
          </div>
          <Button
            class="rounded-xl"
            size="sm"
            variant="destructive"
            onclick={() => (deleteDialogOpen = true)}
            ><Trash class="h-4 w-4" /> Delete</Button
          >
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <span class="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-white/40"
              >Readiness Type</span
            >
            <span class="text-sm font-bold text-slate-900 dark:text-white"
              >{rnaCopy.readinessLevel?.readinessType || 'N/A'}</span
            >
          </div>

          <div class="flex flex-1 flex-col gap-2">
            <Label class="text-sm font-bold text-slate-900 dark:text-white"
              >RNA Description</Label
            >
            <TextEditor
              bind:value={rnaCopy.rna}
              rows={8}
              placeholder="Enter RNA description..."
              classNames="w-full"
            />
          </div>

          <div
            class="rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-500 dark:text-white/50">Current Level</span>
                <Badge variant="secondary">{rnaCopy.readinessLevel?.level || 'N/A'}</Badge>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-500 dark:text-white/50">AI Generated</span>
                <span
                  class="text-sm font-bold {rnaCopy.isAiGenerated
                    ? 'text-amber-500'
                    : 'text-emerald-500'}"
                >
                  {rnaCopy.isAiGenerated ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-200/60 pt-4 dark:border-white/10">
          <Button
            variant="outline"
            class="rounded-xl border-slate-200 bg-white/60 backdrop-blur dark:border-white/10 dark:bg-white/5"
            onclick={() => closeDialog()}>Cancel</Button
          >
          <Button
            class="rounded-xl bg-[#6366f1] text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6366f1] hover:shadow-[0_8px_24px_rgba(99,102,241,0.4)]"
            onclick={() => {
              update(rnaCopy.id, {
                rna: rnaCopy.rna,
                startup_id: rnaCopy.startup,
                isAiGenerated: false
              });
              open = false;
            }}
          >
            {contentChanged ? 'Save Edits' : 'Approve as-is'}
          </Button>
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root
  bind:open={deleteDialogOpen}
  onOpenChange={deleteDialogOnOpenChange}
>
  <AlertDialog.Content class="rounded-2xl">
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this {rnaCopy.readinessLevel?.readinessType} RNA?</AlertDialog.Title>
      <AlertDialog.Description>
        This action cannot be undone. This will permanently delete this
        Readiness and Needs Assessment.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel class="rounded-xl">Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="rounded-xl bg-red-500 hover:bg-red-600"
        onclick={async () => {
          await deleteRna(rna.id, 0);
          deleteDialogOpen = false;
          closeDialog();
        }}>Delete RNA</AlertDialog.Action
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
