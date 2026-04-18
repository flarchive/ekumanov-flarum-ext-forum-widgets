<?php

use Flarum\Database\Migration;
use Flarum\Group\Group;

return Migration::addPermissions([
    'ekumanov-forum-widgets.viewOnlineUsers' => Group::GUEST_ID,
    'ekumanov-forum-widgets.viewStats.discussionsCount' => Group::GUEST_ID,
    'ekumanov-forum-widgets.viewStats.postsCount' => Group::GUEST_ID,
    'ekumanov-forum-widgets.viewStats.usersCount' => Group::GUEST_ID,
    'ekumanov-forum-widgets.viewStats.latestMember' => Group::GUEST_ID,
]);
