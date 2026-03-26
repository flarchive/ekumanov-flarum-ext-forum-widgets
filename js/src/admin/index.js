import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';

app.initializers.add('ekumanov/forum-widgets', () => {
    const reg = app.registry.for('ekumanov-forum-widgets');

    // === Section: Online Users ===
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.show_online_users',
        type: 'boolean',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.show_online_users'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.show_online_users_help'),
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.max_online_users',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users_help'),
        min: 1,
        max: 50,
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.max_online_users_privileged',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users_privileged'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users_privileged_help'),
        min: 1,
        max: 100,
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.last_seen_interval',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.last_seen_interval'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.last_seen_interval_help'),
        min: 1,
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.online_users_cache_ttl',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.online_users_cache_ttl'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.online_users_cache_ttl_help'),
        min: 0,
    });

    // === Section: Forum Statistics ===
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.stats_cache_duration',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.stats_cache_duration'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.stats_cache_duration_help'),
        min: 0,
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.ignore_private_discussions',
        type: 'boolean',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.ignore_private_discussions'),
    });

    // === Section: Widget Display ===
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.widget_position',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_position'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_position_help'),
    });

    // === Permissions ===
    reg.registerPermission({
        icon: 'fas fa-users',
        label: app.translator.trans('ekumanov-forum-widgets.admin.permissions.view_online_users'),
        permission: 'ekumanov-forum-widgets.viewOnlineUsers',
        allowGuest: true,
    }, 'view');

    reg.registerPermission({
        icon: 'fas fa-chart-bar',
        label: app.translator.trans('ekumanov-forum-widgets.admin.permissions.view_discussions_count'),
        permission: 'ekumanov-forum-widgets.viewStats.discussionsCount',
        allowGuest: true,
    }, 'view');
    reg.registerPermission({
        icon: 'fas fa-chart-bar',
        label: app.translator.trans('ekumanov-forum-widgets.admin.permissions.view_posts_count'),
        permission: 'ekumanov-forum-widgets.viewStats.postsCount',
        allowGuest: true,
    }, 'view');
    reg.registerPermission({
        icon: 'fas fa-chart-bar',
        label: app.translator.trans('ekumanov-forum-widgets.admin.permissions.view_users_count'),
        permission: 'ekumanov-forum-widgets.viewStats.usersCount',
        allowGuest: true,
    }, 'view');
    reg.registerPermission({
        icon: 'fas fa-chart-bar',
        label: app.translator.trans('ekumanov-forum-widgets.admin.permissions.view_latest_registration'),
        permission: 'ekumanov-forum-widgets.viewStats.latestMember',
        allowGuest: true,
    }, 'view');

    // Add section headers and toggle-based disabling of online user settings
    extend(ExtensionPage.prototype, 'oncreate', function (vnode) {
        if (this.extension && this.extension.id !== 'ekumanov-forum-widgets') return;

        const applyToggleState = () => {
            const container = this.element;
            if (!container) return;

            // Find all Form-group elements
            const groups = container.querySelectorAll('.Form-group');

            // Find the toggle checkbox
            let toggleChecked = true;
            groups.forEach(group => {
                const checkbox = group.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    const label = group.textContent || '';
                    if (label.indexOf(app.translator.trans('ekumanov-forum-widgets.admin.settings.show_online_users').toString()) > -1) {
                        toggleChecked = checkbox.checked;
                        // Listen for changes
                        checkbox.removeEventListener('change', applyToggleState);
                        checkbox.addEventListener('change', applyToggleState);
                    }
                }
            });

            // Setting labels that should be disabled when online users toggle is off
            const settingLabels = [
                app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users').toString(),
                app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users_privileged').toString(),
                app.translator.trans('ekumanov-forum-widgets.admin.settings.last_seen_interval').toString(),
                app.translator.trans('ekumanov-forum-widgets.admin.settings.online_users_cache_ttl').toString(),
            ];

            // Apply disabled state to dependent settings
            groups.forEach(group => {
                const input = group.querySelector('input[type="number"]');
                if (!input) return;
                const label = group.querySelector('label');
                if (!label) return;
                const labelText = label.textContent || '';
                const isOnlineSetting = settingLabels.some(sl => labelText.indexOf(sl) > -1);
                if (isOnlineSetting) {
                    group.classList.toggle('ekumanov-forum-widgets-online-disabled', !toggleChecked);
                }
            });
        };

        // Run after render
        setTimeout(applyToggleState, 100);
    });

    extend(ExtensionPage.prototype, 'onupdate', function () {
        if (this.extension && this.extension.id !== 'ekumanov-forum-widgets') return;
        // Re-apply after Mithril re-renders
        setTimeout(() => {
            const container = this.element;
            if (!container) return;
            const groups = container.querySelectorAll('.Form-group');
            let toggleChecked = true;
            groups.forEach(group => {
                const checkbox = group.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    const label = group.textContent || '';
                    if (label.indexOf(app.translator.trans('ekumanov-forum-widgets.admin.settings.show_online_users').toString()) > -1) {
                        toggleChecked = checkbox.checked;
                    }
                }
            });
            const settingLabels = [
                app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users').toString(),
                app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users_privileged').toString(),
                app.translator.trans('ekumanov-forum-widgets.admin.settings.last_seen_interval').toString(),
                app.translator.trans('ekumanov-forum-widgets.admin.settings.online_users_cache_ttl').toString(),
            ];
            groups.forEach(group => {
                const label = group.querySelector('label');
                if (!label) return;
                const labelText = label.textContent || '';
                const isOnlineSetting = settingLabels.some(sl => labelText.indexOf(sl) > -1);
                if (isOnlineSetting) {
                    group.classList.toggle('ekumanov-forum-widgets-online-disabled', !toggleChecked);
                }
            });
        }, 50);
    });
});
