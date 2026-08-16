<script>
  import { page } from '$app/stores';
  import QuickSearch from './QuickSearch.svelte';

  let { session } = $props();
  let mobileMenuOpen = $state(false);

  const navLinks = [
    { href: '/cards', label: 'Cards' },
    { href: '/decks', label: 'Decks' },
    { href: '/collection', label: 'Collection' },
    { href: '/trades', label: 'Trades' },
    { href: '/cubes', label: 'Cubes' },
    { href: '/friends', label: 'Friends' }
  ];

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }
</script>

<nav class="nav" aria-label="Main navigation">
  <div class="nav-inner">
    <a href="/" class="nav-brand" onclick={closeMobileMenu}>
      Sorcery TCG
    </a>

    <QuickSearch />

    <ul class="nav-links" class:open={mobileMenuOpen}>
      {#each navLinks as link}
        <li>
          <a
            href={link.href}
            class="nav-link"
            class:active={$page.url.pathname.startsWith(link.href)}
            onclick={closeMobileMenu}
          >
            {link.label}
          </a>
        </li>
      {/each}

      {#if session?.user?.role === 'admin'}
        <li>
          <a
            href="/admin"
            class="nav-link"
            class:active={$page.url.pathname.startsWith('/admin')}
            onclick={closeMobileMenu}
          >
            Admin
          </a>
        </li>
      {/if}
    </ul>

    <div class="nav-user">
      {#if session?.user}
        <a href="/profile" class="user-avatar" title={session.user.name}>
          {#if session.user.image}
            <img
              src={session.user.image}
              alt={session.user.name}
              class="avatar-img"
              onerror={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
            />
            <span class="avatar-placeholder" style="display:none">{session.user.name?.[0] || '?'}</span>
          {:else}
            <span class="avatar-placeholder">{session.user.name?.[0] || '?'}</span>
          {/if}
        </a>
        <form method="POST" action="/auth/signout" style="display:inline">
          <button type="submit" class="btn btn-secondary btn-sm">Sign Out</button>
        </form>
      {:else}
        <a href="/login" class="btn btn-primary btn-sm">Sign In</a>
      {/if}
    </div>

    <button
      class="mobile-toggle"
      onclick={toggleMobileMenu}
      aria-label="Toggle navigation menu"
      aria-expanded={mobileMenuOpen}
    >
      <span class="hamburger" class:open={mobileMenuOpen}></span>
    </button>
  </div>
</nav>

<style>
  .nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--nav-height);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    z-index: 100;
  }

  .nav-inner {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    max-width: var(--max-width);
    margin: 0 auto;
    padding: 0 1rem;
    height: 100%;
  }

  .nav-brand {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-accent);
    white-space: nowrap;
  }

  .nav-brand:hover {
    text-decoration: none;
  }

  .nav-links {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 0.25rem;
  }

  .nav-link {
    display: block;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: 0.875rem;
    transition: color 0.2s, background-color 0.2s;
  }

  .nav-link:hover {
    color: var(--color-text);
    background-color: var(--color-bg-tertiary);
    text-decoration: none;
  }

  .nav-link.active {
    color: var(--color-text);
    background-color: var(--color-surface);
  }

  .nav-user {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
  }

  .user-avatar img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: block;
    object-fit: cover;
  }

  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--color-primary);
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .btn-sm {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
  }

  .mobile-toggle {
    display: none;
    background: none;
    border: none;
    padding: 0.5rem;
  }

  .hamburger {
    display: block;
    width: 20px;
    height: 2px;
    background-color: var(--color-text);
    position: relative;
    transition: background-color 0.2s;
  }

  .hamburger::before,
  .hamburger::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 2px;
    background-color: var(--color-text);
    left: 0;
    transition: transform 0.2s;
  }

  .hamburger::before {
    top: -6px;
  }

  .hamburger::after {
    top: 6px;
  }

  .hamburger.open {
    background-color: transparent;
  }

  .hamburger.open::before {
    transform: translateY(6px) rotate(45deg);
  }

  .hamburger.open::after {
    transform: translateY(-6px) rotate(-45deg);
  }

  @media (max-width: 768px) {
    .mobile-toggle {
      display: block;
    }

    .nav-links {
      position: fixed;
      top: var(--nav-height);
      left: 0;
      right: 0;
      flex-direction: column;
      background-color: var(--color-bg-secondary);
      border-bottom: 1px solid var(--color-border);
      padding: 1rem;
      transform: translateY(-100%);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.3s, opacity 0.3s;
    }

    .nav-links.open {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .nav-user {
      display: none;
    }
  }
</style>
