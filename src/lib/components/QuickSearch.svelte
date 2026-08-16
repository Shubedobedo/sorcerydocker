<script>
  import { goto } from '$app/navigation';

  let query = $state('');
  let results = $state([]);
  let showResults = $state(false);
  let debounceTimer;

  async function handleInput() {
    clearTimeout(debounceTimer);
    if (query.length < 2) {
      results = [];
      showResults = false;
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}&limit=5`);
        if (res.ok) {
          results = await res.json();
          showResults = true;
        }
      } catch {
        results = [];
      }
    }, 300);
  }

  function handleSelect(card) {
    query = '';
    results = [];
    showResults = false;
    goto(`/cards/${card.slug}`);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      showResults = false;
    }
    if (e.key === 'Enter' && query.length >= 2) {
      showResults = false;
      goto(`/cards?q=${encodeURIComponent(query)}`);
    }
  }

  function handleBlur() {
    // Delay to allow click on results
    setTimeout(() => {
      showResults = false;
    }, 200);
  }
</script>

<div class="quick-search">
  <input
    type="search"
    class="quick-search-input"
    placeholder="Search cards..."
    bind:value={query}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    onfocus={() => { if (results.length) showResults = true; }}
    aria-label="Quick card search"
    autocomplete="off"
  />

  {#if showResults && results.length > 0}
    <ul class="search-results" role="listbox">
      {#each results as card}
        <li>
          <button
            class="search-result-item"
            onclick={() => handleSelect(card)}
            role="option"
            aria-selected="false"
          >
            <span class="result-name">{card.name}</span>
            <span class="result-meta">{card.type} &middot; {card.set_name}</span>
          </button>
        </li>
      {/each}
      <li class="search-all">
        <a href="/cards?q={encodeURIComponent(query)}">View all results &rarr;</a>
      </li>
    </ul>
  {/if}
</div>

<style>
  .quick-search {
    position: relative;
    flex: 1;
    max-width: 300px;
  }

  .quick-search-input {
    width: 100%;
    padding: 0.4rem 0.75rem;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.85rem;
  }

  .quick-search-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    list-style: none;
    padding: 0.25rem;
    box-shadow: var(--shadow-lg);
    z-index: 200;
  }

  .search-result-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    text-align: left;
    font-size: 0.85rem;
  }

  .search-result-item:hover {
    background-color: var(--color-bg-tertiary);
  }

  .result-name {
    font-weight: 500;
  }

  .result-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .search-all {
    padding: 0.5rem 0.75rem;
    text-align: center;
    font-size: 0.8rem;
  }

  @media (max-width: 768px) {
    .quick-search {
      display: none;
    }
  }
</style>
