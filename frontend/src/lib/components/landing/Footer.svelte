<script lang="ts">
  import { Rocket } from 'lucide-svelte';
</script>

<!-- Social links and legal pages are deliberately absent: no accounts or
     /legal routes exist yet, and dead links are worse than none. -->
<footer class="bg-[var(--lu-ink)]/60">
  <div class="mx-auto w-[min(72rem,88vw)] py-16">
    <div class="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
      <div>
        <div class="flex items-center gap-2">
          <Rocket class="h-4 w-4 -rotate-12 text-[#6366f1]" />
          <span class="lu-d-xw text-xl text-white">LaunchUp</span>
        </div>
        <p
          class="mt-3 max-w-[34ch] text-[14.5px] leading-[1.65] text-[var(--lu-mute)]"
        >
          Fueling startup success — readiness assessment, incubation and
          acceleration for early-stage founders.
        </p>
      </div>

      <nav aria-label="Platform">
        <h2 class="lu-d-md text-[14px] text-white">Platform</h2>
        <ul class="mt-4 space-y-2.5 text-[14.5px] text-[var(--lu-mute)]">
          <li>
            <a href="#howitwork" class="transition-colors hover:text-[var(--lu-indigo-lite)]"
              >How it Works</a
            >
          </li>
          <li>
            <a href="#aboutus" class="transition-colors hover:text-[var(--lu-indigo-lite)]"
              >About LaunchUp</a
            >
          </li>
          <li>
            <a href="#aboutus" class="transition-colors hover:text-[var(--lu-indigo-lite)]"
              >Readiness scales</a
            >
          </li>
        </ul>
      </nav>

      <nav aria-label="Account">
        <h2 class="lu-d-md text-[14px] text-white">Account</h2>
        <ul class="mt-4 space-y-2.5 text-[14.5px] text-[var(--lu-mute)]">
          <li>
            <a
              data-sveltekit-reload
              href="/register"
              class="transition-colors hover:text-[var(--lu-indigo-lite)]"
            >
              Create an account
            </a>
          </li>
          <li>
            <a
              data-sveltekit-reload
              href="/login"
              class="transition-colors hover:text-[var(--lu-indigo-lite)]"
            >
              Login
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <div class="mt-14 border-t border-[var(--lu-line)] pt-7">
      <p class="lu-num text-[13.5px] text-[var(--lu-mute)]">
        © {new Date().getFullYear()} LaunchUp
      </p>
    </div>
  </div>
</footer>
