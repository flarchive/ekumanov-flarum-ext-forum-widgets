import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Forum from 'flarum/common/models/Forum';
import Model from 'flarum/common/Model';
import Avatar from 'flarum/common/components/Avatar';
import username from 'flarum/common/helpers/username';
import formatNumber from 'flarum/common/utils/formatNumber';
import extractText from 'flarum/common/utils/extractText';
import Link from 'flarum/common/components/Link';
import Tooltip from 'flarum/common/components/Tooltip';
import IndexPage from 'flarum/forum/components/IndexPage';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import Component from 'flarum/common/Component';

// Shared promise so stacked widgets (desktop + mobile) coalesce into one fetch.
let inflightRefresh = null;

// Cheap check: does the current actor have any visible widget data on the forum resource?
// Permission/visibility gating happens server-side (ForumResourceFields), so if none of these
// attributes were serialized on initial load, the actor has no reason to refetch. Skipping
// saves a round-trip for guests who've been denied all widget fields.
function hasVisibleWidgetData() {
    const f = app.forum;
    if (!f) return false;
    if (f.attribute('canViewOnlineUsers')) return true;
    if (f.attribute('forumStatsDiscussionsCount') != null) return true;
    if (f.attribute('forumStatsPostsCount') != null) return true;
    if (f.attribute('forumStatsUsersCount') != null) return true;
    try { if (f.latestRegisteredUser()) return true; } catch (e) {}
    return false;
}

function refreshForumData() {
    if (!hasVisibleWidgetData()) return Promise.resolve();
    if (inflightRefresh) return inflightRefresh;
    // Flarum 2.0's ForumResource is a singleton keyed at /api/forums (no /:id),
    // so we call the 2-arg form of Store.find — passing an id would hit /api/forums/1 and 404.
    inflightRefresh = app.store
        .find('forums', { include: 'onlineUsers,latestRegisteredUser' })
        .catch(() => {})
        .then(() => {
            inflightRefresh = null;
            m.redraw();
        });
    return inflightRefresh;
}

class CompactForumWidget extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.expanded = false;
        this.boundDocClick = this.onDocumentClick.bind(this);
        this.boundVisChange = () => {
            if (document.visibilityState === 'visible') refreshForumData();
        };
    }

    oncreate(vnode) {
        super.oncreate(vnode);
        document.addEventListener('click', this.boundDocClick);
        document.addEventListener('visibilitychange', this.boundVisChange);
    }

    onremove(vnode) {
        super.onremove(vnode);
        document.removeEventListener('click', this.boundDocClick);
        document.removeEventListener('visibilitychange', this.boundVisChange);
    }

    onDocumentClick(e) {
        if (!this.expanded) return;
        if (this.element && this.element.contains(e.target)) return;
        this.expanded = false;
        m.redraw();
    }

    view() {
        const isFullWidth = this.attrs.layout === 'full-width';
        const viewport = this.attrs.viewport;
        const isMobile = viewport === 'mobile';
        const isDesktop = viewport === 'desktop';
        const isDesktopFullWidth = isFullWidth && isDesktop;

        const showToggle = app.forum.attribute('forumStatsShowToggle') !== false;
        const expandedPanelWidth = isDesktopFullWidth
            ? (app.forum.attribute('forumStatsExpandedPanelWidth') || 'full-bar')
            : 'full-bar';
        const isOnlineCellMode = expandedPanelWidth === 'online-cell';

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

        const overflowCount = Math.max(0, totalOnline - users.length - hiddenOnline);
        const hasExpandableContent = canViewOnline || latestUser;

        // Toggle is placed inline (inside online cell wrapper) on:
        // - Mobile (always, when online users are shown)
        // - Desktop online-cell mode (toggle anchors the dropdown to the online cell)
        // Falls back to bar-end if no online users are shown.
        const inlineToggle = hasOnline && (isMobile || (isDesktopFullWidth && isOnlineCellMode));

        const isInToolbar = this.attrs.position === 'inside-toolbar';
        const isAboveFooter = this.attrs.position === 'above-footer';

        const classNames = [
            this.expanded ? 'CompactWidget--expanded' : '',
            isFullWidth ? 'CompactWidget--fullWidth' : '',
            isInToolbar ? 'CompactWidget--inToolbar' : '',
            isAboveFooter ? 'CompactWidget--aboveFooter' : '',
            isDesktop ? 'CompactWidget--desktop' : '',
            isMobile ? 'CompactWidget--mobile' : '',
            isDesktopFullWidth && !isOnlineCellMode ? 'CompactWidget--fullBar' : '',
            isDesktopFullWidth && isOnlineCellMode ? 'CompactWidget--onlineCell' : '',
        ].filter(Boolean).join(' ');

        const pre = 'ekumanov-forum-widgets.forum.stats.';

        // buildStat: creates a stat element with optional tooltip.
        // Tooltips are shown on classic-sidebar desktop and mobile; never in full-width desktop
        // (which has inline labels or tappable cells instead).
        // noTooltip: suppress the tooltip explicitly (e.g. online stat on mobile, where tapping
        // the cell expands the panel and a tooltip would flicker on touch).
        const buildStat = (icon, value, tooltipKey, labelKey, extraClass, noTooltip) => {
            const inlineLabel = app.translator.trans(labelKey, { count: value });
            const tooltipText = app.translator.trans(tooltipKey);
            const accessibleLabel = formatNumber(value) + ' ' + inlineLabel;
            const useTooltip = !noTooltip && !isDesktopFullWidth;
            const statEl = m('span.CompactWidget-stat' + (extraClass || ''), {
                'aria-label': accessibleLabel,
                role: 'text',
            }, [
                m('i.fa-solid.' + icon, { 'aria-hidden': 'true' }),
                m('span', formatNumber(value)),
                isFullWidth ? m('span.CompactWidget-statLabel', inlineLabel) : null,
            ]);
            return useTooltip ? m(Tooltip, { text: tooltipText }, statEl) : statEl;
        };

        // Toggle button (shared between inline and bar-end placements)
        const toggleButton = hasExpandableContent && showToggle
            ? m('button.CompactWidget-toggle.Button.Button--icon.Button--link', {
                onclick: (e) => { e.stopPropagation(); this.expanded = !this.expanded; m.redraw.sync(); },
                'aria-label': this.expanded
                    ? app.translator.trans('ekumanov-forum-widgets.forum.aria.collapse_details')
                    : app.translator.trans('ekumanov-forum-widgets.forum.aria.expand_details'),
                'aria-expanded': String(this.expanded),
                tabIndex: (!inlineToggle && isDesktopFullWidth) ? '-1' : '0',
            }, m('i.fas', { className: this.expanded ? 'fa-chevron-up' : 'fa-chevron-down', 'aria-hidden': 'true' }))
            : null;

        // Expanded panel content (positioning differs by mode — rendered in different places below)
        const expandedPanel = this.expanded
            ? m('.CompactWidget-expanded', {
                onclick: (e) => e.stopPropagation(),
                role: 'region',
                'aria-label': app.translator.trans('ekumanov-forum-widgets.forum.aria.details_panel'),
            }, [
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
            : null;

        // Build stats in order: online (1), users (2), discussions (3), posts (4)
        const stats = [];

        // Merge online + users into a single "N/M" cell on mobile inside-toolbar mode,
        // where horizontal space is tight (Latest dropdown + Mark-all-read button share the row).
        // Shows online icon + "online/total", click opens the expanded panel.
        const mergeOnlineUsers = isMobile && isInToolbar && hasOnline && usersCount != null;

        // Online users — first. Whenever clicking the online cell should open the panel
        // (everywhere except desktop full-bar mode, where the whole bar is the click target),
        // we wrap the stat in an interactive `.CompactWidget-onlineWrapper` div.
        if (mergeOnlineUsers) {
            const mergedValue = formatNumber(totalOnline) + '/' + formatNumber(usersCount);
            const accessibleLabel = extractText(app.translator.trans('ekumanov-forum-widgets.forum.stats.label_online_over_total', {
                online: totalOnline,
                total: usersCount,
            }));
            const mergedStat = m('span.CompactWidget-stat.CompactWidget-stat--online.CompactWidget-stat--merged', {
                'aria-label': accessibleLabel,
                role: 'text',
            }, [
                m('i.fa-solid.fa-user', { 'aria-hidden': 'true' }),
                m('span', mergedValue),
            ]);
            // Skip the chevron entirely when merged — the "N/M" number pair needs every
            // pixel on this already-cramped mobile toolbar row. Tapping the cell still
            // opens the panel, so losing the chevron has no functional impact.
            stats.push(m('.CompactWidget-onlineWrapper', {
                onclick: (e) => { e.stopPropagation(); this.expanded = !this.expanded; m.redraw.sync(); },
                onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.expanded = !this.expanded; m.redraw.sync(); } },
                role: 'button',
                tabIndex: '0',
                'aria-expanded': String(this.expanded),
            }, [
                mergedStat,
            ]));
        } else if (hasOnline) {
            // Online cell is clickable in classic sidebar, mobile, and desktop online-cell modes —
            // anywhere except desktop full-bar, which handles clicks on the entire bar.
            const onlineCellClickable = hasExpandableContent && !(isDesktopFullWidth && !isOnlineCellMode);
            // Skip the tooltip when the cell IS the primary click target in a layout without
            // inline labels or a hovered bar (mobile + desktop online-cell). Classic keeps the
            // tooltip because icons there have no visible label.
            const noOnlineTooltip = inlineToggle;
            const onlineStat = buildStat('fa-user', totalOnline, pre + 'tooltip_online', pre + 'label_online', '.CompactWidget-stat--online', noOnlineTooltip);

            if (onlineCellClickable) {
                stats.push(m('.CompactWidget-onlineWrapper', {
                    onclick: (e) => { e.stopPropagation(); this.expanded = !this.expanded; m.redraw.sync(); },
                    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.expanded = !this.expanded; m.redraw.sync(); } },
                    role: 'button',
                    tabIndex: '0',
                    'aria-expanded': String(this.expanded),
                }, [
                    onlineStat,
                    // Chevron goes inside the wrapper only when `inlineToggle` (mobile or
                    // desktop online-cell). Classic keeps the chevron at bar-end.
                    inlineToggle ? toggleButton : null,
                    // Panel inside wrapper only in desktop online-cell mode
                    isDesktopFullWidth && isOnlineCellMode ? expandedPanel : null,
                ]));
            } else {
                stats.push(onlineStat);
            }
        }

        // Users count — second. Skipped when merged with online above.
        if (usersCount != null && !mergeOnlineUsers) {
            stats.push(buildStat('fa-user', usersCount, pre + 'tooltip_users', pre + 'label_users', ''));
        }
        // Discussions count — third
        if (discussionsCount != null) {
            stats.push(buildStat('fa-comments', discussionsCount, pre + 'tooltip_discussions', pre + 'label_discussions', ''));
        }
        // Posts count — fourth
        if (postsCount != null) {
            stats.push(buildStat('fa-comment', postsCount, pre + 'tooltip_posts', pre + 'label_posts', ''));
        }

        // Bar is clickable in full-bar desktop mode only
        const barClickable = isDesktopFullWidth && !isOnlineCellMode && hasExpandableContent;

        return m('section.CompactWidget', {
            className: classNames,
            'aria-label': app.translator.trans('ekumanov-forum-widgets.forum.stats.title'),
        }, [
            m('.CompactWidget-bar', {
                onclick: barClickable
                    ? (e) => { e.stopPropagation(); this.expanded = !this.expanded; m.redraw.sync(); }
                    : undefined,
                onkeydown: barClickable
                    ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.expanded = !this.expanded; m.redraw.sync(); } }
                    : undefined,
                role: barClickable ? 'button' : undefined,
                tabIndex: barClickable ? '0' : undefined,
                'aria-expanded': barClickable ? String(this.expanded) : undefined,
            }, [
                m('.CompactWidget-stats', stats),
                // End-of-bar toggle: full-bar desktop mode or sidebar/mobile when no online users
                !inlineToggle ? toggleButton : null,
            ]),

            // Expanded panel at bar level for full-bar desktop and mobile
            // (online-cell desktop renders panel inside the online wrapper above)
            !isOnlineCellMode ? expandedPanel : null,
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
    // contentItems priorities: Flarum renders higher priority earlier. Toolbar is ~100 and the
    // discussion list is below that. -1000 drops the widget to the end of IndexPage content,
    // rendering it directly above the site footer.
    const contentPriority = (pos) => {
        if (pos === 'above-toolbar') return 101;
        if (pos === 'above-footer') return -1000;
        return 95; // below-toolbar
    };

    // Desktop: classic sidebar layout
    extend(IndexSidebar.prototype, 'items', function (items) {
        if (getLayout() !== 'classic') return;
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') return;
        const position = app.forum.attribute('forumStatsWidgetPosition') || -10;
        items.add('compactForumWidget', m(CompactForumWidget, { layout: 'classic', viewport: 'desktop' }), position);
    });

    // Inside-toolbar placements (desktop full-width + mobile)
    extend(IndexPage.prototype, 'toolbarItems', function (items) {
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') return;
        if (getLayout() !== 'classic' && getDesktopPos() === 'inside-toolbar') {
            items.add('compactForumWidget', m(CompactForumWidget, { layout: 'full-width', position: 'inside-toolbar', viewport: 'desktop' }), 95);
        }
        if (getMobilePos() === 'inside-toolbar') {
            items.add('compactForumWidgetMobile', m(CompactForumWidget, { layout: 'full-width', position: 'inside-toolbar', viewport: 'mobile' }), 95);
        }
    });

    // Desktop full-width above/below/footer + Mobile above/below/footer (not inside-toolbar).
    extend(IndexPage.prototype, 'contentItems', function (items) {
        const routeName = app.current && app.current.get('routeName');
        if (routeName !== 'index') return;

        if (getLayout() !== 'classic' && getDesktopPos() !== 'inside-toolbar') {
            items.add('compactForumWidget', m(CompactForumWidget, { layout: 'full-width', viewport: 'desktop', position: getDesktopPos() }), contentPriority(getDesktopPos()));
        }
        if (getMobilePos() !== 'inside-toolbar') {
            items.add('compactForumWidgetMobile', m(CompactForumWidget, { layout: 'full-width', viewport: 'mobile', position: getMobilePos() }), contentPriority(getMobilePos()));
        }
    });

    // Refresh widget data when returning to the index via SPA navigation.
    // `app.previous?.type` is falsy on the very first page load (initial bootstrap
    // already hydrated the forum resource), so this only fires on re-entry.
    extend(IndexPage.prototype, 'oninit', function () {
        if (app.previous?.type) refreshForumData();
    });
});
