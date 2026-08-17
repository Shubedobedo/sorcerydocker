<script>
  import { goto } from '$app/navigation';

  let { data } = $props();

  // Build curiosa.io slug from card name (lowercase, hyphens to underscores, spaces to underscores)
  let curiosaSlug = $derived(
    data.card?.name
      ?.toLowerCase()
      .replace(/['']/g, '')
      .replace(/-/g, '_')
      .replace(/[^a-z0-9\s_]/g, '')
      .replace(/\s+/g, '_') || ''
  );

  // Side panel state
  let showAddToDeck = $state(false);
  let panelMode = $state('deck'); // 'deck' or 'collection'
  let selectedDeckId = $state('');
  let addMessage = $state('');
  let showNewDeck = $state(false);
  let newDeckName = $state('');
  let newDeckFormat = $state('standard');

  // Collection state
  let collectionQty = $state(1);
  let collectionSet = $state('');

  async function addToDeck() {
    if (!selectedDeckId) return;
    const zone = data.card.type === 'Site' ? 'atlas' : 'spellbook';

    const res = await fetch(`/api/decks/${selectedDeckId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: data.card.id, zone })
    });

    if (res.ok) {
      addMessage = `Added to deck!`;
      setTimeout(() => { addMessage = ''; }, 2000);
    } else {
      addMessage = 'Failed to add';
    }
  }

  async function createAndAdd() {
    if (!newDeckName.trim()) return;

    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeckName, format: newDeckFormat })
    });

    if (res.ok) {
      const deck = await res.json();
      const zone = data.card.type === 'Site' ? 'atlas' : 'spellbook';

      await fetch(`/api/decks/${deck.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_id: data.card.id, zone })
      });

      addMessage = `Created "${newDeckName}" and added card!`;
      newDeckName = '';
      showNewDeck = false;
      setTimeout(() => { addMessage = ''; }, 3000);
    }
  }

  async function addToCollection() {
    const res = await fetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: data.card.id,
        set_id: collectionSet || data.card.set_id,
        set_name: collectionSet
          ? data.card.sets?.find((s) => s.id === collectionSet)?.name || data.card.set_name
          : data.card.set_name,
        quantity: collectionQty
      })
    });

    if (res.ok) {
      const result = await res.json();
      addMessage = `Added to collection! (${result.quantity}x)`;
      setTimeout(() => { addMessage = ''; }, 2000);
    } else {
      addMessage = 'Failed to add';
    }
  }
</script>

<svelte:head>
  <title>{data.card?.name || 'Card'} - Sorcery TCG</title>
</svelte:head>

<div class="container">
  {#if data.card}
    <div class="card-detail">
      <div class="card-image">
        {#if data.images?.length > 0}
          <img src={data.images[0].image_url} alt={data.card.name} />
        {:else}
          <div class="no-image">No image available</div>
        {/if}

        {#if data.session?.user}
          <button class="btn btn-secondary add-deck-btn" onclick={() => { panelMode = 'deck'; showAddToDeck = true; }}>
            + Add to Deck
          </button>
          <button class="btn btn-secondary add-deck-btn" onclick={() => { panelMode = 'collection'; showAddToDeck = true; }}>
            + Add to Collection
          </button>
        {/if}
      </div>
      <div class="card-info">
        <h1>{data.card.name}</h1>
        <dl class="card-meta">
          <dt>Type</dt>
          <dd>{data.card.type || 'Unknown'}</dd>

          {#if data.card.subtype}
            <dt>Subtype</dt>
            <dd>{data.card.subtype}</dd>
          {/if}

          <dt>Cost</dt>
          <dd>{data.card.cost ?? 'N/A'}</dd>

          <dt>Elements</dt>
          <dd>{JSON.parse(data.card.elements || '[]').join(', ') || 'None'}</dd>

          <dt>Rarity</dt>
          <dd>{data.card.rarity || 'Unknown'}</dd>

          <dt>Set</dt>
          <dd>
            {#if data.card.set_ids}
              {@const setIds = JSON.parse(data.card.set_ids || '[]')}
              {#if setIds.length > 0}
                {#each setIds as setId, i}
                  <span class="set-badge">{setId}</span>{#if i < setIds.length - 1}{' '}{/if}
                {/each}
              {:else}
                <span class="set-badge">{data.card.set_name || 'Unknown'}</span>
              {/if}
            {:else}
              <span class="set-badge">{data.card.set_name || 'Unknown'}</span>
            {/if}
          </dd>

          {#if data.session?.user}
            <dt>In Collection</dt>
            <dd>{data.ownedCount || 0}</dd>
          {/if}

          {#if data.card.power !== null}
            <dt>Power</dt>
            <dd>{data.card.power}</dd>
          {/if}

          {#if data.card.toughness !== null}
            <dt>Toughness</dt>
            <dd>{data.card.toughness}</dd>
          {/if}
        </dl>

        <a
          href="https://curiosa.io/cards/{curiosaSlug}"
          target="_blank"
          rel="noopener noreferrer"
          class="official-link"
        >
          View on Curiosa.io &rarr;
        </a>

        {#if data.card.description}
          <div class="card-description">
            <h2>Card Text</h2>
            <p>{data.card.description}</p>
          </div>
        {/if}

        {#if data.images?.length > 1}
          <div class="alt-arts">
            <h2>Art Versions</h2>
            <div class="art-grid">
              {#each data.images as img}
                <div class="art-thumb">
                  <img src={img.image_url} alt="{data.card.name} - {img.art_type}" />
                  <span>{img.art_type} ({img.set_name})</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if data.session?.user && showAddToDeck}
      <aside class="deck-side-panel">
        <div class="side-panel-header">
          <h2>{panelMode === 'deck' ? 'Add to Deck' : 'Add to Collection'}</h2>
          <button class="close-btn" onclick={() => { showAddToDeck = false; }}>&times;</button>
        </div>

        <div class="panel-tabs">
          <button class="panel-tab" class:active={panelMode === 'deck'} onclick={() => { panelMode = 'deck'; addMessage = ''; }}>Deck</button>
          <button class="panel-tab" class:active={panelMode === 'collection'} onclick={() => { panelMode = 'collection'; addMessage = ''; }}>Collection</button>
        </div>

        {#if panelMode === 'deck'}
          {#if data.userDecks.length > 0}
            <div class="existing-deck">
              <select class="select" bind:value={selectedDeckId}>
                <option value="">Choose a deck...</option>
                {#each data.userDecks as deck}
                  <option value={deck.id}>{deck.name} ({deck.format})</option>
                {/each}
              </select>
              <button class="btn btn-primary btn-sm" onclick={addToDeck} disabled={!selectedDeckId}>
                Add
              </button>
            </div>
          {/if}

          <div class="divider">
            <span>or</span>
          </div>

          <button class="btn btn-secondary new-deck-btn" onclick={() => { showNewDeck = !showNewDeck; }}>
            {showNewDeck ? 'Cancel' : 'Create New Deck'}
          </button>

          {#if showNewDeck}
            <div class="new-deck-form">
              <input type="text" class="input" placeholder="Deck name" bind:value={newDeckName} />
              <select class="select" bind:value={newDeckFormat}>
                <option value="standard">Standard</option>
                <option value="freeform">Freeform</option>
              </select>
              <button class="btn btn-primary btn-sm" onclick={createAndAdd}>Create & Add</button>
            </div>
          {/if}
        {:else}
          <div class="collection-form">
            <label class="form-label">Quantity</label>
            <div class="qty-row">
              <button class="qty-btn" onclick={() => { if (collectionQty > 1) collectionQty--; }}>-</button>
              <span class="qty">{collectionQty}</span>
              <button class="qty-btn" onclick={() => { collectionQty++; }}>+</button>
            </div>

            <button class="btn btn-primary collection-add-btn" onclick={addToCollection}>
              Add {collectionQty}x to Collection
            </button>
          </div>
        {/if}

        {#if addMessage}
          <p class="add-message">{addMessage}</p>
        {/if}
      </aside>
    {/if}
  {:else}
    <p>Card not found.</p>
  {/if}
</div>

<style>
  .card-detail {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 2rem;
    padding: 2rem 0;
  }

  .card-image img {
    width: 100%;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .no-image {
    width: 100%;
    aspect-ratio: 2.5/3.5;
    background-color: var(--color-surface);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .card-info h1 {
    font-family: var(--font-heading);
    color: var(--color-accent);
    margin: 0 0 1rem;
  }

  .card-meta {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0.5rem;
    margin: 0;
  }

  .card-meta dt {
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .card-meta dd {
    margin: 0;
  }

  .set-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.8rem;
    text-transform: capitalize;
  }

  .card-description {
    margin-top: 1.5rem;
  }

  .official-link {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    color: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    transition: background-color 0.2s;
  }

  .official-link:hover {
    background-color: rgba(201, 166, 60, 0.1);
    text-decoration: none;
  }

  .add-deck-btn {
    width: 100%;
    margin-top: 0.75rem;
    justify-content: center;
  }

  .deck-side-panel {
    position: fixed;
    top: var(--nav-height);
    right: 0;
    width: 300px;
    height: calc(100vh - var(--nav-height));
    background-color: var(--color-bg-secondary);
    border-left: 1px solid var(--color-border);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    z-index: 50;
    box-shadow: var(--shadow-lg);
  }

  .side-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .side-panel-header h2 {
    margin: 0;
    font-size: 1rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-text);
  }

  .existing-deck {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: var(--color-border);
  }

  .new-deck-btn {
    width: 100%;
    justify-content: center;
  }

  .panel-tabs {
    display: flex;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .panel-tab {
    flex: 1;
    padding: 0.5rem;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .panel-tab:hover {
    background-color: var(--color-bg-tertiary);
  }

  .panel-tab.active {
    background-color: var(--color-surface);
    color: var(--color-text);
    font-weight: 500;
  }

  .collection-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .qty-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .qty-row .qty {
    font-size: 1.1rem;
    min-width: 30px;
    text-align: center;
  }

  .qty-row .qty-btn {
    width: 30px;
    height: 30px;
    font-size: 1rem;
  }

  .collection-add-btn {
    width: 100%;
    justify-content: center;
  }

  .new-deck-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .add-message {
    font-size: 0.8rem;
    color: var(--color-success);
    margin: 0;
  }

  .btn-sm {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
  }

  @media (max-width: 768px) {
    .deck-side-panel {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: auto;
      max-height: 60vh;
      border-left: none;
      border-top: 1px solid var(--color-border);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
  }

  .card-description h2 {
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  .alt-arts {
    margin-top: 1.5rem;
  }

  .art-grid {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .art-thumb {
    text-align: center;
  }

  .art-thumb img {
    width: 120px;
    border-radius: var(--radius-md);
  }

  .art-thumb span {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
  }

  @media (max-width: 768px) {
    .card-detail {
      grid-template-columns: 1fr;
    }

    .card-image {
      max-width: 280px;
      margin: 0 auto;
    }
  }
</style>
