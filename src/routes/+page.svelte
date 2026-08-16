<script>
  let { data } = $props();
</script>

<svelte:head>
  <title>Sorcery TCG - Card Database & Deck Builder</title>
</svelte:head>

<div class="container hero">
  <h1>Sorcery: Contested Realm</h1>
  <p class="subtitle">Card database, deck builder, and collection manager</p>

  <div class="features">
    <a href="/cards" class="feature-card">
      <h2>Card Database</h2>
      <p>Browse and search the complete card database with advanced filters.</p>
    </a>

    <a href="/decks" class="feature-card">
      <h2>Deck Builder</h2>
      <p>Build, share, and discover decks for Standard and Freeform formats.</p>
    </a>

    <a href="/collection" class="feature-card">
      <h2>Collection</h2>
      <p>Track your card collection and see what you need for your decks.</p>
    </a>

    <a href="/cubes" class="feature-card">
      <h2>Cube Builder</h2>
      <p>Create custom cubes and generate draft packs for your group.</p>
    </a>
  </div>
</div>

<style>
  .hero {
    padding: 4rem 1rem;
    text-align: center;
  }

  h1 {
    font-family: var(--font-heading);
    font-size: 2.5rem;
    color: var(--color-accent);
    margin: 0 0 0.5rem;
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 1.1rem;
    margin-bottom: 3rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .feature-card {
    display: block;
    padding: 1.5rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: border-color 0.2s, transform 0.2s;
  }

  .feature-card:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    text-decoration: none;
  }

  .feature-card h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
    color: var(--color-text);
  }

  .feature-card p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  @media (max-width: 600px) {
    h1 {
      font-size: 1.75rem;
    }

    .hero {
      padding: 2rem 1rem;
    }
  }
</style>
