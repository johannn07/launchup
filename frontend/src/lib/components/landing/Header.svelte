<script lang="ts">
  import { onMount } from 'svelte';
  import { toggleMode } from 'mode-watcher';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Sun, Moon, Rocket} from 'lucide-svelte';

  let isBlurred = false;
  let activeSection = $state('hero');

  function handleScroll() {
    isBlurred = window.scrollY > 100;

    const sections = ['hero', 'howitwork', 'aboutus'];
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 80 && rect.bottom >= 80) {
          activeSection = id;
          break;
        }
      }
    }
  }

  onMount(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  });
</script>

<header
  class="fixed left-1/2 top-0 z-10 flex h-16 w-screen -translate-x-1/2 justify-center transition-all duration-300 ease-in-out"
  class:border-b={isBlurred}
  class:backdrop-blur-lg={isBlurred}
>
  <nav class="flex h-16 w-4/5 items-center p-[var(--navbar-padding,0.5rem)] px-0">
    <div class="flex flex-1 cursor-pointer items-center gap-2">
      <a href="/" class="flex cursor-pointer items-center gap-2 text-xl font-black normal-case">
        <Rocket class="h-4 w-4 -rotate-12 text-[#6366f1]" />
        <span class="text-white">LaunchUp</span>
      </a>
    </div>
    <div class="flex-none font-medium">
      <ul class="flex flex-1 cursor-pointer items-center gap-7 text-[15px]">
        <li class="active:scale-95">
          <a
            href="#hero"
            class="transition-colors duration-200"
            class:text-[#6366f1]={activeSection === 'hero'}
            class:font-semibold={activeSection === 'hero'}
          >Home</a>
        </li>
        <li class="active:scale-95">
          <a
            href="#howitwork"
            class="transition-colors duration-200"
            class:text-[#6366f1]={activeSection === 'howitwork'}
            class:font-semibold={activeSection === 'howitwork'}
          >How it Works</a>
        </li>
        <li class="active:scale-95">
          <a
            href="#aboutus"
            class="transition-colors duration-200"
            class:text-[#6366f1]={activeSection === 'aboutus'}
            class:font-semibold={activeSection === 'aboutus'}
          >About Us</a>
        </li>
        <li class="active:scale-95">
          <a data-sveltekit-reload href="/login">Login</a>
        </li>
        <li>
          <Button
            onclick={toggleMode}
            variant="ghost"
            size="icon"
            class="hover:text-flutter-blue hover:bg-transparent"
          >
            <Sun class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span class="sr-only">Toggle theme</span>
          </Button>
        </li>
      </ul>
    </div>
  </nav>
</header>