<?php

namespace Ekumanov\ForumWidgets\Listener;

use Flarum\Discussion\Event\Started as DiscussionStarted;
use Flarum\Discussion\Event\Deleted as DiscussionDeleted;
use Flarum\Post\Event\Posted;
use Flarum\Post\Event\Deleted as PostDeleted;
use Flarum\User\Event\Deleted as UserDeleted;
use Flarum\User\Event\Registered;
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
