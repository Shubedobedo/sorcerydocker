<script>
  let { data } = $props();
  let friendSearch = $state('');
  let toast = $state('');
  let searchError = $state('');

  function showToast(msg) {
    toast = msg;
    setTimeout(() => { toast = ''; }, 3000);
  }

  async function sendRequest() {
    if (!friendSearch.trim()) return;
    const isEmail = friendSearch.includes('@');
    const body = isEmail ? { email: friendSearch } : { username: friendSearch };

    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (res.ok) {
      showToast(json.message);
      friendSearch = '';
      window.location.reload();
    } else {
      searchError = json.error;
      setTimeout(() => { searchError = ''; }, 3000);
    }
  }

  async function acceptRequest(reqId) {
    await fetch(`/api/friends/${reqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept' })
    });
    showToast('Friend added!');
    window.location.reload();
  }

  async function rejectRequest(reqId) {
    await fetch(`/api/friends/${reqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' })
    });
    window.location.reload();
  }

  async function toggleSharing(friendshipId, field, value) {
    await fetch(`/api/friends/${friendshipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
  }

  let confirmModal = $state(null);

  async function removeFriend(friendshipId, friendName) {
    confirmModal = {
      title: 'Remove Friend',
      message: `Remove ${friendName} from your friends list?`,
      onConfirm: async () => {
        await fetch(`/api/friends/${friendshipId}`, { method: 'DELETE' });
        confirmModal = null;
        showToast('Friend removed');
        window.location.reload();
      }
    };
  }
</script>

<svelte:head>
  <title>Friends - Sorcery TCG</title>
</svelte:head>

<div class="container friends-page">
  <h1>Friends</h1>

  <div class="add-section">
    <input type="text" class="input" placeholder="Add by username or email" bind:value={friendSearch}
      onkeydown={(e) => { if (e.key === 'Enter') sendRequest(); }} />
    <button class="btn btn-primary" onclick={sendRequest}>Add Friend</button>
  </div>
  {#if searchError}
    <p class="error-msg">{searchError}</p>
  {/if}

  {#if data.incoming.length > 0}
    <section class="section">
      <h2>Pending Requests</h2>
      {#each data.incoming as req}
        <div class="request-row">
          <div class="friend-info">
            <span class="friend-name">{req.from.name || req.from.email}</span>
          </div>
          <div class="actions">
            <button class="btn btn-primary btn-sm" onclick={() => acceptRequest(req.id)}>Accept</button>
            <button class="btn btn-secondary btn-sm" onclick={() => rejectRequest(req.id)}>Reject</button>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <section class="section">
    <h2>My Friends ({data.friends.length})</h2>
    {#if data.friends.length > 0}
      <div class="friends-grid">
        {#each data.friends as f}
          <div class="friend-card">
            <div class="friend-card-top">
              <a href="/friends/{f.friend.id}" class="friend-link">
                {#if f.friend.image}
                  <img src={f.friend.image} alt={f.friend.name} class="friend-avatar" />
                {:else}
                  <div class="friend-avatar-placeholder">{(f.friend.name || '?')[0].toUpperCase()}</div>
                {/if}
                <span class="friend-name">{f.friend.name || f.friend.email}</span>
              </a>
              <button class="remove-btn" onclick={() => removeFriend(f.id, f.friend.name || f.friend.email)} title="Remove">&times;</button>
            </div>
            <div class="sharing-toggles">
              <span class="share-label">Share with them:</span>
              <label class="toggle">
                <input type="checkbox" checked={f.share_collection === 1}
                  onchange={(e) => toggleSharing(f.id, 'share_collection', e.target.checked)} />
                <span class="toggle-slider"></span>
                <span class="toggle-text">Collection</span>
              </label>
              <label class="toggle">
                <input type="checkbox" checked={f.share_trades === 1}
                  onchange={(e) => toggleSharing(f.id, 'share_trades', e.target.checked)} />
                <span class="toggle-slider"></span>
                <span class="toggle-text">Trades</span>
              </label>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">No friends yet. Add someone above!</p>
    {/if}
  </section>
</div>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

{#if confirmModal}
  <div class="modal-overlay" onclick={() => { confirmModal = null; }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>{confirmModal.title}</h3>
      <p class="modal-message">{confirmModal.message}</p>
      <div class="modal-actions">
        <button class="btn btn-danger" onclick={confirmModal.onConfirm}>Remove</button>
        <button class="btn btn-secondary" onclick={() => { confirmModal = null; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .friends-page { padding: 2rem 1rem; }
  h1 { margin: 0 0 1.5rem; }
  .add-section { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
  .add-section .input { flex: 1; max-width: 350px; }
  .error-msg { font-size: 0.8rem; color: var(--color-danger); margin: 0 0 1rem; }

  .section { margin-top: 2rem; }
  .section h2 { font-size: 1rem; color: var(--color-text-muted); margin-bottom: 1rem; }

  .request-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; }

  .friends-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 1rem; }
  .friend-card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); transition: border-color 0.2s; }
  .friend-card:hover { border-color: var(--color-primary); }
  .friend-card-top { display: flex; align-items: center; gap: 0.75rem; }
  .friend-link { display: flex; align-items: center; gap: 0.75rem; flex: 1; text-decoration: none; }
  .friend-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
  .friend-avatar-placeholder { width: 40px; height: 40px; border-radius: 50%; background-color: var(--color-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; }
  .friend-name { font-weight: 500; color: var(--color-text); }
  .remove-btn { background: none; border: none; color: var(--color-danger); font-size: 1.2rem; cursor: pointer; }

  .sharing-toggles { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
  .share-label { font-size: 0.75rem; color: var(--color-text-muted); }
  .toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.8rem; }
  .toggle input { display: none; }
  .toggle-slider {
    width: 34px;
    height: 18px;
    background-color: var(--color-border);
    border-radius: 9px;
    position: relative;
    transition: background-color 0.2s;
  }
  .toggle-slider::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background-color: white;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
  }
  .toggle input:checked + .toggle-slider {
    background-color: var(--color-primary);
  }
  .toggle input:checked + .toggle-slider::after {
    transform: translateX(16px);
  }
  .toggle-text { color: var(--color-text-muted); }

  .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }
  .empty { color: var(--color-text-muted); }

  .toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background-color: var(--color-success); color: white; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); font-size: 0.875rem; box-shadow: var(--shadow-lg); z-index: 300; }

  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 1.5rem; width: 340px; max-width: 90vw; }
  .modal h3 { margin: 0 0 0.75rem; font-size: 1.1rem; }
  .modal-message { color: var(--color-text-muted); font-size: 0.875rem; margin: 0 0 1.25rem; }
  .modal-actions { display: flex; gap: 0.5rem; }
  .modal-actions .btn { flex: 1; justify-content: center; }
</style>
