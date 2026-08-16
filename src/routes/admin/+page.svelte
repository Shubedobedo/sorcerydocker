<script>
  let { data } = $props();
  let syncing = $state(false);
  let syncResult = $state(null);
  let syncError = $state(null);

  async function syncCards() {
    syncing = true;
    syncResult = null;
    syncError = null;

    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' });
      const json = await res.json();

      if (res.ok) {
        syncResult = json;
      } else {
        syncError = json.error || 'Sync failed';
      }
    } catch (err) {
      syncError = err.message;
    } finally {
      syncing = false;
    }
  }

  let roleError = $state('');

  async function setRole(userId, role) {
    roleError = '';
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role })
    });

    if (res.ok) {
      window.location.reload();
    } else {
      const json = await res.json();
      roleError = json.error || 'Failed to update role';
      setTimeout(() => { roleError = ''; }, 4000);
    }
  }
</script>

<svelte:head>
  <title>Admin - Sorcery TCG</title>
</svelte:head>

<div class="container">
  <h1>Admin Panel</h1>

  <section class="admin-section">
    <h2>Card Database Sync</h2>
    <p>Pull the latest card data from the Sorcery API.</p>

    {#if data.lastSync}
      <p class="last-sync">Last synced: {new Date(data.lastSync).toLocaleString()}</p>
    {:else}
      <p class="last-sync">Never synced</p>
    {/if}

    <button class="btn btn-primary" onclick={syncCards} disabled={syncing}>
      {#if syncing}
        Syncing...
      {:else}
        Sync Card Database
      {/if}
    </button>

    {#if syncResult}
      <div class="sync-result success">
        Sync complete: {syncResult.synced} cards, {syncResult.images} images, {syncResult.sets} sets.
      </div>
    {/if}

    {#if syncError}
      <div class="sync-result error">
        Error: {syncError}
      </div>
    {/if}
  </section>

  <section class="admin-section">
    <h2>User Management</h2>
    <p>Manage user roles.</p>

    <table class="user-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as user}
          <tr>
            <td>{user.name || 'N/A'}</td>
            <td>{user.email}</td>
            <td>
              <span class="role-badge" class:admin={user.role === 'admin'}>
                {user.role}
              </span>
            </td>
            <td>
              {#if user.role === 'member'}
                <button class="btn btn-secondary btn-sm" onclick={() => setRole(user.id, 'admin')}>
                  Make Admin
                </button>
              {:else}
                <button
                  class="btn btn-secondary btn-sm"
                  onclick={() => setRole(user.id, 'member')}
                >
                  Make Member
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if roleError}
      <div class="role-error">{roleError}</div>
    {/if}
  </section>
</div>

<style>
  .admin-section {
    margin-top: 2rem;
    padding: 1.5rem;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .admin-section h2 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }

  .admin-section p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .last-sync {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin-bottom: 0.75rem;
  }

  .sync-result {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
  }

  .sync-result.success {
    background-color: rgba(69, 184, 90, 0.15);
    color: var(--color-success);
    border: 1px solid var(--color-success);
  }

  .sync-result.error {
    background-color: rgba(229, 69, 69, 0.15);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
  }

  .user-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .user-table th,
  .user-table td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }

  .user-table th {
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .role-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .role-badge.admin {
    background-color: rgba(124, 92, 191, 0.2);
    color: var(--color-primary-hover);
  }

  .role-error {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background-color: rgba(229, 69, 69, 0.15);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
  }

  .btn-sm {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
  }
</style>
