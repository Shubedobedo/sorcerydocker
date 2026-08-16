<script>
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let addZone = $state('spellbook');
  let debounceTimer;

  // Reactive counts
  let atlasCount = $derived(data.atlas.reduce((sum, dc) => sum + dc.quantity, 0));
  let spellbookCount = $derived(data.spellbook.reduce((sum, dc) => sum + dc.quantity, 0));

  async function searchCards() {
    clearTimeout(debounceTimer);
    if (searchQuery.length < 2) {
      searchResults = [];
      return;
    }
    debounceTimer = setTimeout(async () => {
      searching = true;
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      if (res.ok) {
        searchResults = await res.json();
      }
      searching = false;
    }, 300);
  }

  async function addCard(card) {
    // Sites always go to atlas, everything else goes to the selected zone
    const zone = card.type === 'Site' ? 'atlas' : addZone;
    const res = await fetch(`/api/decks/${data.deck.id}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: card.id || card.slug, zone })
    });
    if (res.ok) {
      await invalidateAll();
    }
  }

  async function removeCard(cardId, zone) {
    const res = await fetch(`/api/decks/${data.deck.id}/cards`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, zone })
    });
    if (res.ok) {
      await invalidateAll();
    }
  }

  async function changeQuantity(cardId, zone, quantity) {
    const res = await fetch(`/api/decks/${data.deck.id}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, zone, quantity })
    });
    if (res.ok) {
      await invalidateAll();
    }
  }

  async function updateDeck(field, value) {
    await fetch(`/api/decks/${data.deck.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
  }
</script>

<svelte:head>
  <title>Edit: {data.deck.name} - Sorcery TCG</title>
</svelte:head>

<div class="container editor-page">
  <div class="editor-header">
    <div>
      <a href="/decks/{data.deck.slug}" class="back-link">&larr; Back to deck</a>
      <h1>{data.deck.name}</h1>
      <span class="deck-format">{data.deck.format}</span>
    </div>
  </div>

  <div class="editor-layout">
    <aside class="search-panel">
      <h2>Add Cards</h2>

      <div class="zone-picker">
        <label>
          <input type="radio" bind:group={addZone} value="spellbook" /> Spellbook
        </label>
        <label>
          <input type="radio" bind:group={addZone} value="atlas" /> Atlas
        </label>
      </div>

      <input
        type="search"
        class="input"
        placeholder="Search cards..."
        bind:value={searchQuery}
        oninput={searchCards}
      />

      {#if searchResults.length > 0}
        <ul class="search-results">
          {#each searchResults as card}
            <li>
              <button class="result-item" onclick={() => addCard(card)}>
                <span class="result-name">{card.name}</span>
                <span class="result-meta">{card.type} &middot; {card.set_name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    <main class="deck-panel">
      <section class="zone">
        <h2>Atlas <span class="zone-count">({atlasCount}/30)</span></h2>
        {#if data.atlas.length > 0}
          <div class="card-list">
            {#each data.atlas as dc}
              <div class="deck-card-row">
                {#if dc.card.image_url}
                  <img src={dc.card.image_url} alt={dc.card.name} class="deck-card-thumb" />
                {/if}
                <div class="deck-card-info">
                  <span class="deck-card-name">{dc.card.name}</span>
                  <span class="deck-card-meta">{dc.card.type || ''}</span>
                </div>
                <div class="deck-card-controls">
                  <button class="qty-btn" onclick={() => changeQuantity(dc.card_id, 'atlas', dc.quantity - 1)}>-</button>
                  <span class="qty">{dc.quantity}</span>
                  <button class="qty-btn" onclick={() => changeQuantity(dc.card_id, 'atlas', dc.quantity + 1)}>+</button>
                  <button class="remove-btn" onclick={() => removeCard(dc.card_id, 'atlas')}>&times;</button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">No sites in your atlas yet.</p>
        {/if}
      </section>

      <section class="zone">
        <h2>Spellbook <span class="zone-count">({spellbookCount}/60)</span></h2>
        {#if data.spellbook.length > 0}
          <div class="card-list">
            {#each data.spellbook as dc}
              <div class="deck-card-row">
                {#if dc.card.image_url}
                  <img src={dc.card.image_url} alt={dc.card.name} class="deck-card-thumb" />
                {/if}
                <div class="deck-card-info">
                  <span class="deck-card-name">{dc.card.name}</span>
                  <span class="deck-card-meta">{dc.card.type || ''} {dc.card.cost !== null ? `· ${dc.card.cost}` : ''}</span>
                </div>
                <div class="deck-card-controls">
                  <button class="qty-btn" onclick={() => changeQuantity(dc.card_id, 'spellbook', dc.quantity - 1)}>-</button>
                  <span class="qty">{dc.quantity}</span>
                  <button class="qty-btn" onclick={() => changeQuantity(dc.card_id, 'spellbook', dc.quantity + 1)}>+</button>
                  <button class="remove-btn" onclick={() => removeCard(dc.card_id, 'spellbook')}>&times;</button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">No cards in your spellbook yet.</p>
        {/if}
      </section>
    </main>
  </div>
</div>

<style>
  .editor-page {
    padding: 2rem 1rem;
  }

  .editor-header {
    margin-bottom: 1.5rem;
  }

  .back-link {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .editor-header h1 {
    margin: 0.25rem 0 0;
  }

  .deck-format {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .editor-layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1.5rem;
  }

  .search-panel {
    position: sticky;
    top: calc(var(--nav-height) + 1rem);
    align-self: start;
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .search-panel h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .zone-picker {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }

  .zone-picker label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
  }

  .search-results {
    list-style: none;
    padding: 0;
    margin-top: 0.5rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .result-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.5rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    text-align: left;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .result-item:hover {
    background-color: var(--color-bg-tertiary);
  }

  .result-name {
    font-weight: 500;
  }

  .result-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .deck-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .zone {
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .zone h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .zone-count {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .deck-card-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-sm);
  }

  .deck-card-row:hover {
    background-color: var(--color-bg-tertiary);
  }

  .deck-card-thumb {
    width: 32px;
    height: 44px;
    object-fit: cover;
    border-radius: 3px;
  }

  .deck-card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .deck-card-name {
    font-size: 0.85rem;
    font-weight: 500;
  }

  .deck-card-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .deck-card-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .qty-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .qty-btn:hover {
    background-color: var(--color-surface);
  }

  .qty {
    width: 20px;
    text-align: center;
    font-size: 0.85rem;
  }

  .remove-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-danger);
    font-size: 1.1rem;
    cursor: pointer;
    margin-left: 0.25rem;
  }

  .empty {
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  @media (max-width: 768px) {
    .editor-layout {
      grid-template-columns: 1fr;
    }

    .search-panel {
      position: static;
    }
  }
</style>
