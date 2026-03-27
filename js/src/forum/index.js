import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Forum from 'flarum/common/models/Forum';
import Model from 'flarum/common/Model';
import Avatar from 'flarum/common/components/Avatar';
import username from 'flarum/common/helpers/username';
import formatNumber from 'flarum/common/utils/formatNumber';
import Link from 'flarum/common/components/Link';
import Tooltip from 'flarum/common/components/Tooltip';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import Component from 'flarum/common/Component';

class CompactForumWidget extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.expanded = false;
        this.boundDocClick = this.onDocumentClick.bind(this);
    }

    oncreate(vnode) {
        super.oncreate(vnode);
        // Use native listener directly on the toggle button to avoid Mithril event delegation issues
        const toggle = this.element.querySelector('.CompactWidget-toggle');
        if (toggle) {
            this.toggleEl = toggle;
            this.boundToggleClick = (e) => {
                e.stopPropagation();
                this.expanded = !this.expanded;
                m.redraw();
            };
            toggle.addEventListener('click', this.boundToggleClick);
        }
        document.addEventListener('click', this.boundDocClick);
    }

    onremove(vnode) {
        super.onremove(vnode);
        if (this.toggleEl && this.boundToggleClick) {
            this.toggleEl.removeEventListener('click', this.boundToggleClick);
        }
        document.removeEventListener('click', this.boundDocClick);
    }

    onDocumentClick(e) {
        if (!this.expanded) return;
        if (this.element && this.element.contains(e.target)) return;
        this.expanded = false;
        m.redraw();
    }

    view() {
        const canViewOnline = app.forum.attribute('canViewOnlineUsers');
        const users = canViewOnline ? (app.forum.onlineUsers() || []) : [];
        const totalOnline = canViewOnline ? (app.forum.attribute('totalOnlineUsers') || 0) : 0;
        const hiddenOnline = canViewOnline ? (app.forum.attribute('hiddenOnlineUsers') || 0) : 0;

        const discussionsCount = app.forum.attribute('forumStatsDiscussionsCount');
        const postsCount = app.forum.attribute('forumStatsPostsCount');
        const usersCount = app.forum.attribute('forumStatsUsersCount');

        let latestUser = null;
        try {
            latestUser = app.forum.latestRegisteredUser();
        } catch (e) {}

        const hasAnyStat = discussionsCount != null || postsCount != null || usersCount != null;
        const hasOnline = canViewOnline && totalOnline > 0;
        const hasAnything = hasOnline || hasAnyStat;

        if (!hasAnything) return m('div');

        // Calculate overflow: visible users beyond the max that aren't shown as avatars
        const overflowCount = Math.max(0, totalOnline - users.length - hiddenOnline);

        // Build stat items with aria-labels for screen readers
        const stats = [];
        if (discussionsCount != null) {
            const label = app.translator.trans('ekumanov-forum-widgets.forum.stats.tooltip_discussions');
            stats.push(m(Tooltip, { text: label },
                m('span.CompactWidget-stat', { 'aria-label': formatNumber(discussionsCount) + ' ' + label, role: 'text' }, [
                    m('i.fa-solid.fa-comments', { 'aria-hidden': 'true' }),
                    m('span', formatNumber(discussionsCount)),
                ])
            ));
        }
        if (postsCount != null) {
            const label = app.translator.trans('ekumanov-forum-widgets.forum.stats.tooltip_posts');
            stats.push(m(Tooltip, { text: label },
                m('span.CompactWidget-stat', { 'aria-label': formatNumber(postsCount) + ' ' + label, role: 'text' }, [
                    m('i.fa-solid.fa-comment', { 'aria-hidden': 'true' }),
                    m('span', formatNumber(postsCount)),
                ])
            ));
        }
        if (usersCount != null) {
            const label = app.translator.trans('ekumanov-forum-widgets.forum.stats.tooltip_users');
            stats.push(m(Tooltip, { text: label },
                m('span.CompactWidget-stat', { 'aria-label': formatNumber(usersCount) + ' ' + label, role: 'text' }, [
                    m('i.fa-solid.fa-user', { 'aria-hidden': 'true' }),
                    m('span', formatNumber(usersCount)),
                ])
            ));
        }
        // Online users count — only shown when user has permission
        if (hasOnline) {
            const label = app.translator.trans('ekumanov-forum-widgets.forum.stats.tooltip_online');
            stats.push(m(Tooltip, { text: label },
                m('span.CompactWidget-stat.CompactWidget-stat--online', { 'aria-label': formatNumber(totalOnline) + ' ' + label, role: 'text' }, [
                    m('i.fa-solid.fa-user', { 'aria-hidden': 'true' }),
                    m('span', formatNumber(totalOnline)),
                ])
            ));
        }

        return m('section.CompactWidget', {
            className: this.expanded ? 'CompactWidget--expanded' : '',
            'aria-label': app.translator.trans('ekumanov-forum-widgets.forum.stats.title'),
        }, [
            // Stats bar
            m('.CompactWidget-bar', [
                m('.CompactWidget-stats', stats),

                // Expand/collapse toggle
                (canViewOnline || latestUser)
                    ? m('button.CompactWidget-toggle.Button.Button--icon.Button--link', {
                        'aria-label': this.expanded
                            ? app.translator.trans('ekumanov-forum-widgets.forum.aria.collapse_details')
                            : app.translator.trans('ekumanov-forum-widgets.forum.aria.expand_details'),
                        'aria-expanded': String(this.expanded),
                    }, m('i.fas', { className: this.expanded ? 'fa-chevron-up' : 'fa-chevron-down', 'aria-hidden': 'true' }))
                    : null,
            ]),

            // Expanded overlay panel
            this.expanded
                ? m('.CompactWidget-expanded', {
                    onclick: (e) => e.stopPropagation(),
                    role: 'region',
                    'aria-label': app.translator.trans('ekumanov-forum-widgets.forum.aria.details_panel'),
                }, [
                    // Online users list (first)
                    canViewOnline && (users.length > 0 || hiddenOnline > 0 || overflowCount > 0)
                        ? m('.CompactWidget-expandedSection', [
                            m('.CompactWidget-expandedLabel', { id: 'compact-widget-online' }, [
                                m('.CompactWidget-greenDot', { 'aria-hidden': 'true' }),
                                ' ',
                                app.translator.trans('ekumanov-forum-widgets.forum.online_users.title'),
                                ' (' + totalOnline + ')',
                            ]),
                            m('.CompactWidget-expandedUsersList', {
                                role: 'list',
                                'aria-labelledby': 'compact-widget-online',
                            }, [
                                // Individual user avatars
                                users.map(user =>
                                    m(Link, {
                                        href: app.route('user', { username: user.slug() }),
                                        className: 'CompactWidget-expandedUser',
                                        key: user.id(),
                                        role: 'listitem',
                                    }, [
                                        m(Avatar, { user: user }),
                                        m('span.CompactWidget-expandedUsername', user.displayName()),
                                    ])
                                ),
                                // Overflow indicator: "+N more"
                                overflowCount > 0
                                    ? m('.CompactWidget-expandedUser.CompactWidget-expandedUser--overflow', {
                                        role: 'listitem',
                                        'aria-label': app.translator.trans('ekumanov-forum-widgets.forum.aria.overflow_users', { count: overflowCount }),
                                    }, [
                                        m('span.CompactWidget-overflowAvatar', { 'aria-hidden': 'true' }, '+' + overflowCount),
                                        m('span.CompactWidget-expandedUsername.CompactWidget-expandedUsername--muted',
                                            app.translator.trans('ekumanov-forum-widgets.forum.online_users.overflow_more')
                                        ),
                                    ])
                                    : null,
                                // Hidden users indicator (dotted circle)
                                hiddenOnline > 0
                                    ? m('.CompactWidget-expandedUser.CompactWidget-expandedUser--hidden', {
                                        role: 'listitem',
                                        'aria-label': hiddenOnline + ' ' + app.translator.trans('ekumanov-forum-widgets.forum.online_users.hidden_users', { count: hiddenOnline }),
                                    }, [
                                        m('span.CompactWidget-hiddenAvatar', { 'aria-hidden': 'true' }, hiddenOnline),
                                        m('span.CompactWidget-expandedUsername.CompactWidget-expandedUsername--muted',
                                            app.translator.trans('ekumanov-forum-widgets.forum.online_users.hidden_users', { count: hiddenOnline })
                                        ),
                                    ])
                                    : null,
                            ]),
                        ])
                        : null,

                    // Latest registration (after online users)
                    latestUser
                        ? m('.CompactWidget-expandedSection', [
                            m('.CompactWidget-expandedLabel', { id: 'compact-widget-latest' },
                                app.translator.trans('ekumanov-forum-widgets.forum.stats.latest_registration')
                            ),
                            m(Link, {
                                href: app.route('user', { username: latestUser.slug() }),
                                className: 'CompactWidget-expandedUser',
                                'aria-labelledby': 'compact-widget-latest',
                            }, [
                                m(Avatar, { user: latestUser }),
                                m('span.CompactWidget-expandedUsername', username(latestUser)),
                            ]),
                        ])
                        : null,
                ])
                : null,
        ]);
    }
}

app.initializers.add('ekumanov/forum-widgets', () => {
    Forum.prototype.onlineUsers = Model.hasMany('onlineUsers');
    Forum.prototype.totalOnlineUsers = Model.attribute('totalOnlineUsers');
    Forum.prototype.hiddenOnlineUsers = Model.attribute('hiddenOnlineUsers');
    Forum.prototype.canViewOnlineUsers = Model.attribute('canViewOnlineUsers');
    Forum.prototype.latestRegisteredUser = Model.hasOne('latestRegisteredUser');

    extend(IndexSidebar.prototype, 'items', function (items) {
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') {
            return;
        }
        const position = app.forum.attribute('forumStatsWidgetPosition') || -10;
        items.add('compactForumWidget', m(CompactForumWidget), position);
    });
});
