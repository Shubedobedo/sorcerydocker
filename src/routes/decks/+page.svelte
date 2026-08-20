<script>
  import { goto } from '$app/navigation';

  let { data } = $props();
  let showCreate = $state(false);
  let newDeckName = $state('');
  let newDeckFormat = $state('standard');
  let selectedCubeId = $state('');
  let creating = $state(false);

  async function createDeck() {
    if (!newDeckName.trim()) return;
    if (newDeckFormat === 'cube' && !selectedCubeId) return;
    creating = true;

    const body = { name: newDeckName, format: newDeckFormat };
    if (newDeckFormat === 'cube') {
      body.cube_id = parseInt(selectedCubeId);
    }

    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const deck = await res.json();
      goto(`/decks/${deck.slug}/edit`);
    }
    creating = false;
  }

  async function deleteDeck(id) {
    if (!confirm('Delete this deck?')) return;
    const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' });
    if (res.ok) {
      window.location.reload();
    }
  }
</script>

<svelte:head>
  <title>Decks - Sorcery TCG</title>
</svelte:head>

<div class="container decks-page">
  <div class="page-header">
    <h1>Decks</h1>
    {#if data.session?.user}
      <button class="btn btn-primary" onclick={() => { showCreate = !showCreate; }}>
        + New Deck
      </button>
    {/if}
  </div>

  {#if showCreate}
    <div class="create-form">
      <input
        type="text"
        class="input"
        placeholder="Deck name"
        bind:value={newDeckName}
        onkeydown={(e) => { if (e.key === 'Enter') createDeck(); }}
      />
      <select class="select" bind:value={newDeckFormat}>
        <option value="standard">Standard</option>
        <option value="freeform">Freeform</option>
        <option value="cube">Cube</option>
      </select>
      {#if newDeckFormat === 'cube'}
        <select class="select" bind:value={selectedCubeId}>
          <option value="">Select a cube...</option>
          {#each data.availableCubes as cube}
            <option value={cube.id}>{cube.name}</option>
          {/each}
        </select>
      {/if}
      <button class="btn btn-primary" onclick={createDeck} disabled={creating || (newDeckFormat === 'cube' && !selectedCubeId)}>
        {creating ? 'Creating...' : 'Create'}
      </button>
    </div>
  {/if}

  {#if data.userDecks.length > 0}
    <section class="deck-section">
      <h2>My Decks</h2>
      <div class="deck-list">
        {#each data.userDecks as deck}
          <div class="deck-card">
            <a href="/decks/{deck.slug}" class="deck-link">
              <h3>{deck.name}</h3>
              <span class="deck-format">{deck.format}</span>
            </a>
            <div class="deck-actions">
              <a href="/decks/{deck.slug}/edit" class="btn btn-secondary btn-sm">Edit</a>
              <button class="btn btn-danger btn-sm" onclick={() => deleteDeck(deck.id)}>Delete</button>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="deck-section">
    <h2>Public Decks</h2>
    {#if data.publicDecks.length > 0}
      <div class="deck-list">
        {#each data.publicDecks as deck}
          <a href="/decks/{deck.slug}" class="deck-card deck-link">
            <h3>{deck.name}</h3>
            <span class="deck-format">{deck.format}</span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="empty">No public decks yet. Be the first to share one!</p>
    {/if}
  </section>
</div>

<style>
  .decks-page {
    padding: 2rem 1rem;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .page-header h1 {
    margin: 0;
  }

  .create-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    flex-wrap: wrap;
  }

  .create-form .input {
    flex: 1;
    min-width: 200px;
  }

  .deck-section {
    margin-bottom: 2rem;
  }

  .deck-section h2 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: var(--color-text-muted);
  }

  .deck-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .deck-card {
    padding: 1rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color 0.2s;
  }

  .deck-card:hover {
    border-color: var(--color-primary);
  }

  .deck-link {
    text-decoration: none;
    display: block;
  }

  .deck-link h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    color: var(--color-text);
  }

  .deck-format {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .deck-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .btn-sm {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
  }

  .empty {
    color: var(--color-text-muted);
  }
</style>
