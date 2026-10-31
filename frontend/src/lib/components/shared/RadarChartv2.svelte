<script lang="ts">
  import Chart from 'chart.js/auto';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';

  let {
    min,
    max,
    labels,
    data,
    id
  }: { min: number; max: number; labels: any; data: any; id: number } =
    $props();

  let chart: Chart | null = null;
  let ctx: HTMLCanvasElement;

  const createChart = () => {
    if (!browser) return;

    ctx = document.getElementById(`chart${id}`) as HTMLCanvasElement;
    if (!ctx) return;

    if (chart) {
      chart.destroy();
    }

    // Brand colours for a dark page. Chart.js defaults (black grid, white tick
    // boxes) were invisible or glaring on navy, and also printed into the PDF.
    const grid = '#1f2c47';
    const chartData = {
      labels,
      datasets: [
        {
          label: 'Readiness level',
          data,
          fill: true,
          backgroundColor: 'rgba(99, 102, 241, 0.18)',
          borderColor: '#818cf8',
          borderWidth: 2,
          pointBackgroundColor: '#818cf8',
          pointBorderColor: '#0b1220',
          pointRadius: 4,
          pointHoverRadius: 5
        }
      ]
    };

    chart = new Chart(ctx, {
      type: 'radar',
      data: chartData,
      options: {
        scales: {
          r: {
            min,
            max,
            grid: { color: grid },
            angleLines: { color: grid },
            ticks: {
              stepSize: 1,
              color: '#54648a',
              backdropColor: 'transparent',
              font: { size: 11 }
            },
            pointLabels: {
              color: '#c3ced9',
              // Smaller on narrow canvases so "Organizational" is not clipped.
              font: (c) => ({
                size: c.chart.width < 360 ? 11 : 13,
                family: "'Public Sans', ui-sans-serif, system-ui"
              })
            }
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  };

  onMount(() => {
    createChart();
    // Labels are measured at draw time; redraw once the brand font is in.
    document.fonts?.ready.then(() => chart?.update());
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
    }
  });

  $effect(() => {
    if (browser && data && labels) {
      createChart();
    }
  });
</script>

<canvas id={`chart${id}`}></canvas>
