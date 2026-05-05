<?php

namespace Ekumanov\ForumWidgets;

use Carbon\Carbon;
use Ekumanov\ForumWidgets\Api\GuestHeartbeatController;
use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Flarum\Post\CommentPost;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as Cache;

class ForumResourceFields
{
    protected ?array $onlineUserDataCache = null;
    protected ?string $onlineUserDataCacheKey = null;
    protected ?array $statsCache = null;

    public function __construct(
        protected Cache $cache,
        protected SettingsRepositoryInterface $settings
    ) {}

    public function __invoke(): array
    {
        return [
            // === Online Users ===

            Schema\Boolean::make('canViewOnlineUsers')
                ->get(fn ($model, Context $context) => $this->isOnlineUsersEnabled()
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers')),

            // Total online count — only visible when feature enabled + permission
            Schema\Integer::make('totalOnlineUsers')
                ->visible(fn ($model, Context $context) => $this->isOnlineUsersEnabled()
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers'))
                ->get(fn ($model, Context $context) => $this->getOnlineUserData($context->getActor())['total'] ?? 0),

            // Number of hidden online users
            Schema\Integer::make('hiddenOnlineUsers')
                ->visible(fn ($model, Context $context) => $this->isOnlineUsersEnabled()
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers'))
                ->get(fn ($model, Context $context) => $this->getOnlineUserData($context->getActor())['hidden'] ?? 0),

            Schema\Relationship\ToMany::make('onlineUsers')
                ->type('users')
                ->includable()
                ->visible(fn ($model, Context $context) => $this->isOnlineUsersEnabled()
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers'))
                ->get(fn ($model, Context $context) => $this->getOnlineUserModels($context->getActor())),

            // Expose widget settings to the frontend
            Schema\Integer::make('forumStatsWidgetPosition')
                ->get(fn () => (int) $this->settings->get('ekumanov-forum-widgets.widget_position', -10)),

            Schema\Str::make('forumStatsWidgetLayout')
                ->get(fn () => $this->settings->get('ekumanov-forum-widgets.widget_layout', 'full-width')),

            Schema\Str::make('forumStatsBarPositionDesktop')
                ->get(fn () => $this->settings->get('ekumanov-forum-widgets.bar_position_desktop', 'inside-toolbar')),

            Schema\Str::make('forumStatsBarPositionMobile')
                ->get(fn () => $this->settings->get('ekumanov-forum-widgets.bar_position_mobile', 'inside-toolbar')),

            Schema\Boolean::make('forumStatsShowToggle')
                ->get(fn () => (bool) $this->settings->get('ekumanov-forum-widgets.show_toggle', true)),

            Schema\Str::make('forumStatsExpandedPanelWidth')
                ->get(fn () => $this->settings->get('ekumanov-forum-widgets.expanded_panel_width', 'online-cell')),

            // Heartbeat: client pings /api/forums periodically so the auth middleware
            // refreshes last_seen_at. Gated by the online users master toggle since the
            // heartbeat exists to make the online widget accurate.
            Schema\Boolean::make('forumStatsEnableHeartbeat')
                ->get(fn () => $this->isOnlineUsersEnabled()
                    && (bool) $this->settings->get('ekumanov-forum-widgets.enable_heartbeat', true)),

            // === Online Guests ===
            // Reuses the viewOnlineUsers permission — there's no separate "see guests"
            // permission since guest presence is part of the same online-users feature.

            // Tells the JS whether to fire guest heartbeats. Suppressed when the actor
            // can't view online users, so a guest with denied perms doesn't bother pinging.
            Schema\Boolean::make('forumStatsShowOnlineGuests')
                ->visible(fn ($model, Context $context) => $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers'))
                ->get(fn () => $this->isOnlineGuestsEnabled()),

            // Whether the bar's main online number should sum members + guests.
            // Frontend reads this to decide between two display modes.
            Schema\Boolean::make('forumStatsIncludeGuestsInTotal')
                ->visible(fn ($model, Context $context) => $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers'))
                ->get(fn () => $this->isOnlineGuestsEnabled()
                    && (bool) $this->settings->get('ekumanov-forum-widgets.include_guests_in_total', false)),

            Schema\Integer::make('onlineGuestsCount')
                ->visible(fn ($model, Context $context) => $this->isOnlineGuestsEnabled()
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewOnlineUsers'))
                ->get(fn () => $this->getOnlineGuestsCount()),

            // === Forum Statistics ===

            Schema\Integer::make('forumStatsDiscussionsCount')
                ->visible(fn ($model, Context $context) => (bool) $this->settings->get('ekumanov-forum-widgets.show_discussions_count', true)
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewStats.discussionsCount'))
                ->get(fn ($model, Context $context) => $this->getStats()['discussion_count'] ?? 0),

            Schema\Integer::make('forumStatsPostsCount')
                ->visible(fn ($model, Context $context) => (bool) $this->settings->get('ekumanov-forum-widgets.show_posts_count', true)
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewStats.postsCount'))
                ->get(fn ($model, Context $context) => $this->getStats()['post_count'] ?? 0),

            Schema\Integer::make('forumStatsUsersCount')
                ->visible(fn ($model, Context $context) => (bool) $this->settings->get('ekumanov-forum-widgets.show_users_count', true)
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewStats.usersCount'))
                ->get(fn ($model, Context $context) => $this->getStats()['user_count'] ?? 0),

            Schema\Relationship\ToOne::make('latestRegisteredUser')
                ->type('users')
                ->includable()
                ->visible(fn ($model, Context $context) => (bool) $this->settings->get('ekumanov-forum-widgets.show_latest_registration', true)
                    && $context->getActor()->hasPermission('ekumanov-forum-widgets.viewStats.latestMember'))
                ->get(fn ($model, Context $context) => $this->getLatestUser()),
        ];
    }

    protected function isOnlineUsersEnabled(): bool
    {
        return (bool) $this->settings->get('ekumanov-forum-widgets.show_online_users', true);
    }

    protected function isOnlineGuestsEnabled(): bool
    {
        return $this->isOnlineUsersEnabled()
            && (bool) $this->settings->get('ekumanov-forum-widgets.show_online_guests', false);
    }

    /**
     * Counts entries in the guest presence map whose timestamp is still within
     * the configured window. The map is the same one the heartbeat writes to —
     * this is just a reader. No DB queries; pure cache hit on every read.
     */
    protected function getOnlineGuestsCount(): int
    {
        $guests = $this->cache->get(GuestHeartbeatController::CACHE_KEY, []);
        if (! is_array($guests) || empty($guests)) {
            return 0;
        }

        $intervalMin = max(1, (int) $this->settings->get('ekumanov-forum-widgets.last_seen_interval', 5));
        $cutoff = time() - $intervalMin * 60;

        $count = 0;
        foreach ($guests as $ts) {
            if ($ts > $cutoff) {
                $count++;
            }
        }

        return $count;
    }

    protected function getOnlineUserData(User $actor): array
    {
        $canSeeHidden = $actor->hasPermission('user.viewLastSeenAt');
        $cacheKey = $canSeeHidden
            ? 'ekumanov-forum-widgets.online-users.admin'
            : 'ekumanov-forum-widgets.online-users.regular';

        // In-memory cache for the same request
        if ($this->onlineUserDataCacheKey === $cacheKey && $this->onlineUserDataCache !== null) {
            return $this->onlineUserDataCache;
        }

        $ttl = max(1, (int) $this->settings->get('ekumanov-forum-widgets.online_users_cache_ttl', 30));
        $interval = max(1, (int) $this->settings->get('ekumanov-forum-widgets.last_seen_interval', 5));
        $maxUsers = $canSeeHidden
            ? max(1, (int) $this->settings->get('ekumanov-forum-widgets.max_online_users_privileged', 40))
            : max(1, (int) $this->settings->get('ekumanov-forum-widgets.max_online_users', 15));

        $data = $this->cache->remember($cacheKey, $ttl, function () use ($canSeeHidden, $interval, $maxUsers) {
            $allOnlineQuery = User::query()
                ->where('last_seen_at', '>', Carbon::now()->subMinutes($interval));

            $totalAll = (clone $allOnlineQuery)->count();

            if ($canSeeHidden) {
                // Admin/privileged: sees all online users (hidden and non-hidden)
                $users = $allOnlineQuery->orderBy('last_seen_at', 'desc')
                    ->limit($maxUsers)
                    ->get();

                return [
                    'users' => $users->map(fn (User $u) => $u->getAttributes())->all(),
                    'total' => $totalAll,
                    'hidden' => 0,
                ];
            } else {
                // Regular: only visible user avatars/names, plus count of hidden ones
                $visibleQuery = clone $allOnlineQuery;
                $visibleQuery->where(function ($q) {
                    $q->whereNull('preferences')
                        ->orWhereRaw("JSON_EXTRACT(preferences, '$.discloseOnline') IS NULL")
                        ->orWhereRaw("JSON_EXTRACT(preferences, '$.discloseOnline') != false");
                });

                $totalVisible = (clone $visibleQuery)->count();
                $hidden = $totalAll - $totalVisible;

                $users = $visibleQuery->orderBy('last_seen_at', 'desc')
                    ->limit($maxUsers)
                    ->get();

                return [
                    'users' => $users->map(fn (User $u) => $u->getAttributes())->all(),
                    'total' => $totalAll,
                    'hidden' => $hidden,
                ];
            }
        }) ?: ['users' => [], 'total' => 0, 'hidden' => 0];

        $this->onlineUserDataCacheKey = $cacheKey;
        $this->onlineUserDataCache = $data;

        return $data;
    }

    /**
     * Reconstruct User models from cached attributes — zero DB queries on cache hit.
     */
    protected function getOnlineUserModels(User $actor): array
    {
        $data = $this->getOnlineUserData($actor);

        if (empty($data['users'])) {
            return [];
        }

        return array_map(function (array $attributes) {
            $user = new User();
            $user->setRawAttributes($attributes, true);
            $user->exists = true;

            return $user;
        }, $data['users']);
    }

    protected function getStats(): array
    {
        if ($this->statsCache !== null) {
            return $this->statsCache;
        }

        $ttl = max(0, (int) $this->settings->get('ekumanov-forum-widgets.stats_cache_duration', 600));

        if ($ttl === 0) {
            $this->statsCache = $this->buildStats();
        } else {
            $this->statsCache = $this->cache->remember(
                'ekumanov-forum-widgets.stats',
                $ttl,
                fn () => $this->buildStats()
            ) ?: [];
        }

        return $this->statsCache;
    }

    protected function buildStats(): array
    {
        $ignorePrivate = (bool) $this->settings->get('ekumanov-forum-widgets.ignore_private_discussions', false);

        $latestUser = User::query()->orderBy('joined_at', 'desc')->first();

        return [
            'discussion_count' => $ignorePrivate
                ? Discussion::query()->where('is_private', false)->count()
                : Discussion::query()->count(),
            'post_count' => CommentPost::query()->count(),
            'user_count' => User::query()->count(),
            'latest_user' => $latestUser ? $latestUser->getAttributes() : null,
        ];
    }

    /**
     * Reconstruct the latest User model from cached attributes — zero DB queries on cache hit.
     */
    protected function getLatestUser(): ?User
    {
        $stats = $this->getStats();
        $attributes = $stats['latest_user'] ?? null;

        if (! $attributes) {
            return null;
        }

        $user = new User();
        $user->setRawAttributes($attributes, true);
        $user->exists = true;

        return $user;
    }
}
