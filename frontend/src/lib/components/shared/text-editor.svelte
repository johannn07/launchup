<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import TextAlign from '@tiptap/extension-text-align';
  import Underline from '@tiptap/extension-underline';

  export let value: string = '';
  export let rows: number = 8; // Default to 8 rows if not specified
  export let placeholder: string = 'Start writing...';
  export let classNames: string = '';

  let editor: Editor;
  let element: HTMLElement;
  let isBoldActive: boolean = false;
  let isItalicActive: boolean = false;
  let isUnderlineActive: boolean = false;

  $: editorHeight = `${rows * 24}px`;

  onMount(async () => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Underline,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Placeholder.configure({ placeholder })
      ],
      content: value || '<p></p>',
      editorProps: {
        attributes: {
          class: classNames
        }
      },
      onUpdate: ({ editor }) => {
        value = editor.getHTML();
        isBoldActive = editor.isActive('bold');
        isItalicActive = editor.isActive('italic');
        isUnderlineActive = editor.isActive('underline');
      },
      onSelectionUpdate: ({ editor }) => {
        isBoldActive = editor.isActive('bold');
        isItalicActive = editor.isActive('italic');
        isUnderlineActive = editor.isActive('underline');
      }
    });
    await tick();
    isBoldActive = editor.isActive('bold');
    isItalicActive = editor.isActive('italic');
    isUnderlineActive = editor.isActive('underline');
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function toggleBold() {
    editor.chain().focus().toggleBold().run();
    isBoldActive = editor.isActive('bold');
  }

  function toggleItalic() {
    editor.chain().focus().toggleItalic().run();
    isItalicActive = editor.isActive('italic');
  }

  function toggleUnderline() {
    editor.chain().focus().toggleUnderline().run();
    isUnderlineActive = editor.isActive('underline');
  }

  function addBulletPoint() {
    const { state } = editor;
    const { selection } = state;
    const currentNode = state.doc.nodeAt(selection.from);

    if (currentNode && currentNode.textContent.trim().length > 0) {
      editor.chain().focus().insertContent('\n• ').run();
    } else {
      editor.chain().focus().insertContent('• ').run();
    }
  }

  function setTextAlign(alignment: string) {
    editor.chain().focus().setTextAlign(alignment).run();
  }
</script>

<div class="editor-container w-full">
  <div class="toolbar mb-2 flex flex-wrap gap-1.5">
    <button
      onclick={toggleBold}
      class="rounded-md border px-2 py-1 text-xs font-semibold transition-colors
        {isBoldActive
        ? 'border-primary/40 bg-primary/15 text-primary'
        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}"
      aria-pressed={isBoldActive}><b>B</b></button
    >
    <button
      onclick={toggleItalic}
      class="rounded-md border px-2 py-1 text-xs font-semibold transition-colors
        {isItalicActive
        ? 'border-primary/40 bg-primary/15 text-primary'
        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}"
      aria-pressed={isItalicActive}><i>I</i></button
    >
    <button
      onclick={toggleUnderline}
      class="rounded-md border px-2 py-1 text-xs font-semibold transition-colors
        {isUnderlineActive
        ? 'border-primary/40 bg-primary/15 text-primary'
        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}"
      aria-pressed={isUnderlineActive}><u>U</u></button
    >
    <span class="mx-1 w-px self-stretch bg-border"></span>
    <button
      onclick={addBulletPoint}
      class="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >Bullet</button
    >
    <button
      onclick={() => setTextAlign('left')}
      class="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >Align Left</button
    >
    <button
      onclick={() => setTextAlign('center')}
      class="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >Align Center</button
    >
    <button
      onclick={() => setTextAlign('right')}
      class="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >Align Right</button
    >
  </div>
  <div class="rounded-lg border border-border bg-background">
    <div
      bind:this={element}
      style="width:100%;height:{editorHeight};overflow-y:auto;"
      class="prose prose-sm dark:prose-invert max-w-none px-1"
    ></div>
  </div>
</div>

<style>
  :global(.ProseMirror) {
    height: 100%;
    outline: none;
    border: none;
    padding: 0.5rem;
  }

  :global(.ProseMirror p) {
    margin: 0;
  }
</style>
