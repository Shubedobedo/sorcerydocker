<script>
  import { goto } from '$app/navigation';

  let { data } = $props();
  let showCreate = $state(false);
  let newName = $state('');
  let creating = $state(false);

  const adjectives = [
    'Thundering', 'Gilded', 'Phantom', 'Crimson', 'Arcane', 'Volatile',
    'Ancient', 'Whispering', 'Forbidden', 'Shattered', 'Primordial', 'Infernal',
    'Frostbitten', 'Twilight', 'Chaotic', 'Celestial', 'Sunken', 'Molten',
    'Spectral', 'Eldritch', 'Withered', 'Savage', 'Enchanted', 'Blighted'
  ];

  const nouns = [
    'Labyrinth', 'Abyss', 'Crucible', 'Sanctum', 'Nexus', 'Spire',
    'Vault', 'Cauldron', 'Arena', 'Forge', 'Tomb', 'Citadel',
    'Rift', 'Maelstrom', 'Obelisk', 'Grimoire', 'Pyre', 'Dominion',
    'Hollows', 'Convergence', 'Reliquary', 'Gauntlet', 'Threshold', 'Wellspring'
  ];

  function randomCubeName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
  }

  function openCreate() {
    newName = randomCubeName();
    showCreate = true;
  }

  async function createCube() {
    if (!newName.trim()) return;
    creating = true;

    const res = await fetch('/api/cubes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });

    if (res.ok) {
      const cube = await res.json();
      goto(`/cubes/${cube.slug}/edit`);
    }
    creating = false;
  }

  async function deleteCube(id) {
    if (!confirm('Delete this cube?')) return;
    await fetch(`/api/cubes/${id}`, { method: 'DELETE' });
    window.location.reload();
  }

  async function archiveCube(id) {
    await fetch(`/api/cubes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'archived' })
    });
    window.location.reload();
  }

  async function unarchiveCube(id) {
    await fetch(`/api/cubes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'private' })
    });
    window.location.reload();
  }
</script>

<svelte:head>
  <title>Cubes - Sorcery TCG</title>
</svelte:head>

<div class="container cubes-page">
  <div class="page-header">
    <h1>Cube Builder</h1>
    {#if data.session?.user}
      <button class="btn btn-primary" onclick={openCreate}>+ New Cube</button>
    {/if}
  </div>

  {#if showCreate}
    <div class="create-form">
      <div class="name-row">
        <input type="text" class="input" placeholder="Cube name" bind:value={newName}
          onkeydown={(e) => { if (e.key === 'Enter') createCube(); }} />
        <button class="btn btn-secondary reroll-btn" onclick={() => { newName = randomCubeName(); }} title="Random name">&#x1F3B2;</button>
      </div>
      <button class="btn btn-primary" onclick={createCube} disabled={creating}>
        {creating ? 'Creating...' : 'Create'}
      </button>
    </div>
  {/if}

  {#if data.userCubes.length > 0}
    {@const activeCubes = data.userCubes.filter(c => c.visibility !== 'archived')}
    {@const archivedCubes = data.userCubes.filter(c => c.visibility === 'archived')}

    {#if activeCubes.length > 0}
      <section class="cube-section">
        <h2>My Cubes</h2>
        <div class="cube-list">
          {#each activeCubes as cube}
            <div class="cube-card">
              <a href="/cubes/{cube.slug}" class="cube-link">
                <h3>{cube.name}</h3>
                <span class="cube-meta">{cube.visibility}</span>
              </a>
              <div class="cube-actions">
                <a href="/cubes/{cube.slug}/edit" class="btn btn-secondary btn-sm">Edit</a>
                <button class="btn btn-secondary btn-sm" onclick={() => archiveCube(cube.id)}>Archive</button>
                <button class="btn btn-danger btn-sm" onclick={() => deleteCube(cube.id)}>Delete</button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if archivedCubes.length > 0}
      <section class="cube-section">
        <h2>Archived</h2>
        <div class="cube-list">
          {#each archivedCubes as cube}
            <div class="cube-card archived">
              <a href="/cubes/{cube.slug}" class="cube-link">
                <h3>{cube.name}</h3>
                <span class="cube-meta">archived</span>
              </a>
              <div class="cube-actions">
                <button class="btn btn-secondary btn-sm" onclick={() => unarchiveCube(cube.id)}>Restore</button>
                <button class="btn btn-danger btn-sm" onclick={() => deleteCube(cube.id)}>Delete</button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  <section class="cube-section">
    <h2>Public Cubes</h2>
    {#if data.publicCubes.length > 0}
      <div class="cube-list">
        {#each data.publicCubes as cube}
          <a href="/cubes/{cube.slug}" class="cube-card cube-link">
            <h3>{cube.name}</h3>
            <span class="cube-meta">{cube.visibility}</span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="empty">No public cubes yet.</p>
    {/if}
  </section>
</div>

<style>
  .cubes-page { padding: 2rem 1rem; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
  .page-header h1 { margin: 0; }
  .create-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; padding: 1rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); align-items: center; }
  .create-form .name-row { display: flex; gap: 0.5rem; flex: 1; }
  .create-form .input { flex: 1; }
  .reroll-btn { padding: 0.5rem; font-size: 1rem; line-height: 1; }
  .cube-section { margin-bottom: 2rem; }
  .cube-section h2 { font-size: 1.1rem; margin-bottom: 1rem; color: var(--color-text-muted); }
  .cube-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .cube-card { padding: 1rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); transition: border-color 0.2s; }
  .cube-card:hover { border-color: var(--color-primary); }
  .cube-link { text-decoration: none; display: block; }
  .cube-link h3 { margin: 0 0 0.25rem; font-size: 1rem; color: var(--color-text); }
  .cube-meta { font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase; }
  .cube-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  .archived { opacity: 0.6; }
  .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }
  .empty { color: var(--color-text-muted); }
</style>
