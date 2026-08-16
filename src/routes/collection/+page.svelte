<script>
  let { data } = $props();

  let collection = $state([...data.collection]);
  let totalCards = $derived(collection.reduce((sum, item) => sum + item.quantity, 0));
  let uniqueCards = $derived(collection.length);

  // CSV tools
  let exportSet = $state('');
  let importResult = $state('');

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const res = await fetch('/api/collection/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: text
    });

    const json = await res.json();
    if (res.ok) {
      importResult = `Imported ${json.imported} cards (${json.skipped} skipped)`;
      setTimeout(() => { window.location.reload(); }, 1500);
    } else {
      importResult = json.error || 'Import failed';
    }
    setTimeout(() => { importResult = ''; }, 5000);
  }

  $effect(() => {
    collection = [...data.collection];
  });

  async function updateQuantity(item, newQty) {
    const res = await fetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: item.card_id,
        set_id: item.set_id,
        set_name: item.set_name,
        quantity: newQty
      })
    });
    if (res.ok) {
      if (newQty <= 0) {
        collection = collection.filter((c) => c.id !== item.id);
      } else {
        collection = collection.map((c) => c.id === item.id ? { ...c, quantity: newQty } : c);
      }
    }
  }

  async function removeItem(item) {
    const res = await fetch('/api/collection', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: item.card_id, set_id: item.set_id })
    });
    if (res.ok) {
      collection = collection.filter((c) => c.id !== item.id);
    }
  }

  // Trade modal state
  let tradeModalItem = $state(null);
  let tradeQty = $state(1);

  // Toast state
  let toast = $state('');

  function showToast(message) {
    toast = message;
    setTimeout(() => { toast = ''; }, 3000);
  }

  function openTradeModal(item) {
    tradeModalItem = item;
    tradeQty = 1;
  }

  async function confirmTrade() {
    if (!tradeModalItem || tradeQty <= 0) return;

    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: tradeModalItem.card_id,
        set_id: tradeModalItem.set_id,
        set_name: tradeModalItem.set_name || tradeModalItem.card.set_name,
        quantity: tradeQty
      })
    });

    if (res.ok) {
      showToast(`${tradeModalItem.card.name} (${tradeQty}x) marked for trade`);
      tradeModalItem = null;
    }
  }

  async function markForTrade(item) {
    openTradeModal(item);
  }
</script>

<svelte:head>
  <title>Collection - Sorcery TCG</title>
</svelte:head>

<div class="container collection-page">
  <h1>My Collection</h1>

  <div class="collection-stats">
    <span>{uniqueCards} unique cards</span>
    <span>&middot;</span>
    <span>{totalCards} total</span>
  </div>

  <div class="csv-tools">
    <div class="csv-export">
      <select class="select" bind:value={exportSet}>
        <option value="">All Cards</option>
        {#each data.allSets as s}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
      <a href="/api/collection/export?set={exportSet}" class="btn btn-secondary" download>Download CSV</a>
    </div>
    <div class="csv-import">
      <input type="file" accept=".csv" class="file-input" id="csv-upload"
        onchange={handleFileUpload} />
      <label for="csv-upload" class="btn btn-secondary">Upload CSV</label>
    </div>
    {#if importResult}
      <span class="import-result">{importResult}</span>
    {/if}
  </div>

  {#if collection.length > 0}
    <div class="collection-grid">
      {#each collection as item (item.id)}
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
            <div class="qty-controls">
              <button class="qty-btn" onclick={() => updateQuantity(item, item.quantity - 1)}>-</button>
              <span class="qty">{item.quantity}</span>
              <button class="qty-btn" onclick={() => updateQuantity(item, item.quantity + 1)}>+</button>
              <button class="trade-btn" onclick={() => markForTrade(item)} title="Mark for trade">&#8644;</button>
              <button class="remove-btn" onclick={() => removeItem(item)}>&times;</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">Your collection is empty. Browse the <a href="/cards">card database</a> to add cards.</p>
  {/if}
</div>

{#if tradeModalItem}
  <div class="modal-overlay" onclick={() => { tradeModalItem = null; }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>Mark for Trade</h3>
      <p class="modal-card-name">{tradeModalItem.card.name}</p>
      <p class="modal-hint">You have {tradeModalItem.quantity} in your collection</p>

      <label class="modal-label">Quantity to trade</label>
      <div class="modal-qty">
        <button class="qty-btn" onclick={() => { if (tradeQty > 1) tradeQty--; }}>-</button>
        <span class="qty">{tradeQty}</span>
        <button class="qty-btn" onclick={() => { if (tradeQty < tradeModalItem.quantity) tradeQty++; }}>+</button>
      </div>

      <div class="modal-actions">
        <button class="btn btn-primary" onclick={confirmTrade}>Mark for Trade</button>
        <button class="btn btn-secondary" onclick={() => { tradeModalItem = null; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<style>
  .collection-page {
    padding: 2rem 1rem;
  }

  h1 {
    margin: 0 0 0.5rem;
  }

  .collection-stats {
    display: flex;
    gap: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .csv-tools {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 0.75rem 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .csv-export {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .csv-import {
    display: flex;
    align-items: center;
  }

  .file-input {
    display: none;
  }

  .import-result {
    font-size: 0.8rem;
    color: var(--color-success);
  }

  .collection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1rem;
  }

  .collection-card {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .card-image-link {
    display: block;
    aspect-ratio: 2.5 / 3.5;
    overflow: hidden;
    background-color: var(--color-surface);
  }

  .card-image-link img {
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
    font-size: 0.75rem;
    color: var(--color-text-muted);
    padding: 0.5rem;
    text-align: center;
  }

  .collection-card-info {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .card-name {
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-set {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .qty-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .qty-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .qty-btn:hover {
    background-color: var(--color-surface);
  }

  .qty {
    font-size: 0.85rem;
    min-width: 18px;
    text-align: center;
  }

  .remove-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--color-danger);
    font-size: 1rem;
    cursor: pointer;
  }

  .trade-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 0.15rem;
  }

  .trade-btn:hover {
    color: var(--color-primary-hover);
  }

  .empty {
    color: var(--color-text-muted);
  }

  @media (max-width: 768px) {
    .collection-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    }
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    width: 320px;
    max-width: 90vw;
  }

  .modal h3 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }

  .modal-card-name {
    font-weight: 600;
    margin: 0 0 0.25rem;
  }

  .modal-hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0 0 1rem;
  }

  .modal-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    display: block;
    margin-bottom: 0.5rem;
  }

  .modal-qty {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .modal-qty .qty-btn {
    width: 32px;
    height: 32px;
    font-size: 1rem;
  }

  .modal-qty .qty {
    font-size: 1.25rem;
    min-width: 30px;
    text-align: center;
  }

  .modal-actions {
    display: flex;
    gap: 0.5rem;
  }

  .modal-actions .btn {
    flex: 1;
    justify-content: center;
  }

  .toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background-color: var(--color-success);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    box-shadow: var(--shadow-lg);
    z-index: 300;
    animation: toast-in 0.3s ease;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
