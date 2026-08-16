<script>
  import '../app.css';
  import Nav from '$lib/components/Nav.svelte';

  let { data, children } = $props();
</script>

<svelte:head>
  <title>Sorcery TCG</title>
</svelte:head>

<Nav session={data.session} />

<main class="main-content">
  {@render children()}
</main>

<style>
  .main-content {
    padding-top: var(--nav-height);
    min-height: calc(100vh - var(--nav-height));
  }
</style>
