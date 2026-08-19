<script>
  let { data } = $props();

  let showPacks = $state(false);
  let viewMode = $state('text'); // 'grid' or 'text'
  let packSettings = $state({ packsPerPlayer: 3, cardsPerPack: 15, players: 2 });
  let packs = $state([]);
  let packError = $state('');
  let generatingPacks = $state(false);

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
    </div>
  </div>

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
                      <li>
                        <span class="text-qty">{cc.quantity}x</span>
                        <a href="/cards/{cc.card.slug}" class="text-name">{cc.card.name}</a>
                        <span class="text-meta">{cc.card.rarity}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}

                {#if group.spells.length > 0}
                  <h4 class="sub-heading">Spells ({group.spells.length})</h4>
                  <ul class="element-list">
                    {#each group.spells as cc}
                      <li>
                        <span class="text-qty">{cc.quantity}x</span>
                        <a href="/cards/{cc.card.slug}" class="text-name">{cc.card.name}</a>
                        <span class="text-meta">{cc.card.type}{cc.card.cost !== null ? ` · ${cc.card.cost}` : ''} · {cc.card.rarity}</span>
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

  @media (max-width: 768px) {
    .pool-grid { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); }
  }
</style>
