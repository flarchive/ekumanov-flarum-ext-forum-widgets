# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Flarum forum extension (`ekumanov/flarum-ext-forum-widgets`) — **Forum Stats Widget** — that adds a compact sidebar widget to the forum index page showing:

1. **Online Users** — Avatars of currently online users with "+N more" overflow and hidden user indicators.
2. **Forum Statistics** — Discussion count, post count, user count, and latest registration.

Targets **Flarum 2.0 only** (uses `Extend\ApiResource`, `Schema\*` fields).

## Build Commands

All JS commands run from the `js/` directory:

```bash
cd js
npm run build   # production build → js/dist/forum.js + js/dist/admin.js
npm run dev     # development build with watch mode
```

Always use `npm ci` (not `npm install`) to install dependencies.

### Tests

There is no PHPUnit setup and deliberately no Composer dev dependencies. The one
executable check is a standalone harness for the guest presence counter:

```bash
php tests/guest-heartbeat.php   # exit 0 = pass
```

It stubs the few PSR/Flarum/Laminas interfaces the controller touches and then
loads the real `src/Api/GuestHeartbeatController.php`, so it exercises shipped
code rather than a copy. Run it after touching the heartbeat controller or
`getOnlineGuestsCount()` — the counting rules break silently, and a wrong guest
number still looks like a number in production.

Note `displayedCount()` in the harness mirrors `ForumResourceFields::getOnlineGuestsCount()`
by hand; if the counting rule changes, change both.

## Architecture

### PHP Backend

- **`extend.php`** — Registers JS, CSS (forum + admin), locales, settings defaults, API resource fields, endpoint includes, and event subscriber.
- **`src/ForumResourceFields.php`** — Adds fields to `ForumResource`: online user data (relationship + count, gated by `show_online_users` setting + permission) and forum statistics (counts + latest user relationship). Uses two-tier caching for online users (privileged vs regular), each with its own max display limit. All cached data includes hydrated user attributes (zero DB queries on cache hit).
- **`src/Listener/FlushCaches.php`** — Flushes caches on relevant events: all caches on user registration/deletion; stats cache on discussion/post creation/deletion.
- **`migrations/`** — Default settings and permissions (all stats visible to guests by default).

### JS Frontend

- **`js/src/forum/index.js`** — `CompactForumWidget` component with stats bar, expandable panel (online users → overflow → hidden → latest registration). Widget position configurable via `forumStatsWidgetPosition`. Auto-refreshes data on SPA navigation back to the index page.
- **`js/src/admin/index.js`** — Registers settings (with toggle-based conditional disabling for online user fields), and permissions. Extends ExtensionPage to add visual disable when "Show online users" is off.

### Settings

- `show_online_users` (bool) — Master toggle for the online users feature.
- `last_seen_interval` (int, default 5) — Minutes since last activity to consider online.
- `online_users_cache_ttl` (int, default 30) — Cache TTL for online users.
- `enable_heartbeat` (bool, default true) — Whether open, focused tabs send a background presence ping (members keep `last_seen_at` fresh; guests are counted). The guest route is CSRF-exempt in `extend.php` so tabs whose token has aged past the session lifetime don't 400. The client jitters its interval and backs off on repeated failure.
- `show_online_guests` (bool, default true) — Count unauthenticated visitors via the guest heartbeat endpoint.
- `include_guests_in_total` (bool, default true) — Sum members + guests in the bar's main online number.
- `stats_cache_duration` (int, default 600) — Cache TTL for discussion/post/user counts.
- `ignore_private_discussions` (bool) — Exclude private discussions from count.
- `widget_position` (int, default -10) — Sidebar priority (lower = further down).

> The number of online-user avatars rendered is a fixed cap (`MAX_DISPLAYED_ONLINE = 500` in `ForumResourceFields.php`), not an admin setting — the old `max_online_users` / `max_online_users_privileged` knobs were removed in v1.6 once user objects became sparsely serialized. Overflow beyond the cap degrades to the "+N more" row.

### Caching Strategy

- **Online users**: Two separate cache keys (`*.admin` and `*.regular`). The privileged cache (for users with `user.viewLastSeenAt` permission, typically admins/mods) includes users who have hidden their online status; the regular cache excludes hidden users (showing only a hidden-count). Both share the same `MAX_DISPLAYED_ONLINE` cap. TTL defaults to 30 seconds. Caches store full user attributes; on a cache hit a single indexed existence check drops any user whose row was deleted out-of-band (the ghost-user guard), otherwise zero DB queries. Both caches are flushed on user registration/deletion, including raw-Eloquent deletes (e.g. spamblock).
- **Forum stats**: Single cache key. TTL defaults to 600 seconds. Stores discussion/post/user counts and latest user attributes. Cache is flushed on discussion/post creation/deletion and user registration/deletion.

### Permissions

- `ekumanov-forum-widgets.viewOnlineUsers` — View online users.
- `ekumanov-forum-widgets.viewStats.discussionsCount` — View discussions count.
- `ekumanov-forum-widgets.viewStats.postsCount` — View posts count.
- `ekumanov-forum-widgets.viewStats.usersCount` — View users count.
- `ekumanov-forum-widgets.viewStats.latestMember` — View latest registration.
