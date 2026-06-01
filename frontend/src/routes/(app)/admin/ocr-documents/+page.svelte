<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Scan, Eye, ArrowLeft, ArrowRight, Image as ImageIcon, Search, CheckCircle, AlertTriangle, PenTool, ExternalLink } from 'lucide-svelte';
  import { env } from '$env/dynamic/public';
  const PUBLIC_API_URL = env.PUBLIC_API_URL || '';

  export let data: { ocrs: any[]; access: string };
  let ocrs = data.ocrs ?? [];
  let togglingId: number | null = null;

  // filtering & pagination
  let filter = '';
  let page = 1;
  const perPage = 12;

  $: filtered = ocrs.filter(o => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (String(o.originalFilename || '').toLowerCase().includes(f) || String(o.extractedText || '').toLowerCase().includes(f));
  });

  $: totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  $: pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  // preview modal
  let previewOpen = false;
  let previewUrl: string | null = null;

  function openPreview(url: string) {
    previewUrl = url;
    previewOpen = true;
  }

  async function toggleSketch(doc: any) {
    togglingId = doc.id;
    try {
      const res = await fetch(`${PUBLIC_API_URL}/admin/ocr-documents/flag/${doc.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.access}` },
        body: JSON.stringify({ sketchDetected: !doc.sketchDetected, note: 'Admin override' })
      });
      if (res.ok) {
        const updated = await res.json();
        ocrs = ocrs.map(o => (o.id === updated.id ? updated : o));
      }
    } catch (e) {
    } finally {
      togglingId = null;
    }
  }

</script>

<div class="space-y-8 max-w-[90rem] mx-auto pb-12">
  <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
        <Scan class="h-8 w-8 text-primary opacity-80" />
        OCR Documents
      </h1>
      <p class="mt-2 text-muted-foreground">
        Review document legibility, sketch detection, and computer vision parsed text.
      </p>
    </div>
    <div class="relative w-full md:w-72">
      <Search class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/50" />
      <Input placeholder="Filter filename or text..." bind:value={filter} class="pl-9 bg-card/50 backdrop-blur-sm border-border/50" />
    </div>
  </div>

  <div class="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
    <div class="bg-muted/40 flex items-center justify-between border-b border-border/50 px-6 py-4">
      <h2 class="font-semibold text-foreground flex items-center gap-2">
        <Scan class="h-4 w-4 text-muted-foreground" />
        Processed Documents
      </h2>
      <span class="text-xs font-medium text-muted-foreground bg-background/50 px-2.5 py-1 rounded-full border border-border/30">
        {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
      </span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-muted/40 border-b border-border/50">
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">ID</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Filename</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Sketch Analysis</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Legibility</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground">Dimensions</th>
            <th class="px-6 py-4 text-left font-semibold text-muted-foreground w-1/3">Extracted Text</th>
            <th class="px-6 py-4 text-right font-semibold text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if pageItems.length === 0}
            <tr>
              <td colspan="7" class="px-6 py-16 text-center text-muted-foreground">
                <div class="flex flex-col items-center justify-center space-y-4">
                  <div class="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center border border-border/50">
                    <Scan class="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p class="text-lg font-medium">No documents found</p>
                  <p class="text-sm opacity-80">Adjust your filters or wait for OCR processing.</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each pageItems as o}
              <tr class="hover:bg-muted/30 group border-b border-border/50 transition-colors last:border-0">
                <td class="px-6 py-5 font-mono text-xs text-muted-foreground/70">#{o.id}</td>
                <td class="px-6 py-5">
                  <div class="flex items-center gap-2 max-w-[12rem]">
                    <ImageIcon class="h-4 w-4 text-muted-foreground shrink-0" />
                    <span class="font-medium text-foreground truncate" title={o.originalFilename}>{o.originalFilename || 'Unknown'}</span>
                  </div>
                </td>
                <td class="px-6 py-5">
                  <div class="flex flex-col gap-1">
                    {#if o.sketchDetected}
                      <Badge variant="destructive" class="w-fit shadow-none bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                        <PenTool class="h-3 w-3 mr-1" /> Sketch Detected
                      </Badge>
                    {:else}
                      <Badge variant="secondary" class="w-fit shadow-none text-muted-foreground bg-muted text-[10px]">
                        No Sketch
                      </Badge>
                    {/if}
                    {#if o.sketchConfidence}
                      <span class="text-[10px] text-muted-foreground font-mono ml-1 opacity-70">
                        Conf: {(o.sketchConfidence * 100).toFixed(1)}%
                      </span>
                    {/if}
                  </div>
                </td>
                <td class="px-6 py-5">
                  {#if o.legibilityStatus?.toLowerCase() === 'readable'}
                    <div class="flex items-center gap-1.5 text-green-500 font-medium text-xs">
                      <CheckCircle class="h-3.5 w-3.5" /> Readable
                    </div>
                  {:else}
                    <div class="flex items-center gap-1.5 text-amber-500 font-medium text-xs">
                      <AlertTriangle class="h-3.5 w-3.5" /> {o.legibilityStatus || 'Unknown'}
                    </div>
                  {/if}
                </td>
                <td class="px-6 py-5 text-muted-foreground text-xs font-mono">
                  {#if o.imageWidth && o.imageHeight}
                    {o.imageWidth}×{o.imageHeight}
                  {:else}
                    -
                  {/if}
                </td>
                <td class="px-6 py-5">
                  <div class="text-xs text-muted-foreground line-clamp-2 max-w-sm bg-background/50 p-2 rounded border border-border/30" title={o.extractedText}>
                    {o.extractedText || 'No text extracted.'}
                  </div>
                </td>
                <td class="px-6 py-5 text-right">
                  <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button
                      variant={o.sketchDetected ? 'outline' : 'secondary'}
                      size="sm"
                      class="h-8 text-xs {o.sketchDetected ? 'text-muted-foreground' : 'bg-secondary/60 hover:bg-secondary'}"
                      onclick={() => toggleSketch(o)}
                      disabled={togglingId === o.id}
                    >
                      {#if togglingId === o.id}
                        <span class="animate-pulse">...</span>
                      {:else}
                        <PenTool class="h-3 w-3 mr-1.5" /> {o.sketchDetected ? 'Unmark' : 'Mark Sketch'}
                      {/if}
                    </Button>
                    
                    {#if o.sourcePath}
                      <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-primary" onclick={() => openPreview(o.sourcePath)}>
                        <Eye class="h-4 w-4" />
                      </Button>
                      <a href={o.sourcePath} target="_blank" class="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                        <ExternalLink class="h-4 w-4" />
                      </a>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    
    <!-- Pagination Footer -->
    {#if totalPages > 1}
      <div class="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-4">
        <p class="text-xs text-muted-foreground">
          Showing <span class="font-medium text-foreground">{(page - 1) * perPage + 1}</span> to <span class="font-medium text-foreground">{Math.min(page * perPage, filtered.length)}</span> of <span class="font-medium text-foreground">{filtered.length}</span> results
        </p>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="h-8 w-8 p-0" disabled={page <= 1} onclick={() => page--}>
            <ArrowLeft class="h-4 w-4" />
          </Button>
          <div class="text-xs font-medium px-2 py-1 bg-background rounded-md border border-border/50">
            Page {page} of {totalPages}
          </div>
          <Button variant="outline" size="sm" class="h-8 w-8 p-0" disabled={page >= totalPages} onclick={() => page++}>
            <ArrowRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <Dialog.Root bind:open={previewOpen}>
    <Dialog.Content class="max-w-4xl p-1 bg-transparent border-none shadow-none">
      <div class="relative rounded-lg overflow-hidden bg-background/50 backdrop-blur-md border border-border/50 flex items-center justify-center p-4">
        {#if previewUrl}
          <img src={previewUrl} alt="Document preview" class="max-w-full max-h-[80vh] object-contain rounded shadow-lg" />
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>
</div>
