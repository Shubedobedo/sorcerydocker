<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let { data } = $props();

  // Filters
  let filters = $state({ types: [], elements: [], rarities: [], sets: [], cost: '', q: '', completion: '' });

  const typeOptions = ['Minion', 'Magic', 'Aura', 'Artifact', 'Site', 'Avatar'];
  const elementOptions = ['Air', 'Earth', 'Fire', 'Water'];
  const rarityOptions = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];
  const maxCopies = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };

  // Dropdown state
  let openDropdown = $state('');

  function toggleDropdown(name) {
    openDropdown = openDropdown === name ? '' : name;
  }

  function toggleFilter(field, value) {
    const arr = filters[field];
    if (arr.includes(value)) {
      filters[field] = arr.filter((v) => v !== value);
    } else {
      filters[field] = [...arr, value];
    }
    filters = { ...filters };
  }

  function dropdownLabel(field, allLabel) {
    const selected = filters[field];
    if (!selected || selected.length === 0) return allLabel;
    if (selected.length === 1) return selected[0];
    return `${selected.length} selected`;
  }

  let filteredCollection = $derived(() => {
    let result = data.collection;

    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter((item) => item.card.name.toLowerCase().includes(q));
    }
    if (filters.types.length) {
      result = result.filter((item) => filters.types.includes(item.card.type));
    }
    if (filters.elements.length) {
      result = result.filter((item) => {
        const elems = JSON.parse(item.card.elements || '[]');
        return filters.elements.some((el) => elems.includes(el));
      });
    }
    if (filters.rarities.length) {
      result = result.filter((item) => filters.rarities.includes(item.card.rarity));
    }
    if (filters.sets.length) {
      result = result.filter((item) => {
        const cardSets = JSON.parse(item.card.set_ids || '[]');
        return filters.sets.some((s) => cardSets.includes(s));
      });
    }
    if (filters.cost) {
      result = result.filter((item) => item.card.cost === parseInt(filters.cost));
    }
    if (filters.completion === 'missing') {
      result = result.filter((item) => {
        const max = item.card.type === 'Avatar' ? 1 : (maxCopies[item.card.rarity] || 4);
        return item.quantity < max;
      });
    } else if (filters.completion === 'extra') {
      result = result.filter((item) => {
        const max = item.card.type === 'Avatar' ? 1 : (maxCopies[item.card.rarity] || 4);
        return item.quantity > max;
      });
    }

    return result;
  });

  let filteredTotal = $derived(filteredCollection().reduce((sum, item) => sum + item.quantity, 0));
  let totalCards = $derived(data.collection.reduce((sum, item) => sum + item.quantity, 0));

  function clearFilters() {
    filters = { types: [], elements: [], rarities: [], sets: [], cost: '', q: '', completion: '' };
  }

  onMount(() => {
    const params = $page.url.searchParams;
    filters = {
      types: params.get('type') ? params.get('type').split(',') : [],
      elements: params.get('element') ? params.get('element').split(',') : [],
      rarities: params.get('rarity') ? params.get('rarity').split(',') : [],
      sets: params.get('set') ? params.get('set').split(',') : [],
      cost: params.get('cost') || '',
      q: params.get('q') || '',
      completion: params.get('completion') || ''
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.multi-select')) {
        openDropdown = '';
      }
    });
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
    </div>
    <div class="filter-row">
      <div class="multi-select">
        <button class="multi-select-trigger" onclick={() => toggleDropdown('types')}>
          {dropdownLabel('types', 'All Types')}
          <span class="caret">&#9662;</span>
        </button>
        {#if openDropdown === 'types'}
          <div class="multi-select-dropdown">
            {#each typeOptions as t}
              <label class="checkbox-item">
                <input type="checkbox" checked={filters.types.includes(t)} onchange={() => toggleFilter('types', t)} />
                <span>{t}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="multi-select">
        <button class="multi-select-trigger" onclick={() => toggleDropdown('elements')}>
          {dropdownLabel('elements', 'All Elements')}
          <span class="caret">&#9662;</span>
        </button>
        {#if openDropdown === 'elements'}
          <div class="multi-select-dropdown">
            {#each elementOptions as el}
              <label class="checkbox-item">
                <input type="checkbox" checked={filters.elements.includes(el)} onchange={() => toggleFilter('elements', el)} />
                <span>{el}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="multi-select">
        <button class="multi-select-trigger" onclick={() => toggleDropdown('rarities')}>
          {dropdownLabel('rarities', 'All Rarities')}
          <span class="caret">&#9662;</span>
        </button>
        {#if openDropdown === 'rarities'}
          <div class="multi-select-dropdown">
            {#each rarityOptions as r}
              <label class="checkbox-item">
                <input type="checkbox" checked={filters.rarities.includes(r)} onchange={() => toggleFilter('rarities', r)} />
                <span>{r}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="multi-select">
        <button class="multi-select-trigger" onclick={() => toggleDropdown('sets')}>
          {dropdownLabel('sets', 'All Sets')}
          <span class="caret">&#9662;</span>
        </button>
        {#if openDropdown === 'sets'}
          <div class="multi-select-dropdown">
            {#each data.allSets as s}
              <label class="checkbox-item">
                <input type="checkbox" checked={filters.sets.includes(s.id)} onchange={() => toggleFilter('sets', s.id)} />
                <span>{s.name}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <select class="select" bind:value={filters.cost}>
        <option value="">Any Cost</option>
        {#each Array.from({ length: 11 }, (_, i) => i) as c}
          <option value={c.toString()}>{c}</option>
        {/each}
      </select>

      <div class="segmented-control">
        <button class="seg-btn" class:active={filters.completion === ''} onclick={() => { filters.completion = ''; }}>All</button>
        <button class="seg-btn" class:active={filters.completion === 'missing'} onclick={() => { filters.completion = 'missing'; }}>Missing</button>
        <button class="seg-btn" class:active={filters.completion === 'extra'} onclick={() => { filters.completion = 'extra'; }}>Extra</button>
      </div>

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
  .results-count { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }

  /* Multi-select checkbox dropdown */
  .multi-select { position: relative; }
  .multi-select-trigger { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); font-size: 0.85rem; cursor: pointer; white-space: nowrap; min-width: 120px; }
  .multi-select-trigger:hover { border-color: var(--color-primary); }
  .caret { font-size: 0.7rem; color: var(--color-text-muted); margin-left: auto; }
  .multi-select-dropdown { position: absolute; top: calc(100% + 4px); left: 0; min-width: 100%; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); z-index: 100; max-height: 240px; overflow-y: auto; padding: 0.25rem 0; }
  .checkbox-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; cursor: pointer; font-size: 0.8rem; white-space: nowrap; }
  .checkbox-item:hover { background-color: var(--color-bg-tertiary); }
  .checkbox-item input[type="checkbox"] { accent-color: var(--color-primary); }

  /* Segmented control */
  .segmented-control { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
  .seg-btn { padding: 0.45rem 0.75rem; background: none; border: none; border-right: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
  .seg-btn:last-child { border-right: none; }
  .seg-btn:hover { background-color: var(--color-bg-tertiary); }
  .seg-btn.active { background-color: var(--color-primary); color: white; font-weight: 500; }

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
    .search-input { width: 100%; min-width: unset; }
  }
</style>
