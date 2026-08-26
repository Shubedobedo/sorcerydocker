<script>
  let { data } = $props();

  // Filters
  let filters = $state({ type: '', element: '', rarity: '', set: '', cost: '', minQty: '', maxQty: '', q: '' });

  const types = ['Minion', 'Magic', 'Aura', 'Artifact', 'Site', 'Avatar'];
  const elements = ['Air', 'Earth', 'Fire', 'Water'];
  const rarities = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];

  let filteredCollection = $derived(() => {
    let result = data.collection;

    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter((item) => item.card.name.toLowerCase().includes(q));
    }
    if (filters.type) {
      result = result.filter((item) => item.card.type === filters.type);
    }
    if (filters.element) {
      result = result.filter((item) => {
        const elems = JSON.parse(item.card.elements || '[]');
        return elems.includes(filters.element);
      });
    }
    if (filters.rarity) {
      result = result.filter((item) => item.card.rarity === filters.rarity);
    }
    if (filters.set) {
      result = result.filter((item) => item.set_id === filters.set || item.card.set_id === filters.set);
    }
    if (filters.cost) {
      result = result.filter((item) => item.card.cost === parseInt(filters.cost));
    }
    if (filters.minQty) {
      const min = parseInt(filters.minQty);
      result = result.filter((item) => item.quantity >= min);
    }
    if (filters.maxQty) {
      const max = parseInt(filters.maxQty);
      result = result.filter((item) => item.quantity <= max);
    }

    return result;
  });

  let filteredTotal = $derived(filteredCollection().reduce((sum, item) => sum + item.quantity, 0));
  let totalCards = $derived(data.collection.reduce((sum, item) => sum + item.quantity, 0));

  function clearFilters() {
    filters = { type: '', element: '', rarity: '', set: '', cost: '', minQty: '', maxQty: '', q: '' };
  }

  // Apply URL params as initial filters
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  onMount(() => {
    const params = $page.url.searchParams;
    if (params.get('type')) filters.type = params.get('type');
    if (params.get('element')) filters.element = params.get('element');
    if (params.get('rarity')) filters.rarity = params.get('rarity');
    if (params.get('set')) filters.set = params.get('set');
    if (params.get('cost')) filters.cost = params.get('cost');
    if (params.get('minQty')) filters.minQty = params.get('minQty');
    if (params.get('maxQty')) filters.maxQty = params.get('maxQty');
    if (params.get('q')) filters.q = params.get('q');
  });
</script>

<svelte:head>
  <title>{data.owner.name}'s Collection - Sorcery TCG</title>
</svelte:head>

<div class="container collection-page">
  <div class="collection-header">
    <div>
      <a href="/friends" class="back-link">&larr; Back</a>
      <h1>{data.owner.name}'s Collection</h1>
      <div class="collection-stats">
        <span>{data.collection.length} unique cards</span>
        <span>&middot;</span>
        <span>{totalCards} total</span>
      </div>
    </div>
  </div>

  <div class="filters-bar">
    <div class="filter-row">
      <input
        type="search"
        class="input search-input"
        placeholder="Search by name..."
        bind:value={filters.q}
      />
      <select class="select" bind:value={filters.type}>
        <option value="">All Types</option>
        {#each types as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
      <select class="select" bind:value={filters.element}>
        <option value="">All Elements</option>
        {#each elements as el}
          <option value={el}>{el}</option>
        {/each}
      </select>
      <select class="select" bind:value={filters.rarity}>
        <option value="">All Rarities</option>
        {#each rarities as r}
          <option value={r}>{r}</option>
        {/each}
      </select>
    </div>
    <div class="filter-row">
      <select class="select" bind:value={filters.set}>
        <option value="">All Sets</option>
        {#each data.allSets as s}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
      <select class="select" bind:value={filters.cost}>
        <option value="">Any Cost</option>
        {#each Array.from({ length: 11 }, (_, i) => i) as c}
          <option value={c.toString()}>{c}</option>
        {/each}
      </select>
      <input type="number" class="input qty-filter" placeholder="Min qty" min="1" bind:value={filters.minQty} />
      <input type="number" class="input qty-filter" placeholder="Max qty" min="1" bind:value={filters.maxQty} />
      <button class="btn btn-secondary" onclick={clearFilters}>Clear</button>
    </div>
    <p class="results-count">Showing {filteredCollection().length} cards ({filteredTotal} total)</p>
  </div>

  {#if filteredCollection().length > 0}
    <div class="collection-grid">
      {#each filteredCollection() as item (item.id)}
        <div class="collection-card">
          <a href="/cards/{item.card.slug}" class="card-image-link">
            {#if item.card.image_url}
              <img src={item.card.image_url} alt={item.card.name} loading="lazy" />
            {:else}
              <div class="card-placeholder">{item.card.name}</div>
            {/if}
          </a>
          <div class="collection-card-info">
            <span class="card-name">{item.card.name}</span>
            {#if item.set_name}
              <span class="card-set">{item.set_name}</span>
            {/if}
            <span class="qty-display">{item.quantity}x</span>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">No cards match your filters.</p>
  {/if}
</div>

<style>
  .collection-page { padding: 2rem 1rem; }
  .collection-header { margin-bottom: 1.5rem; }
  .collection-header h1 { margin: 0.25rem 0 0; }
  .back-link { font-size: 0.85rem; color: var(--color-text-muted); }
  .collection-stats { display: flex; gap: 0.5rem; color: var(--color-text-muted); font-size: 0.875rem; margin-top: 0.25rem; }

  .filters-bar { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; padding: 1rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
  .filter-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .search-input { flex: 1; min-width: 180px; }
  .qty-filter { width: 90px; }
  .results-count { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }

  .collection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
  .collection-card { background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
  .card-image-link { display: block; aspect-ratio: 2.5 / 3.5; overflow: hidden; background-color: var(--color-surface); }
  .card-image-link img { width: 100%; height: 100%; object-fit: cover; }
  .card-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--color-text-muted); padding: 0.5rem; text-align: center; }
  .collection-card-info { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .card-name { font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-set { font-size: 0.7rem; color: var(--color-text-muted); }
  .qty-display { font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600; }
  .empty { color: var(--color-text-muted); }

  @media (max-width: 768px) {
    .collection-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
    .filter-row { flex-direction: column; }
    .search-input, .select { width: 100%; min-width: unset; }
  }
</style>
