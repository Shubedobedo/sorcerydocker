<script>
  import { goto, invalidateAll } from '$app/navigation';

  let { data } = $props();

  let showPacks = $state(false);
  let viewMode = $state('text'); // 'grid' or 'text'
  let packSettings = $state({ packsPerPlayer: 3, cardsPerPack: 15, players: 2 });
  let packs = $state([]);
  let packError = $state('');
  let generatingPacks = $state(false);
  let creatingDeck = $state(false);
  let newDeckName = $state('');
  let showDeckPanel = $state(false);

  // Deck mode state
  let activeDeckId = $state(null);
  let activeDeckName = $state('');
  let deckCards = $state({}); // { card_id: { atlas: qty, spellbook: qty } }
  let deckError = $state('');
  let loadingDeck = $state(false);

  // Computed deck counts
  let deckAtlasCount = $derived(Object.values(deckCards).reduce((sum, z) => sum + (z.atlas || 0), 0));
  let deckSpellbookCount = $derived(Object.values(deckCards).reduce((sum, z) => sum + (z.spellbook || 0), 0));
  let deckTotalCount = $derived(deckAtlasCount + deckSpellbookCount);

  // Card image hover preview state
  let hoveredCard = $state(null);
  let hoverPos = $state({ x: 0, y: 0 });
  let hoverTimeout = $state(null);

  function showCardPreview(e, card) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      hoveredCard = card;
      updateHoverPos(e);
    }, 200);
  }

  function updateHoverPos(e) {
    const x = e.clientX + 16;
    const y = e.clientY - 100;
    // Keep within viewport
    const maxX = window.innerWidth - 320;
    const maxY = window.innerHeight - 440;
    hoverPos = { x: Math.min(x, maxX), y: Math.max(8, Math.min(y, maxY)) };
  }

  function hideCardPreview() {
    clearTimeout(hoverTimeout);
    hoveredCard = null;
  }

  // Group cards by element then by spells vs sites for text view
  // Multi-element cards go into a separate "Multi" group
  // Avatars get their own section
  let avatarCards = $derived(() => {
    return data.pool.filter((cc) => cc.card.type === 'Avatar');
  });

  let cardsByElement = $derived(() => {
    const groups = { Air: { spells: [], sites: [] }, Earth: { spells: [], sites: [] }, Fire: { spells: [], sites: [] }, Water: { spells: [], sites: [] }, Multi: { spells: [], sites: [] }, None: { spells: [], sites: [] } };
    for (const cc of data.pool) {
      if (cc.card.type === 'Avatar') continue; // handled separately
      const elements = JSON.parse(cc.card.elements || '[]');
      const isSite = cc.card.type === 'Site';
      const bucket = isSite ? 'sites' : 'spells';

      if (elements.length === 0) {
        groups.None[bucket].push(cc);
      } else if (elements.length > 1) {
        groups.Multi[bucket].push(cc);
      } else {
        const el = elements[0];
        if (groups[el]) groups[el][bucket].push(cc);
      }
    }
    return groups;
  });

  async function generatePacks() {
    generatingPacks = true;
    packError = '';

    const res = await fetch(`/api/cubes/${data.cube.id}/packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packSettings)
    });

    const json = await res.json();
    if (res.ok) {
      packs = json.packs;
    } else {
      packError = json.error;
    }
    generatingPacks = false;
  }

  async function updateVisibility(visibility) {
    await fetch(`/api/cubes/${data.cube.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility })
    });
    window.location.reload();
  }

  async function createCubeDeck() {
    if (!newDeckName.trim()) return;
    creatingDeck = true;

    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newDeckName,
        format: 'cube',
        cube_id: data.cube.id
      })
    });

    if (res.ok) {
      const deck = await res.json();
      newDeckName = '';
      // Activate deck mode with the new deck
      await selectDeck(deck.id, deck.name);
      // Reload to get the updated linkedDecks list
      await invalidateAll();
    }
    creatingDeck = false;
  }

  async function selectDeck(deckId, deckName) {
    activeDeckId = deckId;
    activeDeckName = deckName;
    loadingDeck = true;
    deckError = '';

    // Fetch current deck cards to know what's already in it
    const res = await fetch(`/api/decks/${deckId}/cards/list`);
    if (res.ok) {
      const cards = await res.json();
      const map = {};
      for (const dc of cards) {
        if (!map[dc.card_id]) map[dc.card_id] = { atlas: 0, spellbook: 0 };
        map[dc.card_id][dc.zone] = dc.quantity;
      }
      deckCards = map;
    }
    loadingDeck = false;
  }

  function exitDeckMode() {
    activeDeckId = null;
    activeDeckName = '';
    deckCards = {};
    deckError = '';
  }

  async function addCardToDeck(card) {
    if (!activeDeckId) return;
    deckError = '';

    const zone = card.type === 'Site' ? 'atlas' : 'spellbook';
    const res = await fetch(`/api/decks/${activeDeckId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: card.id, zone })
    });

    if (res.ok) {
      // Update local state
      if (!deckCards[card.id]) deckCards[card.id] = { atlas: 0, spellbook: 0 };
      deckCards[card.id][zone] = (deckCards[card.id][zone] || 0) + 1;
      deckCards = { ...deckCards }; // trigger reactivity
    } else {
      const err = await res.json();
      deckError = err.error || 'Failed to add card';
      setTimeout(() => { deckError = ''; }, 3000);
    }
  }

  async function removeCardFromDeck(cardId) {
    if (!activeDeckId) return;
    deckError = '';

    const entry = deckCards[cardId];
    if (!entry) return;

    // Remove from whichever zone has quantity
    const zone = entry.spellbook > 0 ? 'spellbook' : 'atlas';
    const newQty = entry[zone] - 1;

    const res = await fetch(`/api/decks/${activeDeckId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, zone, quantity: newQty })
    });

    if (res.ok) {
      if (newQty <= 0) {
        entry[zone] = 0;
      } else {
        entry[zone] = newQty;
      }
      deckCards = { ...deckCards };
    }
  }

  // How many of this card are in the active deck (across zones)
  function deckQtyForCard(cardId) {
    const entry = deckCards[cardId];
    if (!entry) return 0;
    return (entry.atlas || 0) + (entry.spellbook || 0);
  }
</script>

<svelte:head>
  <title>{data.cube.name} - Sorcery TCG</title>
</svelte:head>

<div class="container cube-view">
  <div class="cube-header">
    <div>
      <a href="/cubes" class="back-link">&larr; All Cubes</a>
      <h1>{data.cube.name}</h1>
      <div class="cube-meta">
        <span class="badge">{data.totalCards} cards</span>
        <span class="badge">{data.cube.visibility}</span>
      </div>
    </div>

    <div class="header-actions">
      {#if data.isOwner}
        <a href="/cubes/{data.cube.slug}/edit" class="btn btn-secondary">Edit Settings</a>
        <select class="select" onchange={(e) => updateVisibility(e.target.value)}>
          <option value="private" selected={data.cube.visibility === 'private'}>Private</option>
          <option value="friends" selected={data.cube.visibility === 'friends'}>Friends</option>
          <option value="public" selected={data.cube.visibility === 'public'}>Public</option>
        </select>
      {/if}
      <button class="btn btn-primary" onclick={() => { showPacks = !showPacks; }}>
        {showPacks ? 'Hide Pack Builder' : 'Generate Packs'}
      </button>
      {#if data.session?.user}
        <button class="btn btn-secondary" class:active-deck-mode={activeDeckId} onclick={() => { showDeckPanel = !showDeckPanel; }}>
          {activeDeckId ? `Deck: ${activeDeckName}` : 'Build Deck'}
        </button>
      {/if}
    </div>
  </div>

  {#if showDeckPanel}
    <div class="deck-create-panel">
      {#if activeDeckId}
        <div class="deck-mode-header">
          <div>
            <h2>Deck Mode: {activeDeckName}</h2>
            <p class="deck-mode-stats">
              Atlas: {deckAtlasCount}/30 &middot; Spellbook: {deckSpellbookCount}/60 &middot; Total: {deckTotalCount}/90
            </p>
          </div>
          <div class="deck-mode-actions">
            <a href="/decks/{data.linkedDecks.find(d => d.id === activeDeckId)?.slug}/edit" class="btn btn-secondary btn-sm">Full Editor</a>
            <button class="btn btn-danger btn-sm" onclick={exitDeckMode}>Exit Deck Mode</button>
          </div>
        </div>
        {#if deckError}
          <p class="deck-mode-error">{deckError}</p>
        {/if}
        <p class="deck-mode-hint">Use the + button to add cards to your deck, and the − button to remove them.</p>
      {:else}
        <h2>Build a Deck</h2>
        <div class="deck-create-form">
          <input
            type="text"
            class="input"
            placeholder="New deck name"
            bind:value={newDeckName}
            onkeydown={(e) => { if (e.key === 'Enter') createCubeDeck(); }}
          />
          <button class="btn btn-primary" onclick={createCubeDeck} disabled={creatingDeck || !newDeckName.trim()}>
            {creatingDeck ? 'Creating...' : 'Create'}
          </button>
        </div>

        {#if data.linkedDecks.filter(d => d.isOwn).length > 0}
          <div class="linked-decks">
            <h3>Or select an existing deck</h3>
            <ul class="linked-deck-list">
              {#each data.linkedDecks.filter(d => d.isOwn) as deck}
                <li>
                  <button class="linked-deck-select" onclick={() => selectDeck(deck.id, deck.name)}>
                    <span class="linked-deck-name">{deck.name}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if data.linkedDecks.filter(d => !d.isOwn).length > 0}
          <div class="linked-decks">
            <h3>Other players' decks</h3>
            <ul class="linked-deck-list">
              {#each data.linkedDecks.filter(d => !d.isOwn) as deck}
                <li>
                  <a href="/decks/{deck.slug}" class="linked-deck-link">
                    <span class="linked-deck-name">{deck.name}</span>
                    <span class="linked-deck-owner">{deck.ownerName}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  {#if showPacks}
    <aside class="pack-panel">
      <h2>Pack Configuration</h2>
      <div class="pack-settings">
        <label>
          <span>Players</span>
          <input type="number" class="input" bind:value={packSettings.players} min="1" max="12" />
        </label>
        <label>
          <span>Packs per player</span>
          <input type="number" class="input" bind:value={packSettings.packsPerPlayer} min="1" max="6" />
        </label>
        <label>
          <span>Cards per pack</span>
          <input type="number" class="input" bind:value={packSettings.cardsPerPack} min="5" max="30" />
        </label>
      </div>

      <p class="pack-summary">
        {packSettings.players * packSettings.packsPerPlayer} packs &middot;
        {packSettings.players * packSettings.packsPerPlayer * packSettings.cardsPerPack} cards needed
      </p>

      <button class="btn btn-primary" onclick={generatePacks} disabled={generatingPacks}>
        {generatingPacks ? 'Generating...' : 'Shuffle & Generate'}
      </button>

      {#if packError}
        <p class="pack-error">{packError}</p>
      {/if}

      {#if packs.length > 0}
        <div class="packs-output">
          {#each packs as pack, i}
            <details class="pack-details">
              <summary>Pack {i + 1} ({pack.length} cards)</summary>
              <ul class="pack-cards">
                {#each pack as card}
                  <li>
                    <a href="/cards/{card.slug}">{card.name}</a>
                    <span class="pack-card-meta">{card.type} · {card.rarity}</span>
                  </li>
                {/each}
              </ul>
            </details>
          {/each}
        </div>
      {/if}
    </aside>
  {/if}

  {#if data.pool.length > 0}
    <section class="pool-section">
      <div class="pool-header">
        <h2>Card Pool</h2>
        <div class="view-toggle">
          <button class="toggle-btn" class:active={viewMode === 'grid'} onclick={() => { viewMode = 'grid'; }}>Grid</button>
          <button class="toggle-btn" class:active={viewMode === 'text'} onclick={() => { viewMode = 'text'; }}>List</button>
        </div>
      </div>

      {#if viewMode === 'grid'}
        <div class="pool-grid">
          {#each data.pool as cc}
            <div class="pool-card-wrapper">
              <a href="/cards/{cc.card.slug}" class="pool-card">
                {#if cc.card.image_url}
                  <img src={cc.card.image_url} alt={cc.card.name} loading="lazy" />
                {:else}
                  <div class="pool-placeholder">{cc.card.name}</div>
                {/if}
                {#if cc.quantity > 1}
                  <span class="qty-badge">{cc.quantity}x</span>
                {/if}
              </a>
              {#if activeDeckId}
                <button class="grid-add-btn" onclick={() => addCardToDeck(cc.card)} title="Add to deck">+</button>
                {#if deckQtyForCard(cc.card.id) > 0}
                  <span class="deck-qty-badge">{deckQtyForCard(cc.card.id)}</span>
                  <button class="grid-remove-btn" onclick={() => removeCardFromDeck(cc.card.id)} title="Remove from deck">&minus;</button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="pool-text">
          {#if avatarCards().length > 0}
            <div class="avatar-bar">
              <span class="avatar-label">Avatars</span>
              <div class="avatar-cards">
                {#each avatarCards() as cc}
                  <a href="/cards/{cc.card.slug}" class="avatar-card">
                    {#if cc.card.image_url}
                      <img src={cc.card.image_url} alt={cc.card.name} class="avatar-card-img" />
                    {:else}
                      <div class="avatar-card-placeholder"></div>
                    {/if}
                    <span class="avatar-card-name">{cc.quantity}x {cc.card.name}</span>
                  </a>
                {/each}
              </div>
            </div>
          {/if}
          {#each Object.entries(cardsByElement()) as [element, group]}
            {#if group.spells.length > 0 || group.sites.length > 0}
              <div class="element-group">
                <h3 class="element-heading element-{element.toLowerCase()}">{element} ({group.spells.length + group.sites.length})</h3>

                {#if group.sites.length > 0}
                  <h4 class="sub-heading">Sites ({group.sites.length})</h4>
                  <ul class="element-list">
                    {#each group.sites as cc}
                      <li class:in-deck={activeDeckId && deckQtyForCard(cc.card.id) > 0}>
                        {#if activeDeckId}
                          <button class="add-to-deck-btn" onclick={() => addCardToDeck(cc.card)} title="Add to deck">+</button>
                        {/if}
                        <span class="text-qty">{cc.quantity}x</span>
                        <a href="/cards/{cc.card.slug}" class="text-name"
                           onmouseenter={(e) => showCardPreview(e, cc.card)}
                           onmousemove={(e) => { if (hoveredCard) updateHoverPos(e); }}
                           onmouseleave={hideCardPreview}>{cc.card.name}</a>
                        <span class="text-meta">{cc.card.rarity}</span>
                        {#if activeDeckId && deckQtyForCard(cc.card.id) > 0}
                          <span class="deck-indicator">{deckQtyForCard(cc.card.id)} in deck</span>
                          <button class="remove-from-deck-btn" onclick={() => removeCardFromDeck(cc.card.id)} title="Remove from deck">&minus;</button>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}

                {#if group.spells.length > 0}
                  <h4 class="sub-heading">Spells ({group.spells.length})</h4>
                  <ul class="element-list">
                    {#each group.spells as cc}
                      <li class:in-deck={activeDeckId && deckQtyForCard(cc.card.id) > 0}>
                        {#if activeDeckId}
                          <button class="add-to-deck-btn" onclick={() => addCardToDeck(cc.card)} title="Add to deck">+</button>
                        {/if}
                        <span class="text-qty">{cc.quantity}x</span>
                        <a href="/cards/{cc.card.slug}" class="text-name"
                           onmouseenter={(e) => showCardPreview(e, cc.card)}
                           onmousemove={(e) => { if (hoveredCard) updateHoverPos(e); }}
                           onmouseleave={hideCardPreview}>{cc.card.name}</a>
                        <span class="text-meta">{cc.card.type}{cc.card.cost !== null ? ` · ${cc.card.cost}` : ''} · {cc.card.rarity}</span>
                        {#if activeDeckId && deckQtyForCard(cc.card.id) > 0}
                          <span class="deck-indicator">{deckQtyForCard(cc.card.id)} in deck</span>
                          <button class="remove-from-deck-btn" onclick={() => removeCardFromDeck(cc.card.id)} title="Remove from deck">&minus;</button>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <p class="empty">No cards in this cube yet. {#if data.isOwner}<a href="/cubes/{data.cube.slug}/edit">Configure and generate a pool.</a>{/if}</p>
  {/if}
</div>

{#if hoveredCard?.image_url}
  <div class="card-preview" class:site={hoveredCard.type === 'Site'} style="left: {hoverPos.x}px; top: {hoverPos.y}px;">
    <img src={hoveredCard.image_url} alt={hoveredCard.name} />
  </div>
{/if}

<style>
  .cube-view { padding: 2rem 1rem; }
  .cube-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
  .back-link { font-size: 0.85rem; color: var(--color-text-muted); }
  .cube-header h1 { margin: 0.25rem 0 0.5rem; }
  .cube-meta { display: flex; gap: 0.5rem; }
  .badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; background-color: var(--color-surface); border-radius: var(--radius-sm); text-transform: uppercase; color: var(--color-text-muted); }
  .header-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

  .pack-panel {
    padding: 1.25rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: 1.5rem;
  }
  .pack-panel h2 { margin: 0 0 1rem; font-size: 1rem; }
  .pack-settings { display: flex; gap: 1rem; flex-wrap: wrap; }
  .pack-settings label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .pack-settings .input { width: 80px; }
  .pack-summary { font-size: 0.8rem; color: var(--color-text-muted); margin: 0.75rem 0; }
  .pack-error { font-size: 0.85rem; color: var(--color-danger); margin-top: 0.5rem; }

  .packs-output { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .pack-details { background-color: var(--color-bg-tertiary); border-radius: var(--radius-md); }
  .pack-details summary { padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.85rem; font-weight: 500; }
  .pack-cards { list-style: none; padding: 0.5rem 0.75rem; margin: 0; }
  .pack-cards li { display: flex; justify-content: space-between; padding: 0.2rem 0; font-size: 0.8rem; }
  .pack-card-meta { color: var(--color-text-muted); font-size: 0.7rem; }

  .deck-create-panel {
    padding: 1.25rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: 1.5rem;
  }
  .deck-create-panel h2 { margin: 0 0 0.75rem; font-size: 1rem; }
  .deck-create-form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .deck-create-form .input { flex: 1; min-width: 200px; }
  .deck-mode-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
  .deck-mode-header h2 { margin: 0; font-size: 1rem; }
  .deck-mode-stats { font-size: 0.8rem; color: var(--color-text-muted); margin: 0.25rem 0 0; }
  .deck-mode-actions { display: flex; gap: 0.5rem; }
  .deck-mode-error { font-size: 0.8rem; color: var(--color-danger); margin: 0.5rem 0 0; padding: 0.4rem 0.6rem; background-color: rgba(200, 50, 50, 0.1); border-radius: var(--radius-sm); }
  .deck-mode-hint { font-size: 0.75rem; color: var(--color-text-muted); margin: 0.5rem 0 0; font-style: italic; }
  .active-deck-mode { background-color: #4caf50; color: white; border-color: #4caf50; }
  .linked-decks { margin-top: 1rem; }
  .linked-decks h3 { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 0.5rem; }
  .linked-deck-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .linked-deck-list li { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; background-color: var(--color-bg-tertiary); border-radius: var(--radius-sm); }
  .linked-deck-link { flex: 1; text-decoration: none; display: flex; align-items: center; gap: 0.5rem; }
  .linked-deck-select { flex: 1; background: none; border: none; text-align: left; padding: 0.3rem 0; cursor: pointer; color: var(--color-text); font-size: 0.85rem; }
  .linked-deck-select:hover { color: var(--color-primary); }
  .linked-deck-name { font-size: 0.85rem; color: var(--color-text); font-weight: 500; }
  .linked-deck-owner { font-size: 0.7rem; color: var(--color-text-muted); }
  .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.7rem; }
  .btn-danger { background-color: var(--color-danger); color: white; border: none; }

  .pool-card-wrapper { position: relative; }
  .grid-add-btn { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; background-color: #4caf50; color: white; border: none; font-size: 1rem; font-weight: 700; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.85; z-index: 2; }
  .grid-add-btn:hover { opacity: 1; transform: scale(1.1); }
  .grid-remove-btn { position: absolute; bottom: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; background-color: var(--color-danger); color: white; border: none; font-size: 1rem; font-weight: 700; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.85; z-index: 2; }
  .grid-remove-btn:hover { opacity: 1; transform: scale(1.1); }
  .deck-qty-badge { position: absolute; top: 4px; left: 4px; background-color: #4caf50; color: white; font-size: 0.6rem; font-weight: 600; padding: 0.1rem 0.35rem; border-radius: var(--radius-sm); z-index: 2; }

  .add-to-deck-btn { width: 20px; height: 20px; border-radius: 50%; background-color: #4caf50; color: white; border: none; font-size: 0.85rem; font-weight: 700; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .add-to-deck-btn:hover { background-color: #388e3c; }
  .remove-from-deck-btn { width: 20px; height: 20px; border-radius: 50%; background-color: var(--color-danger); color: white; border: none; font-size: 0.85rem; font-weight: 700; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .remove-from-deck-btn:hover { opacity: 0.8; }
  .in-deck { background-color: rgba(76, 175, 80, 0.08); border-radius: var(--radius-sm); }
  .deck-indicator { font-size: 0.65rem; color: #4caf50; font-weight: 600; margin-left: auto; white-space: nowrap; }

  .pool-section { margin-top: 1rem; }
  .pool-section h2 { font-size: 1rem; margin-bottom: 1rem; }
  .pool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .pool-header h2 { margin: 0; }

  .view-toggle { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
  .toggle-btn { padding: 0.4rem 0.75rem; background: none; border: none; color: var(--color-text-muted); font-size: 0.8rem; cursor: pointer; }
  .toggle-btn:hover { background-color: var(--color-bg-tertiary); }
  .toggle-btn.active { background-color: var(--color-surface); color: var(--color-text); font-weight: 500; }

  .pool-text { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
  .element-group { }
  .element-heading { font-size: 0.9rem; margin: 0 0 0.5rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--color-border); }
  .element-air { border-color: #7c9cbf; color: #7c9cbf; }
  .element-earth { border-color: #8b7d5b; color: #8b7d5b; }
  .element-fire { border-color: #c9583c; color: #c9583c; }
  .element-water { border-color: #4a8fa8; color: #4a8fa8; }
  .element-none { border-color: var(--color-text-muted); color: var(--color-text-muted); }
  .element-multi { border-color: var(--color-accent); color: var(--color-accent); }
  .element-avatar { border-color: #b07ddb; color: #b07ddb; }

  .avatar-bar {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .avatar-label {
    writing-mode: vertical-lr;
    text-orientation: upright;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: -0.15em;
    color: #b07ddb;
  }
  .avatar-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .avatar-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem 0.4rem 0.4rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-left: 3px solid #b07ddb;
    border-radius: var(--radius-md);
    transition: border-color 0.15s;
  }
  .avatar-card:hover {
    border-color: #b07ddb;
    border-left-color: #b07ddb;
    text-decoration: none;
  }
  .avatar-card-img {
    width: 40px;
    height: 56px;
    object-fit: cover;
    border-radius: var(--radius-sm);
  }
  .avatar-card-placeholder {
    width: 40px;
    height: 56px;
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
  }
  .avatar-card-name {
    font-size: 0.8rem;
    color: var(--color-text);
  }

  .element-list { list-style: none; padding: 0; margin: 0; }
  .sub-heading { font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase; margin: 0.6rem 0 0.3rem; letter-spacing: 0.03em; }
  .element-list li { display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0; font-size: 0.8rem; }
  .text-qty { color: var(--color-text-muted); min-width: 22px; font-weight: 600; }
  .text-name { color: var(--color-text); flex: 1; }
  .text-name:hover { color: var(--color-primary-hover); }
  .text-meta { color: var(--color-text-muted); font-size: 0.7rem; }
  .pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; }
  .pool-card { display: block; position: relative; border-radius: var(--radius-md); overflow: hidden; transition: transform 0.15s; }
  .pool-card:hover { transform: translateY(-2px); }
  .pool-card img { width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; display: block; }
  .pool-placeholder { width: 100%; aspect-ratio: 2.5/3.5; background-color: var(--color-surface); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--color-text-muted); text-align: center; padding: 0.5rem; }
  .qty-badge { position: absolute; top: 4px; right: 4px; background-color: var(--color-primary); color: white; font-size: 0.6rem; font-weight: 600; padding: 0.1rem 0.35rem; border-radius: var(--radius-sm); }
  .empty { color: var(--color-text-muted); }

  .card-preview {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    width: 300px;
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    border: 1px solid var(--color-border);
  }
  .card-preview img {
    width: 100%;
    display: block;
    aspect-ratio: 2.5 / 3.5;
    object-fit: cover;
  }
  .card-preview.site {
    width: 420px;
    height: 300px;
    overflow: hidden;
  }
  .card-preview.site img {
    width: 300px;
    height: 420px;
    aspect-ratio: auto;
    object-fit: fill;
    transform: rotate(90deg) translateY(-100%);
    transform-origin: top left;
  }

  @media (max-width: 768px) {
    .pool-grid { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); }
  }
</style>
