<script>
  import { goto } from '$app/navigation';

  let { data } = $props();

  let settings = $state({
    sets: data.cube.settings.sets || [],
    elements: data.cube.settings.elements || [],
    cubeSize: data.cube.settings.cubeSize || 360,
    includeAvatars: data.cube.settings.includeAvatars || false,
    rarities: data.cube.settings.rarities || {
      Ordinary: { enabled: true, max: 4 },
      Exceptional: { enabled: true, max: 3 },
      Elite: { enabled: true, max: 2 },
      Unique: { enabled: true, max: 1 }
    }
  });

  let generating = $state(false);
  let genResult = $state('');
  let genWarning = $state('');
  let saving = $state(false);

  const elements = ['Air', 'Earth', 'Fire', 'Water'];
  const rarityNames = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];

  function toggleSet(setId) {
    if (settings.sets.includes(setId)) {
      settings.sets = settings.sets.filter((s) => s !== setId);
    } else {
      settings.sets = [...settings.sets, setId];
    }
  }

  function toggleElement(el) {
    if (settings.elements.includes(el)) {
      settings.elements = settings.elements.filter((e) => e !== el);
    } else {
      settings.elements = [...settings.elements, el];
    }
  }

  async function saveSettings() {
    saving = true;
    await fetch(`/api/cubes/${data.cube.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });
    saving = false;
    genResult = 'Settings saved!';
    setTimeout(() => { genResult = ''; }, 2000);
  }

  async function generatePool() {
    generating = true;
    genResult = '';

    // Save settings first
    await fetch(`/api/cubes/${data.cube.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });

    const res = await fetch(`/api/cubes/${data.cube.id}/generate`, { method: 'POST' });
    const json = await res.json();

    if (res.ok) {
      genResult = `Generated cube with ${json.poolSize} cards!`;
      if (json.warning) {
        genWarning = json.warning;
        setTimeout(() => { genWarning = ''; }, 6000);
      } else {
        genWarning = '';
      }
    } else {
      genResult = json.error || 'Failed to generate';
    }
    generating = false;
  }
</script>

<svelte:head>
  <title>Edit: {data.cube.name} - Sorcery TCG</title>
</svelte:head>

<div class="container editor-page">
  <div class="editor-header">
    <a href="/cubes/{data.cube.slug}" class="back-link">&larr; Back to cube</a>
    <h1>{data.cube.name}</h1>
    <p class="subtitle">Configure randomizer settings and generate a card pool</p>
  </div>

  <div class="settings-grid">
    <section class="setting-section">
      <h2>Cube Size</h2>
      <p>Total number of cards in the generated pool.</p>
      <input type="number" class="input size-input" bind:value={settings.cubeSize} min="30" max="720" step="10" />
    </section>

    <section class="setting-section">
      <h2>Sets</h2>
      <p>Select which sets to include. Leave empty for all sets.</p>
      <div class="chip-grid">
        {#each data.allSets as s}
          <button
            class="chip"
            class:active={settings.sets.includes(s.id)}
            onclick={() => toggleSet(s.id)}
          >
            {s.name}
          </button>
        {/each}
      </div>
    </section>

    <section class="setting-section">
      <h2>Elements</h2>
      <p>Filter by elements. Leave empty for all.</p>
      <div class="chip-grid">
        {#each elements as el}
          <button
            class="chip"
            class:active={settings.elements.includes(el)}
            onclick={() => toggleElement(el)}
          >
            {el}
          </button>
        {/each}
      </div>
    </section>

    <section class="setting-section">
      <h2>Rarities & Max Copies</h2>
      <p>Toggle rarities and set max copies per card.</p>
      <div class="rarity-grid">
        {#each rarityNames as rarity}
          <div class="rarity-row">
            <label class="rarity-toggle">
              <input type="checkbox" bind:checked={settings.rarities[rarity].enabled} />
              <span>{rarity}</span>
            </label>
            <div class="rarity-max">
              <span>Max:</span>
              <input type="number" class="input max-input" bind:value={settings.rarities[rarity].max} min="1" max="10" />
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="setting-section">
      <h2>Avatars</h2>
      <p>Include one random avatar in the cube pool.</p>
      <label class="rarity-toggle">
        <input type="checkbox" bind:checked={settings.includeAvatars} />
        <span>Include Avatars</span>
      </label>
    </section>
  </div>

  <div class="actions">
    <button class="btn btn-secondary" onclick={saveSettings} disabled={saving}>
      {saving ? 'Saving...' : 'Save Settings'}
    </button>
    <button class="btn btn-primary" onclick={generatePool} disabled={generating}>
      {generating ? 'Generating...' : 'Generate Cube Pool'}
    </button>
  </div>

  {#if genResult}
    <p class="gen-result">{genResult}</p>
  {/if}
</div>

{#if genWarning}
  <div class="toast-warning">{genWarning}</div>
{/if}

<style>
  .editor-page { padding: 2rem 1rem; }
  .editor-header { margin-bottom: 2rem; }
  .back-link { font-size: 0.85rem; color: var(--color-text-muted); }
  .editor-header h1 { margin: 0.25rem 0 0.25rem; }
  .subtitle { color: var(--color-text-muted); font-size: 0.9rem; margin: 0; }

  .settings-grid { display: flex; flex-direction: column; gap: 1.5rem; }

  .setting-section {
    padding: 1.25rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }
  .setting-section h2 { margin: 0 0 0.25rem; font-size: 1rem; }
  .setting-section p { margin: 0 0 0.75rem; font-size: 0.8rem; color: var(--color-text-muted); }

  .size-input { width: 120px; }

  .chip-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .chip {
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: none;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover { border-color: var(--color-primary); color: var(--color-text); }
  .chip.active { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }

  .rarity-grid { display: flex; flex-direction: column; gap: 0.5rem; }
  .rarity-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .rarity-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer; }
  .rarity-max { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .max-input { width: 60px; }

  .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
  .gen-result { margin-top: 1rem; font-size: 0.875rem; color: var(--color-success); }

  .toast-warning {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background-color: var(--color-danger);
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    box-shadow: var(--shadow-lg);
    z-index: 300;
    max-width: 90vw;
    text-align: center;
    animation: toast-in 0.3s ease;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
