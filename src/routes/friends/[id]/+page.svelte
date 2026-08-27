<script>
  let { data } = $props();
  let activeTab = $state('decks');

  // Trade filters
  let tradeFilters = $state({ q: '', foil: '', price: '' });

  let filteredTrades = $derived(() => {
    let result = data.sharedTrades;

    if (tradeFilters.q) {
      const q = tradeFilters.q.toLowerCase();
      result = result.filter((t) => t.card.name.toLowerCase().includes(q));
    }
    if (tradeFilters.foil === 'foil') {
      result = result.filter((t) => t.foil);
    } else if (tradeFilters.foil === 'nonfoil') {
      result = result.filter((t) => !t.foil);
    }
    if (tradeFilters.price) {
      result = result.filter((t) => {
        if (t.price == null) return false;
        switch (tradeFilters.price) {
          case 'under1': return t.price < 1;
          case '1to5': return t.price >= 1 && t.price < 5;
          case '5to20': return t.price >= 5 && t.price < 20;
          case '20plus': return t.price >= 20;
          default: return true;
        }
      });
    }

    return result;
  });

  let filteredTradeValue = $derived(
    filteredTrades().reduce((sum, t) => sum + (t.price != null ? t.price * t.quantity : 0), 0)
  );

  function clearTradeFilters() {
    tradeFilters = { q: '', foil: '', price: '' };
  }
</script>

<svelte:head>
  <title>{data.friend.name}'s Profile - Sorcery TCG</title>
</svelte:head>

<div class="container friend-profile">
  <a href="/friends" class="back-link">&larr; Friends</a>

  <div class="profile-header">
    {#if data.friend.image}
      <img src={data.friend.image} alt={data.friend.name} class="avatar" />
    {:else}
      <div class="avatar-placeholder">{(data.friend.name || '?')[0].toUpperCase()}</div>
    {/if}
    <h1>{data.friend.name}</h1>
  </div>

  <nav class="tabs">
    <button class="tab" class:active={activeTab === 'decks'} onclick={() => { activeTab = 'decks'; }}>
      Decks ({data.sharedDecks.length})
    </button>
    <button class="tab" class:active={activeTab === 'cubes'} onclick={() => { activeTab = 'cubes'; }}>
      Cubes ({data.sharedCubes.length})
    </button>
    <button class="tab" class:active={activeTab === 'collection'} onclick={() => { activeTab = 'collection'; }}>
      Collection
    </button>
    <button class="tab" class:active={activeTab === 'trades'} onclick={() => { activeTab = 'trades'; }}>
      Trade Binder
    </button>
  </nav>

  <div class="tab-content">
    {#if activeTab === 'decks'}
      {#if data.sharedDecks.length > 0}
        <div class="item-grid">
          {#each data.sharedDecks as deck}
            <a href="/decks/{deck.slug}" class="item-card">
              <h3>{deck.name}</h3>
              <span class="item-meta">{deck.format} · {deck.visibility}</span>
            </a>
          {/each}
        </div>
      {:else}
        <p class="empty">No shared decks</p>
      {/if}

    {:else if activeTab === 'cubes'}
      {#if data.sharedCubes.length > 0}
        <div class="item-grid">
          {#each data.sharedCubes as cube}
            <a href="/cubes/{cube.slug}" class="item-card">
              <h3>{cube.name}</h3>
              <span class="item-meta">{cube.visibility}</span>
            </a>
          {/each}
        </div>
      {:else}
        <p class="empty">No shared cubes</p>
      {/if}

    {:else if activeTab === 'collection'}
      {#if data.canSeeCollection}
        {#if data.sharedCollection.length > 0}
          <p class="collection-stats">{data.sharedCollection.length} unique cards · {data.sharedCollection.reduce((s, i) => s + i.quantity, 0)} total</p>
          <div class="collection-grid">
            {#each data.sharedCollection as item}
              <a href="/cards/{item.card.slug}" class="collection-card">
                <div class="collection-img">
                  {#if item.card.image_url}
                    <img src={item.card.image_url} alt={item.card.name} loading="lazy" />
                  {:else}
                    <div class="img-placeholder">{item.card.name}</div>
                  {/if}
                </div>
                <div class="collection-info">
                  <span class="collection-name">{item.card.name}</span>
                  <span class="collection-qty">{item.quantity}x</span>
                </div>
              </a>
            {/each}
          </div>
        {:else}
          <p class="empty">Empty collection</p>
        {/if}
      {:else}
        <p class="not-shared">Not shared with you</p>
      {/if}

    {:else if activeTab === 'trades'}
      {#if data.canSeeTrades}
        {#if data.sharedTrades.length > 0}
          {#if filteredTradeValue > 0}
            <p class="collection-stats">
              {filteredTrades().length}{#if filteredTrades().length !== data.sharedTrades.length} of {data.sharedTrades.length}{/if} cards
              <span class="section-value">&middot; ${filteredTradeValue.toFixed(2)} market value</span>
            </p>
          {/if}
          <div class="filters-bar">
            <input
              type="search"
              class="input search-input"
              placeholder="Search by name..."
              bind:value={tradeFilters.q}
            />
            <div class="segmented-control">
              <button class="seg-btn" class:active={tradeFilters.foil === ''} onclick={() => { tradeFilters.foil = ''; }}>All</button>
              <button class="seg-btn" class:active={tradeFilters.foil === 'nonfoil'} onclick={() => { tradeFilters.foil = 'nonfoil'; }}>Non-Foil</button>
              <button class="seg-btn" class:active={tradeFilters.foil === 'foil'} onclick={() => { tradeFilters.foil = 'foil'; }}>Foil</button>
            </div>
            <div class="segmented-control">
              <button class="seg-btn" class:active={tradeFilters.price === ''} onclick={() => { tradeFilters.price = ''; }}>All</button>
              <button class="seg-btn" class:active={tradeFilters.price === 'under1'} onclick={() => { tradeFilters.price = 'under1'; }}>&lt; $1</button>
              <button class="seg-btn" class:active={tradeFilters.price === '1to5'} onclick={() => { tradeFilters.price = '1to5'; }}>$1&ndash;5</button>
              <button class="seg-btn" class:active={tradeFilters.price === '5to20'} onclick={() => { tradeFilters.price = '5to20'; }}>$5&ndash;20</button>
              <button class="seg-btn" class:active={tradeFilters.price === '20plus'} onclick={() => { tradeFilters.price = '20plus'; }}>$20+</button>
            </div>
            <button class="btn btn-secondary btn-sm" onclick={clearTradeFilters}>Clear</button>
          </div>

          {#if filteredTrades().length > 0}
            <div class="trade-list">
              {#each filteredTrades() as trade}
                <div class="trade-card">
                  <a href="/cards/{trade.card.slug}" class="trade-image">
                    {#if trade.card.image_url}
                      <img src={trade.card.image_url} alt={trade.card.name} loading="lazy" />
                    {:else}
                      <div class="trade-placeholder">{trade.card.name}</div>
                    {/if}
                  </a>
                  <div class="trade-info">
                    <a href="/cards/{trade.card.slug}" class="trade-name">
                      {trade.card.name}
                      {#if trade.foil}<span class="foil-badge">FOIL</span>{/if}
                    </a>
                    <span class="trade-meta">{trade.quantity}x · {trade.card.type || ''}</span>
                    {#if trade.price != null}
                      <span class="trade-market">Market: ${trade.price.toFixed(2)}{#if trade.quantity > 1} · ${(trade.price * trade.quantity).toFixed(2)} total{/if}{#if trade.foil} (foil){/if}</span>
                    {/if}
                    {#if trade.expected_value}
                      <span class="trade-value">Value: {trade.expected_value}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty">No trades match your filters.</p>
          {/if}
        {:else}
          <p class="empty">Nothing for trade</p>
        {/if}
      {:else}
        <p class="not-shared">Not shared with you</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .friend-profile { padding: 2rem 1rem; max-width: 800px; }
  .back-link { font-size: 0.85rem; color: var(--color-text-muted); }

  .profile-header { display: flex; align-items: center; gap: 1rem; margin: 1rem 0 1.5rem; }
  .avatar { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }
  .avatar-placeholder { width: 60px; height: 60px; border-radius: 50%; background-color: var(--color-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 600; }
  .profile-header h1 { margin: 0; }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--color-border);
    margin-bottom: 1.5rem;
  }

  .tab {
    padding: 0.75rem 1.25rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
  }

  .tab:hover {
    color: var(--color-text);
  }

  .tab.active {
    color: var(--color-text);
    border-bottom-color: var(--color-primary);
    font-weight: 500;
  }

  .tab-content {
    min-height: 200px;
  }

  .item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
  .item-card { display: block; padding: 0.75rem 1rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); text-decoration: none; transition: border-color 0.2s; }
  .item-card:hover { border-color: var(--color-primary); }
  .item-card h3 { margin: 0 0 0.2rem; font-size: 0.9rem; color: var(--color-text); }
  .item-meta { font-size: 0.7rem; color: var(--color-text-muted); text-transform: uppercase; }

  .list { display: flex; flex-direction: column; gap: 0.2rem; max-height: 500px; overflow-y: auto; }
  .list-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.5rem; font-size: 0.85rem; border-radius: var(--radius-sm); }
  .list-row:hover { background-color: var(--color-bg-tertiary); }
  .qty { color: var(--color-text-muted); font-weight: 600; min-width: 25px; }
  .value { margin-left: auto; font-size: 0.75rem; color: var(--color-accent); }

  .not-shared { color: var(--color-text-muted); font-size: 0.9rem; font-style: italic; padding: 2rem 0; text-align: center; }
  .empty { color: var(--color-text-muted); font-size: 0.9rem; padding: 2rem 0; text-align: center; }

  .collection-stats { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 1rem; }
  .collection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; }
  .collection-card { display: block; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; text-decoration: none; transition: border-color 0.15s, transform 0.15s; }
  .collection-card:hover { border-color: var(--color-primary); transform: translateY(-2px); }
  .collection-img { aspect-ratio: 2.5/3.5; overflow: hidden; background-color: var(--color-surface); }
  .collection-img img { width: 100%; height: 100%; object-fit: cover; }
  .img-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--color-text-muted); padding: 0.5rem; text-align: center; }
  .collection-info { padding: 0.4rem 0.5rem; display: flex; justify-content: space-between; align-items: center; }
  .collection-name { font-size: 0.75rem; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .collection-qty { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 600; }

  .trade-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .trade-card { display: flex; gap: 1rem; padding: 0.75rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .trade-image { width: 70px; flex-shrink: 0; }
  .trade-image img { width: 100%; border-radius: var(--radius-sm); }
  .trade-placeholder { width: 70px; height: 98px; background-color: var(--color-surface); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: var(--color-text-muted); text-align: center; padding: 0.25rem; }
  .trade-info { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }
  .trade-name { font-weight: 600; font-size: 0.9rem; color: var(--color-text); text-decoration: none; }
  .trade-name:hover { color: var(--color-primary-hover); }
  .trade-meta { font-size: 0.8rem; color: var(--color-text-muted); }
  .trade-detail { font-size: 0.8rem; color: var(--color-text-muted); }
  .trade-value { font-size: 0.8rem; color: var(--color-accent); font-weight: 500; }
  .trade-market { font-size: 0.8rem; font-weight: 600; color: var(--color-success); }
  .section-value { color: var(--color-success); font-weight: 600; }
  .foil-badge { display: inline-block; margin-left: 0.4rem; padding: 0.05rem 0.35rem; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; border-radius: var(--radius-sm); background: linear-gradient(135deg, #b07ddb, #7c9cbf, #4a8fa8); color: white; vertical-align: middle; }

  .filters-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; padding: 0.75rem 1rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .filters-bar .search-input { flex: 1; min-width: 160px; }
  .segmented-control { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
  .seg-btn { padding: 0.45rem 0.75rem; background: none; border: none; border-right: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
  .seg-btn:last-child { border-right: none; }
  .seg-btn:hover { background-color: var(--color-bg-tertiary); }
  .seg-btn.active { background-color: var(--color-primary); color: white; font-weight: 500; }
  .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }

  @media (max-width: 600px) {
    .tabs { overflow-x: auto; }
    .tab { padding: 0.6rem 0.75rem; font-size: 0.8rem; white-space: nowrap; }
  }
</style>
