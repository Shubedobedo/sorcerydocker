<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let { data } = $props();

  let filters = $state({ ...data.filters });
  let cardList = $state([...data.cards]);
  let currentPage = $state(1);
  let loading = $state(false);
  let hasMore = $state(data.cards.length === 24);
  let sentinel = $state(null);

  const types = ['Minion', 'Magic', 'Aura', 'Artifact', 'Site', 'Avatar'];
  const elements = ['Air', 'Earth', 'Fire', 'Water'];
  const rarities = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];

  function buildParams(page) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.type) params.set('type', filters.type);
    if (filters.element) params.set('element', filters.element);
    if (filters.rarity) params.set('rarity', filters.rarity);
    if (filters.set) params.set('set', filters.set);
    if (filters.cost) params.set('cost', filters.cost);
    if (filters.subtype) params.set('subtype', filters.subtype);
    params.set('page', page.toString());
    return params;
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;

    const nextPage = currentPage + 1;
    const params = buildParams(nextPage);

    try {
      const res = await fetch(`/api/cards?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        cardList = [...cardList, ...json.cards];
        hasMore = json.hasMore;
        currentPage = nextPage;
      }
    } catch (err) {
      console.error('Failed to load more cards:', err);
    } finally {
      loading = false;
    }
  }

  function applyFilters() {
    const params = buildParams(1);
    params.delete('page');
    goto(`/cards?${params.toString()}`, { invalidateAll: true });
  }

  function clearFilters() {
    filters = { q: '', type: '', element: '', rarity: '', set: '', cost: '', subtype: '' };
    goto('/cards');
  }

  // Reset card list when server data changes (filters applied via navigation)
  $effect(() => {
    // Use $page.url.search as the trigger to ensure we always reset on URL change
    const _url = $page.url.search;
    cardList = [...data.cards];
    filters = { ...data.filters };
    currentPage = 1;
    hasMore = data.cards.length === 24;
  });

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );

    $effect(() => {
      if (sentinel) {
        observer.observe(sentinel);
        return () => observer.unobserve(sentinel);
      }
    });

    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Card Database - Sorcery TCG</title>
</svelte:head>

<div class="container cards-page">
  <h1>Card Database</h1>

  <div class="filters-bar">
    <div class="filter-row">
      <input
        type="search"
        class="input search-input"
        placeholder="Search by name..."
        bind:value={filters.q}
        onkeydown={(e) => { if (e.key === 'Enter') applyFilters(); }}
      />
      <button class="btn btn-primary" onclick={applyFilters}>Search</button>
      <button class="btn btn-secondary" onclick={clearFilters}>Clear</button>
    </div>

    <div class="filter-row">
      <select class="select" bind:value={filters.type} onchange={applyFilters}>
        <option value="">All Types</option>
        {#each types as t}
          <option value={t}>{t}</option>
        {/each}
      </select>

      <select class="select" bind:value={filters.element} onchange={applyFilters}>
        <option value="">All Elements</option>
        {#each elements as el}
          <option value={el}>{el}</option>
        {/each}
      </select>

      <select class="select" bind:value={filters.rarity} onchange={applyFilters}>
        <option value="">All Rarities</option>
        {#each rarities as r}
          <option value={r}>{r}</option>
        {/each}
      </select>

      <select class="select" bind:value={filters.set} onchange={applyFilters}>
        <option value="">All Sets</option>
        {#each data.allSets as s}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>

      <select class="select" bind:value={filters.cost} onchange={applyFilters}>
        <option value="">Any Cost</option>
        {#each Array.from({ length: 11 }, (_, i) => i) as c}
          <option value={c.toString()}>{c}</option>
        {/each}
      </select>
    </div>
  </div>

  <p class="results-count">{data.totalCards} cards found</p>

  {#if cardList.length > 0}
    <div class="card-grid">
      {#each cardList as card (card.id)}
        <a href="/cards/{card.slug}" class="card-tile">
          <div class="card-image-wrapper">
            {#if card.image_url}
              <img
                src={card.image_url}
                alt={card.name}
                loading="lazy"
                onerror={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
              />
              <div class="card-placeholder" style="display:none">
                <span class="placeholder-name">{card.name}</span>
              </div>
            {:else}
              <div class="card-placeholder">
                <span class="placeholder-name">{card.name}</span>
              </div>
            {/if}
          </div>
          <div class="card-info">
            <span class="card-name">{card.name}</span>
            <span class="card-meta">
              {card.type || ''}
              {#if card.cost !== null} &middot; {card.cost}{/if}
            </span>
          </div>
        </a>
      {/each}
    </div>

    <div class="scroll-sentinel" bind:this={sentinel}>
      {#if loading}
        <div class="loading-indicator">Loading more cards...</div>
      {/if}
    </div>

    {#if !hasMore && cardList.length > 0}
      <p class="end-message">All cards loaded</p>
    {/if}
  {:else}
    <p class="no-results">No cards found matching your filters.</p>
  {/if}
</div>

<style>
  .cards-page {
    padding: 2rem 1rem;
  }

  h1 {
    margin: 0 0 1.5rem;
  }

  .filters-bar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .filter-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .search-input {
    flex: 1;
    min-width: 200px;
  }

  .select {
    min-width: 130px;
  }

  .results-count {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
  }

  .card-tile {
    display: block;
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    transition: transform 0.15s, border-color 0.15s;
  }

  .card-tile:hover {
    transform: translateY(-3px);
    border-color: var(--color-primary);
    text-decoration: none;
  }

  .card-image-wrapper {
    aspect-ratio: 2.5 / 3.5;
    overflow: hidden;
    background-color: var(--color-surface);
    position: relative;
  }

  .owned-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background-color: var(--color-primary);
    color: white;
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
    z-index: 1;
  }

  .card-image-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    text-align: center;
  }

  .placeholder-name {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .card-info {
    padding: 0.5rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .card-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .scroll-sentinel {
    height: 1px;
  }

  .loading-indicator {
    text-align: center;
    padding: 2rem 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .end-message {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 2rem 0;
  }

  .no-results {
    text-align: center;
    color: var(--color-text-muted);
    padding: 3rem 0;
  }

  @media (max-width: 768px) {
    .card-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.75rem;
    }

    .filter-row {
      flex-direction: column;
    }

    .search-input,
    .select {
      width: 100%;
      min-width: unset;
    }
  }
</style>
