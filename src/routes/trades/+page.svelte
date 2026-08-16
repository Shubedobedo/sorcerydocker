<script>
  let { data } = $props();
  let editingId = $state(null);
  let editLocation = $state('');
  let editValue = $state('');
  let toast = $state('');
  let confirmModal = $state(null); // { title, message, onConfirm }

  function showToast(message) {
    toast = message;
    setTimeout(() => { toast = ''; }, 3000);
  }

  function showConfirm(title, message, onConfirm) {
    confirmModal = { title, message, onConfirm };
  }

  function startEdit(trade) {
    editingId = trade.id;
    editLocation = trade.location || '';
    editValue = trade.expected_value || '';
  }

  async function saveEdit(id) {
    await fetch('/api/trades', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, location: editLocation, expected_value: editValue })
    });
    editingId = null;
    showToast('Trade details saved');
    window.location.reload();
  }

  async function markTraded(id) {
    showConfirm('Mark as Traded', 'This will remove the card from your collection.', async () => {
      await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'traded' })
      });
      confirmModal = null;
      showToast('Trade completed');
      window.location.reload();
    });
  }

  async function undoTrade(trade) {
    showConfirm('Undo Trade', 'The card will be added back to your collection and returned to your trade binder.', async () => {
      await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: trade.card_id,
          set_id: trade.set_id,
          set_name: trade.set_name,
          quantity: trade.quantity,
          add: true
        })
      });

      await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trade.id, status: 'available' })
      });

      confirmModal = null;
      showToast('Trade undone — card returned to collection');
      window.location.reload();
    });
  }

  async function removeTrade(id) {
    showConfirm('Remove from Trade Binder', 'This will remove the card from your trade binder without affecting your collection.', async () => {
      await fetch('/api/trades', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      confirmModal = null;
      showToast('Removed from trade binder');
      window.location.reload();
    });
  }
</script>

<svelte:head>
  <title>Trade Binder - Sorcery TCG</title>
</svelte:head>

<div class="container trades-page">
  <h1>Trade Binder</h1>

  <section class="trade-section">
    <h2>Available for Trade ({data.available.length})</h2>

    {#if data.available.length > 0}
      <div class="trade-list">
        {#each data.available as trade (trade.id)}
          <div class="trade-card">
            <a href="/cards/{trade.card.slug}" class="trade-image">
              {#if trade.card.image_url}
                <img src={trade.card.image_url} alt={trade.card.name} loading="lazy" />
              {:else}
                <div class="placeholder">{trade.card.name}</div>
              {/if}
            </a>

            <div class="trade-info">
              <a href="/cards/{trade.card.slug}" class="trade-name">{trade.card.name}</a>
              <span class="trade-meta">{trade.quantity}x &middot; {trade.set_name || trade.card.set_name}</span>

              {#if editingId === trade.id}
                <div class="edit-form">
                  <input class="input" placeholder="Location (e.g. Binder 2, Page 6)" bind:value={editLocation} />
                  <input class="input" placeholder="Expected value (e.g. $25)" bind:value={editValue} />
                  <div class="edit-actions">
                    <button class="btn btn-primary btn-sm" onclick={() => saveEdit(trade.id)}>Save</button>
                    <button class="btn btn-secondary btn-sm" onclick={() => { editingId = null; }}>Cancel</button>
                  </div>
                </div>
              {:else}
                {#if trade.location}
                  <span class="trade-detail">Location: {trade.location}</span>
                {/if}
                {#if trade.expected_value}
                  <span class="trade-detail">Value: {trade.expected_value}</span>
                {/if}

                <div class="trade-actions">
                  <button class="btn btn-secondary btn-sm" onclick={() => startEdit(trade)}>Edit</button>
                  <button class="btn btn-primary btn-sm" onclick={() => markTraded(trade.id)}>Mark Traded</button>
                  <button class="btn btn-danger btn-sm" onclick={() => removeTrade(trade.id)}>Remove</button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">No cards marked for trade. Go to your <a href="/collection">collection</a> to mark cards.</p>
    {/if}
  </section>

  {#if data.archived.length > 0}
    <section class="trade-section">
      <h2>Trade History ({data.archived.length})</h2>
      <div class="trade-list archived">
        {#each data.archived as trade (trade.id)}
          <div class="trade-card archived-card">
            <div class="trade-info">
              <span class="trade-name">{trade.card.name}</span>
              <span class="trade-meta">
                {trade.quantity}x &middot; {trade.set_name || trade.card.set_name}
                {#if trade.traded_at} &middot; Traded {new Date(trade.traded_at).toLocaleDateString()}{/if}
              </span>
              {#if trade.expected_value}
                <span class="trade-detail">Value: {trade.expected_value}</span>
              {/if}
              <div class="trade-actions">
                <button class="btn btn-secondary btn-sm" onclick={() => undoTrade(trade)}>Undo</button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

{#if confirmModal}
  <div class="modal-overlay" onclick={() => { confirmModal = null; }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>{confirmModal.title}</h3>
      <p class="modal-message">{confirmModal.message}</p>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick={confirmModal.onConfirm}>Confirm</button>
        <button class="btn btn-secondary" onclick={() => { confirmModal = null; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<style>
  .trades-page {
    padding: 2rem 1rem;
  }

  h1 {
    margin: 0 0 1.5rem;
  }

  .trade-section {
    margin-bottom: 2rem;
  }

  .trade-section h2 {
    font-size: 1rem;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .trade-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .trade-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .trade-image {
    width: 80px;
    flex-shrink: 0;
  }

  .trade-image img {
    width: 100%;
    border-radius: var(--radius-sm);
  }

  .placeholder {
    width: 80px;
    height: 112px;
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: 0.25rem;
  }

  .trade-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .trade-name {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--color-text);
  }

  a.trade-name:hover {
    color: var(--color-primary-hover);
  }

  .trade-meta {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .trade-detail {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .trade-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
  }

  .archived-card {
    opacity: 0.6;
  }

  .btn-sm {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
  }

  .empty {
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  @media (max-width: 768px) {
    .trade-card {
      flex-direction: column;
    }

    .trade-image {
      width: 60px;
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
    width: 360px;
    max-width: 90vw;
  }

  .modal h3 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }

  .modal-message {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0 0 1.25rem;
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
