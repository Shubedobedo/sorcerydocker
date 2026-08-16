<script>
  let { data } = $props();

  let editName = $state(data.user?.name || '');
  let editImage = $state(data.user?.image || '');
  let saving = $state(false);
  let toast = $state('');

  function showToast(message) {
    toast = message;
    setTimeout(() => { toast = ''; }, 3000);
  }

  async function saveProfile() {
    saving = true;
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, image: editImage })
    });

    if (res.ok) {
      showToast('Profile updated!');
      setTimeout(() => { window.location.reload(); }, 1000);
    } else {
      showToast('Failed to save');
    }
    saving = false;
  }
</script>

<svelte:head>
  <title>{data.user?.name || 'Profile'} - Sorcery TCG</title>
</svelte:head>

<div class="container profile-page">
  <h1>My Profile</h1>

  <section class="profile-section">
    <div class="avatar-area">
      {#if editImage}
        <img src={editImage} alt="Avatar" class="avatar-preview" />
      {:else}
        <div class="avatar-placeholder">{(editName || '?')[0].toUpperCase()}</div>
      {/if}
    </div>

    <div class="profile-form">
      <label class="form-field">
        <span>Username</span>
        <input type="text" class="input" bind:value={editName} placeholder="Your display name" />
      </label>

      <label class="form-field">
        <span>Avatar URL</span>
        <input type="url" class="input" bind:value={editImage} placeholder="https://example.com/avatar.png" />
        <span class="hint">Paste an image URL, or leave blank to use your initial</span>
      </label>

      <button class="btn btn-primary" onclick={saveProfile} disabled={saving}>
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  </section>

  <section class="profile-section">
    <h2>Account Info</h2>
    <dl class="info-list">
      <dt>Email</dt>
      <dd>{data.user?.email}</dd>
      <dt>Role</dt>
      <dd>{data.user?.role}</dd>
      <dt>Joined</dt>
      <dd>{data.user?.created_at ? new Date(data.user.created_at).toLocaleDateString() : 'Unknown'}</dd>
    </dl>
  </section>

  {#if data.decks.length > 0}
    <section class="profile-section">
      <h2>My Decks ({data.decks.length})</h2>
      <ul class="item-list">
        {#each data.decks as deck}
          <li><a href="/decks/{deck.slug}">{deck.name}</a> <span class="item-meta">{deck.format} · {deck.visibility}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data.cubes.length > 0}
    <section class="profile-section">
      <h2>My Cubes ({data.cubes.length})</h2>
      <ul class="item-list">
        {#each data.cubes as cube}
          <li><a href="/cubes/{cube.slug}">{cube.name}</a> <span class="item-meta">{cube.visibility}</span></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<style>
  .profile-page {
    padding: 2rem 1rem;
    max-width: 700px;
  }

  h1 { margin: 0 0 1.5rem; }

  .profile-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .profile-section h2 {
    margin: 0 0 1rem;
    font-size: 1rem;
  }

  .avatar-area {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .avatar-preview {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--color-border);
  }

  .avatar-placeholder {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background-color: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
  }

  .profile-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .form-field span {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .hint {
    font-size: 0.7rem !important;
    color: var(--color-text-muted);
  }

  .info-list {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 0.5rem;
    margin: 0;
  }

  .info-list dt {
    font-weight: 500;
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .info-list dd {
    margin: 0;
    font-size: 0.85rem;
  }

  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .item-list li {
    padding: 0.4rem 0;
    font-size: 0.85rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }

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
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
