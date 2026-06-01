<script lang="ts">
  import { AdminHeader } from '$lib/components/shared';
  let { data, children } = $props();
</script>

<AdminHeader user={data.user} />
<div class="mx-auto w-full max-w-7xl p-4 pt-4">
  {@render children()}
</div>
