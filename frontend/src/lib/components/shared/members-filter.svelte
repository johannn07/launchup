<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';

  let {
    members = $bindable(),
    toggleMemberSelection,
    selectedMembers
  } = $props();
</script>

<div class="flex items-center" role="group" aria-label="Filter by member">
  {#each members as member, index}
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger
          class="flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors duration-quick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] {index !==
          members.length - 1
            ? '-mr-1'
            : ''} {selectedMembers.includes(member.userId)
            ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
            : 'border-[#2b3a5c] bg-[#111b2e] text-[#c7d2fe] hover:border-[#4f46e5]/70'}"
          aria-pressed={selectedMembers.includes(member.userId)}
          onclick={() => toggleMemberSelection(index)}
        >
          {member.firstName.charAt(0)}
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom">
          <p>{member.firstName} {member.lastName}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {/each}
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger
        class="-ml-1 flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors duration-quick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#818cf8] {selectedMembers.includes(
          999
        )
          ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
          : 'border-dashed border-[#2b3a5c] bg-[#111b2e] text-[#54648a] hover:border-[#4f46e5]/70'}"
        aria-pressed={selectedMembers.includes(999)}
        onclick={() => toggleMemberSelection(999)}
      >
        ?
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom">
        <p>Unassigned</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
</div>
