<script lang="ts">
  let {
    member
  }: { member?: { firstName: string; lastName?: string | null } | null } =
    $props();

  const full = $derived(
    member ? `${member.firstName} ${member.lastName ?? ''}`.trim() : ''
  );
</script>

<!-- Same avatar as the header: one indigo tint, not a random colour per name. -->
<span class="flex min-w-0 items-center gap-1.5">
  <span
    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold {member
      ? 'border-[#4f46e5]/50 bg-[#4f46e5]/20 text-white'
      : 'border-dashed border-[#2b3a5c] text-[#54648a]'}"
    aria-hidden="true"
  >
    {member ? member.firstName.charAt(0) : '?'}
  </span>
  <span class="truncate" title={full || undefined}
    >{member ? full : 'Unassigned'}</span
  >
</span>
