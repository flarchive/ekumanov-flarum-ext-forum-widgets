<?php

namespace Ekumanov\ForumWidgets\Listener;

use Flarum\Discussion\Event\Started as DiscussionStarted;
use Flarum\Discussion\Event\Deleted as DiscussionDeleted;
use Flarum\Post\Event\Posted;
use Flarum\Post\Event\Deleted as PostDeleted;
use Flarum\User\Event\Deleted as UserDeleted;
use Flarum\User\Event\Registered;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Contracts\Events\Dispatcher;

class FlushCaches
{
    public function __construct(
        protected Cache $cache
    ) {}

    public function subscribe(Dispatcher $events): void
    {
        // User events — flush everything
        $events->listen(Registered::class, [$this, 'flushAll']);
        $events->listen(UserDeleted::class, [$this, 'flushAll']);

        // ALSO hook the low-level Eloquent model events. fof/anti-spam's
        // spamblock deletes users via a raw $user->delete()
        // (MarkUserAsSpammerHandler::handleUser), which fires Eloquent's
        // "deleted" event but NOT Flarum's domain-level User\Event\Deleted —
        // so the domain listeners above never run on a spamblock and a stale
        // "ghost" user is left in the stats/online cache. Core then serves
        // that row-less model and 500s the entire forum document via
        // loadAggregate(). These listeners cover every direct-Eloquent
        // create/delete path and flush synchronously in the same request.
        $events->listen('eloquent.deleted: ' . User::class, [$this, 'flushAll']);
        $events->listen('eloquent.created: ' . User::class, [$this, 'flushAll']);

        // Discussion/post events — flush stats cache only
        $events->listen(DiscussionStarted::class, [$this, 'flushStats']);
        $events->listen(DiscussionDeleted::class, [$this, 'flushStats']);
        $events->listen(Posted::class, [$this, 'flushStats']);
        $events->listen(PostDeleted::class, [$this, 'flushStats']);
    }

    public function flushAll($event): void
    {
        $this->cache->forget('ekumanov-forum-widgets.stats');
        $this->cache->forget('ekumanov-forum-widgets.online-users.admin');
        $this->cache->forget('ekumanov-forum-widgets.online-users.regular');
    }

    public function flushStats($event): void
    {
        $this->cache->forget('ekumanov-forum-widgets.stats');
    }
}
