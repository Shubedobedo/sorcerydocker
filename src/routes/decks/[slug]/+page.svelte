<script>
  let { data } = $props();

  let atlasCount = $derived(data.atlas.reduce((sum, dc) => sum + dc.quantity, 0));
  let spellbookCount = $derived(data.spellbook.reduce((sum, dc) => sum + dc.quantity, 0));

  // Group ALL deck cards by element (like cube page)
  function groupByElement(cards) {
    const groups = { Air: { spells: [], sites: [] }, Earth: { spells: [], sites: [] }, Fire: { spells: [], sites: [] }, Water: { spells: [], sites: [] }, Multi: { spells: [], sites: [] }, None: { spells: [], sites: [] } };
    for (const dc of cards) {
      const elements = JSON.parse(dc.card.elements || '[]');
      const isSite = dc.card.type === 'Site';
      const bucket = isSite ? 'sites' : 'spells';

      if (elements.length === 0) {
        groups.None[bucket].push(dc);
      } else if (elements.length > 1) {
        groups.Multi[bucket].push(dc);
      } else {
        const el = elements[0];
        if (groups[el]) groups[el][bucket].push(dc);
        else groups.None[bucket].push(dc);
      }
    }
    return groups;
  }

  let allCards = $derived([...data.atlas, ...data.spellbook]);
  let cardsByElement = $derived(groupByElement(allCards));

  // Deck stats
  let manaCurve = $derived(() => {
    const curve = {};
    for (const dc of data.spellbook) {
      const cost = dc.card.cost ?? 0;
      curve[cost] = (curve[cost] || 0) + dc.quantity;
    }
    return Object.entries(curve).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  });

  let elementBreakdown = $derived(() => {
    const elems = { Air: 0, Earth: 0, Fire: 0, Water: 0, None: 0 };
    const allCards = [...data.atlas, ...data.spellbook];
    for (const dc of allCards) {
      const cardElems = JSON.parse(dc.card.elements || '[]');
      if (cardElems.length === 0) {
        elems.None += dc.quantity;
      } else {
        for (const el of cardElems) {
          if (elems[el] !== undefined) elems[el] += dc.quantity;
        }
      }
    }
    return Object.entries(elems).filter(([_, count]) => count > 0);
  });

  let maxCurveCount = $derived(Math.max(...manaCurve().map(([_, c]) => c), 1));

  // Import
  let showImport = $state(false);
  let importText = $state('');
  let importResult = $state('');

  async function importDeck() {
    if (!importText.trim()) return;
    const res = await fetch(`/api/decks/${data.deck.id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: importText
    });
    const json = await res.json();
    if (res.ok) {
      importResult = `Imported ${json.imported} cards (${json.skipped} skipped)`;
      setTimeout(() => { window.location.reload(); }, 1500);
    } else {
      importResult = json.error || 'Import failed';
    }
  }

  async function updateVisibility(visibility) {
    await fetch(`/api/decks/${data.deck.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility })
    });
    window.location.reload();
  }
</script>

<svelte:head>
  <title>{data.deck.name} - Sorcery TCG</title>
</svelte:head>

<div class="container deck-view">
  <div class="deck-header">
    <div>
      <a href="/decks" class="back-link">&larr; All Decks</a>
      <h1>{data.deck.name}</h1>
      <div class="deck-meta">
        <span class="format-badge">{data.deck.format}</span>
        <span class="visibility-badge">{data.deck.visibility}</span>
        <span class="card-count">{atlasCount + spellbookCount} cards</span>
      </div>
    </div>

    {#if data.isOwner}
      <div class="owner-actions">
        <a href="/decks/{data.deck.slug}/edit" class="btn btn-primary">Edit Deck</a>
        <select class="select" onchange={(e) => updateVisibility(e.target.value)}>
          <option value="private" selected={data.deck.visibility === 'private'}>Private</option>
          <option value="friends" selected={data.deck.visibility === 'friends'}>Friends</option>
          <option value="public" selected={data.deck.visibility === 'public'}>Public</option>
        </select>
      </div>
    {/if}
  </div>

  {#if data.isOwner}
    <div class="deck-tools">
      <a href="/api/decks/{data.deck.id}/export" class="btn btn-secondary" download>Export Decklist</a>
      <button class="btn btn-secondary" onclick={() => { showImport = !showImport; }}>
        {showImport ? 'Cancel' : 'Import Decklist'}
      </button>
    </div>

    {#if showImport}
      <div class="import-panel">
        <p class="import-hint">Paste a decklist. Use "// Atlas" and "// Spellbook" headers. Format: "4x Card Name"</p>
        <textarea class="input import-textarea" bind:value={importText} placeholder={"// Atlas\n3x Dark Tower\n3x Gothic Tower\n\n// Spellbook\n4x Lightning Bolt\n3x Apprentice Wizard"}></textarea>
        <button class="btn btn-primary" onclick={importDeck}>Import</button>
        {#if importResult}
          <span class="import-result">{importResult}</span>
        {/if}
      </div>
    {/if}
  {/if}

  {#if (data.atlas.length + data.spellbook.length) > 0}
    <div class="deck-stats">
      <div class="stat-card">
        <h3>Mana Curve</h3>
        <div class="curve-chart">
          {#each manaCurve() as [cost, count]}
            <div class="curve-bar-wrapper">
              <div class="curve-bar" style="height: {(count / maxCurveCount) * 100}%"></div>
              <span class="curve-count">{count}</span>
              <span class="curve-label">{cost}</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="stat-card">
        <h3>Elements</h3>
        <div class="element-bars">
          {#each elementBreakdown() as [element, count]}
            <div class="element-row">
              <span class="element-name">{element}</span>
              <div class="element-bar-bg">
                <div class="element-bar element-{element.toLowerCase()}" style="width: {(count / (atlasCount + spellbookCount)) * 100}%"></div>
              </div>
              <span class="element-count">{count}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if data.warnings.length > 0}
    <div class="warnings">
      <h3>Format Warnings</h3>
      <ul>
        {#each data.warnings as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if data.deck.description}
    <p class="description">{data.deck.description}</p>
  {/if}

  <div class="pool-text">
    {#each Object.entries(cardsByElement) as [element, group]}
      {#if group.spells.length > 0 || group.sites.length > 0}
        <div class="element-group">
          <h3 class="element-heading element-{element.toLowerCase()}">{element} ({group.spells.reduce((s, dc) => s + dc.quantity, 0) + group.sites.reduce((s, dc) => s + dc.quantity, 0)})</h3>

          {#if group.sites.length > 0}
            <h4 class="sub-heading">Sites ({group.sites.reduce((s, dc) => s + dc.quantity, 0)})</h4>
            <ul class="element-list">
              {#each group.sites as dc}
                <li>
                  <span class="text-qty">{dc.quantity}x</span>
                  <a href="/cards/{dc.card.slug}" class="text-name">{dc.card.name}</a>
                </li>
              {/each}
            </ul>
          {/if}

          {#if group.spells.length > 0}
            <h4 class="sub-heading">Spells ({group.spells.reduce((s, dc) => s + dc.quantity, 0)})</h4>
            <ul class="element-list">
              {#each group.spells as dc}
                <li>
                  <span class="text-qty">{dc.quantity}x</span>
                  <a href="/cards/{dc.card.slug}" class="text-name">{dc.card.name}</a>
                  <span class="text-meta">{dc.card.type}{dc.card.cost !== null ? ` · ${dc.card.cost}` : ''}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .deck-view {
    padding: 2rem 1rem;
  }

  .deck-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .back-link {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .deck-header h1 {
    margin: 0.25rem 0 0.5rem;
  }

  .deck-meta {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .format-badge {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
  }

  .visibility-badge {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    background-color: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
  }

  .card-count {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .owner-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .warnings {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: rgba(229, 165, 69, 0.1);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
  }

  .warnings h3 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    color: var(--color-warning);
  }

  .warnings ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.85rem;
    color: var(--color-warning);
  }

  .description {
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
  }

  .pool-text { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
  .element-group { }
  .element-heading { font-size: 0.9rem; margin: 0 0 0.5rem; padding-bottom: 0.4rem; border-bottom: 2px solid var(--color-border); }
  .element-heading.element-air { border-color: #7c9cbf; color: #7c9cbf; }
  .element-heading.element-earth { border-color: #8b7d5b; color: #8b7d5b; }
  .element-heading.element-fire { border-color: #c9583c; color: #c9583c; }
  .element-heading.element-water { border-color: #4a8fa8; color: #4a8fa8; }
  .element-heading.element-none { border-color: var(--color-text-muted); color: var(--color-text-muted); }
  .element-heading.element-multi { border-color: var(--color-accent); color: var(--color-accent); }
  .sub-heading { font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase; margin: 0.6rem 0 0.3rem; letter-spacing: 0.03em; }
  .element-list { list-style: none; padding: 0; margin: 0; }
  .element-list li { display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0; font-size: 0.8rem; }
  .text-qty { color: var(--color-text-muted); min-width: 22px; font-weight: 600; }
  .text-name { color: var(--color-text); flex: 1; }
  .text-name:hover { color: var(--color-primary-hover); }
  .text-meta { color: var(--color-text-muted); font-size: 0.7rem; }

  .empty {
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .deck-tools {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .import-panel {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .import-hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0 0 0.75rem;
  }

  .import-textarea {
    width: 100%;
    min-height: 150px;
    resize: vertical;
    font-family: monospace;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }

  .import-result {
    margin-left: 0.75rem;
    font-size: 0.8rem;
    color: var(--color-success);
  }

  .deck-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .stat-card h3 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }

  .curve-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 80px;
  }

  .curve-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .curve-bar {
    width: 100%;
    max-width: 28px;
    background-color: var(--color-primary);
    border-radius: 3px 3px 0 0;
    min-height: 2px;
  }

  .curve-count {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    margin-bottom: 2px;
  }

  .curve-label {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  .element-bars {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .element-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .element-name {
    font-size: 0.75rem;
    width: 40px;
    color: var(--color-text-muted);
  }

  .element-bar-bg {
    flex: 1;
    height: 14px;
    background-color: var(--color-surface);
    border-radius: 7px;
    overflow: hidden;
  }

  .element-bar {
    height: 100%;
    border-radius: 7px;
    min-width: 2px;
  }

  .element-bar.element-air { background-color: #7c9cbf; }
  .element-bar.element-earth { background-color: #8b7d5b; }
  .element-bar.element-fire { background-color: #c9583c; }
  .element-bar.element-water { background-color: #4a8fa8; }
  .element-bar.element-none { background-color: var(--color-text-muted); }

  .element-count {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    width: 20px;
    text-align: right;
  }
</style>
