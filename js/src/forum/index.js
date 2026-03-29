import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Forum from 'flarum/common/models/Forum';
import Model from 'flarum/common/Model';
import Avatar from 'flarum/common/components/Avatar';
import username from 'flarum/common/helpers/username';
import formatNumber from 'flarum/common/utils/formatNumber';
import Link from 'flarum/common/components/Link';
import Tooltip from 'flarum/common/components/Tooltip';
import IndexPage from 'flarum/forum/components/IndexPage';
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
        const isFullWidth = this.attrs.layout === 'full-width';

        // Toggle button click
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

        // In desktop full-width layout, clicking anywhere on the bar toggles expansion
        if (isFullWidth && this.attrs.viewport === 'desktop') {
            const bar = this.element.querySelector('.CompactWidget-bar');
            if (bar) {
                this.barEl = bar;
                this.boundBarClick = (e) => {
                    if (this.toggleEl && this.toggleEl.contains(e.target)) return;
                    e.stopPropagation();
                    this.expanded = !this.expanded;
                    m.redraw();
                };
                bar.addEventListener('click', this.boundBarClick);
            }
        }

        document.addEventListener('click', this.boundDocClick);
    }

    onremove(vnode) {
        super.onremove(vnode);
        if (this.toggleEl && this.boundToggleClick) {
            this.toggleEl.removeEventListener('click', this.boundToggleClick);
        }
        if (this.barEl && this.boundBarClick) {
            this.barEl.removeEventListener('click', this.boundBarClick);
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
        const isFullWidth = this.attrs.layout === 'full-width';
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

        const viewport = this.attrs.viewport;
        const isDesktopFullWidth = isFullWidth && viewport === 'desktop';

        // Helper: build a stat item with icon, number, and contextual label/tooltip.
        // - Desktop full-width: inline text label (lowercase, plural-aware), no tooltip
        // - Classic sidebar / mobile: tooltip on hover/tap (capitalized, always plural), no inline label
        const buildStat = (icon, value, tooltipKey, labelKey, extraClass) => {
            const inlineLabel = app.translator.trans(labelKey, { count: value });
            const tooltipText = app.translator.trans(tooltipKey);
            const accessibleLabel = formatNumber(value) + ' ' + inlineLabel;
            const statEl = m('span.CompactWidget-stat' + (extraClass || ''), {
                'aria-label': accessibleLabel,
                role: 'text',
            }, [
                m('i.fa-solid.' + icon, { 'aria-hidden': 'true' }),
                m('span', formatNumber(value)),
                isFullWidth ? m('span.CompactWidget-statLabel', inlineLabel) : null,
            ]);
            return isDesktopFullWidth ? statEl : m(Tooltip, { text: tooltipText }, statEl);
        };

        // Build stat items
        const stats = [];
        const pre = 'ekumanov-forum-widgets.forum.stats.';
        if (discussionsCount != null) {
            stats.push(buildStat('fa-comments', discussionsCount, pre + 'tooltip_discussions', pre + 'label_discussions'));
        }
        if (postsCount != null) {
            stats.push(buildStat('fa-comment', postsCount, pre + 'tooltip_posts', pre + 'label_posts'));
        }
        if (usersCount != null) {
            stats.push(buildStat('fa-user', usersCount, pre + 'tooltip_users', pre + 'label_users'));
        }
        if (hasOnline) {
            stats.push(buildStat('fa-user', totalOnline, pre + 'tooltip_online', pre + 'label_online', '.CompactWidget-stat--online'));
        }

        const isInToolbar = this.attrs.position === 'inside-toolbar';
        const hasExpandableContent = canViewOnline || latestUser;
        const classNames = [
            this.expanded ? 'CompactWidget--expanded' : '',
            isFullWidth ? 'CompactWidget--fullWidth' : '',
            isInToolbar ? 'CompactWidget--inToolbar' : '',
            viewport === 'desktop' ? 'CompactWidget--desktop' : '',
            viewport === 'mobile' ? 'CompactWidget--mobile' : '',
        ].filter(Boolean).join(' ');

        return m('section.CompactWidget', {
            className: classNames,
            'aria-label': app.translator.trans('ekumanov-forum-widgets.forum.stats.title'),
        }, [
            // Stats bar — clickable only in desktop full-width mode (JS listener in oncreate)
            m('.CompactWidget-bar', {
                role: isDesktopFullWidth && hasExpandableContent ? 'button' : undefined,
                tabIndex: isDesktopFullWidth && hasExpandableContent ? '0' : undefined,
                'aria-expanded': isDesktopFullWidth && hasExpandableContent ? String(this.expanded) : undefined,
            }, [
                m('.CompactWidget-stats', stats),

                // Expand/collapse arrow indicator
                hasExpandableContent
                    ? m('button.CompactWidget-toggle.Button.Button--icon.Button--link', {
                        'aria-label': this.expanded
                            ? app.translator.trans('ekumanov-forum-widgets.forum.aria.collapse_details')
                            : app.translator.trans('ekumanov-forum-widgets.forum.aria.expand_details'),
                        'aria-expanded': String(this.expanded),
                        tabIndex: isDesktopFullWidth ? '-1' : '0',
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

    // Helper: read settings lazily (app.forum is not available at initializer time)
    const getLayout = () => app.forum.attribute('forumStatsWidgetLayout') || 'full-width';
    const getDesktopPos = () => app.forum.attribute('forumStatsBarPositionDesktop') || 'inside-toolbar';
    const getMobilePos = () => app.forum.attribute('forumStatsBarPositionMobile') || 'above-toolbar';
    const contentPriority = (pos) => pos === 'above-toolbar' ? 101 : 95;

    // Desktop: classic sidebar layout
    extend(IndexSidebar.prototype, 'items', function (items) {
        if (getLayout() !== 'classic') return;
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') return;
        const position = app.forum.attribute('forumStatsWidgetPosition') || -10;
        items.add('compactForumWidget', m(CompactForumWidget, { layout: 'classic', viewport: 'desktop' }), position);
    });

    // Desktop: full-width inside toolbar
    extend(IndexPage.prototype, 'toolbarItems', function (items) {
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') return;
        if (getLayout() !== 'classic' && getDesktopPos() === 'inside-toolbar') {
            items.add('compactForumWidget', m(CompactForumWidget, { layout: 'full-width', position: 'inside-toolbar', viewport: 'desktop' }), 95);
        }
    });

    // Desktop: full-width above/below toolbar + Mobile: above/below toolbar
    extend(IndexPage.prototype, 'contentItems', function (items) {
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') return;

        if (getLayout() !== 'classic' && getDesktopPos() !== 'inside-toolbar') {
            items.add('compactForumWidget', m(CompactForumWidget, { layout: 'full-width', viewport: 'desktop' }), contentPriority(getDesktopPos()));
        }
        items.add('compactForumWidgetMobile', m(CompactForumWidget, { layout: 'full-width', viewport: 'mobile' }), contentPriority(getMobilePos()));
    });
});
