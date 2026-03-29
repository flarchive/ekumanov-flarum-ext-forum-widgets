import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';

app.initializers.add('ekumanov/forum-widgets', () => {
    const reg = app.registry.for('ekumanov-forum-widgets');

    // === Section: Widget Display ===
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.widget_layout',
        type: 'select',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_layout'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_layout_help'),
        options: {
            'classic': app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_layout_classic'),
            'full-width': app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_layout_full_width'),
        },
        default: 'full-width',
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.bar_position_desktop',
        type: 'select',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_desktop'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_desktop_help'),
        options: {
            'above-toolbar': app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_above'),
            'inside-toolbar': app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_inside'),
            'below-toolbar': app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_below'),
        },
        default: 'inside-toolbar',
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.bar_position_mobile',
        type: 'select',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_mobile'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_mobile_help'),
        options: {
            'above-toolbar': app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_above'),
            'below-toolbar': app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_below'),
        },
        default: 'above-toolbar',
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.widget_position',
        type: 'number',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_position'),
        help: app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_position_help'),
    });

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
        setting: 'ekumanov-forum-widgets.show_discussions_count',
        type: 'boolean',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.show_discussions_count'),
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.show_posts_count',
        type: 'boolean',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.show_posts_count'),
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.show_users_count',
        type: 'boolean',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.show_users_count'),
    });
    reg.registerSetting({
        setting: 'ekumanov-forum-widgets.show_latest_registration',
        type: 'boolean',
        label: app.translator.trans('ekumanov-forum-widgets.admin.settings.show_latest_registration'),
    });
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

    // Toggle-based conditional disabling of dependent settings
    const applyDependencies = (container) => {
        if (!container) return;

        const groups = container.querySelectorAll('.Form-group');
        const settingValues = {};

        // Collect current values of toggle/select settings
        groups.forEach(group => {
            const checkbox = group.querySelector('input[type="checkbox"]');
            const select = group.querySelector('select');
            const labelEl = group.querySelector('label');
            if (!labelEl) return;
            const labelText = labelEl.textContent || '';

            if (checkbox && labelText.indexOf(app.translator.trans('ekumanov-forum-widgets.admin.settings.show_online_users').toString()) > -1) {
                settingValues.showOnlineUsers = checkbox.checked;
                checkbox.removeEventListener('change', () => applyDependencies(container));
                checkbox.addEventListener('change', () => applyDependencies(container));
            }
            if (select && labelText.indexOf(app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_layout').toString()) > -1) {
                settingValues.widgetLayout = select.value;
                select.removeEventListener('change', () => applyDependencies(container));
                select.addEventListener('change', () => applyDependencies(container));
            }
        });

        // Labels for settings dependent on "Show online users"
        const onlineSettingLabels = [
            app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users').toString(),
            app.translator.trans('ekumanov-forum-widgets.admin.settings.max_online_users_privileged').toString(),
            app.translator.trans('ekumanov-forum-widgets.admin.settings.last_seen_interval').toString(),
            app.translator.trans('ekumanov-forum-widgets.admin.settings.online_users_cache_ttl').toString(),
        ];

        // Labels for layout-dependent settings
        const widgetPositionLabel = app.translator.trans('ekumanov-forum-widgets.admin.settings.widget_position').toString();
        const barPositionDesktopLabel = app.translator.trans('ekumanov-forum-widgets.admin.settings.bar_position_desktop').toString();

        // Apply disabled states
        groups.forEach(group => {
            const labelEl = group.querySelector('label');
            if (!labelEl) return;
            const labelText = labelEl.textContent || '';

            // Online user sub-settings
            if (onlineSettingLabels.some(sl => labelText.indexOf(sl) > -1)) {
                group.classList.toggle('ekumanov-forum-widgets-disabled', settingValues.showOnlineUsers === false);
            }

            // Widget position depends on classic layout
            if (labelText.indexOf(widgetPositionLabel) > -1) {
                group.classList.toggle('ekumanov-forum-widgets-disabled', settingValues.widgetLayout === 'full-width');
            }

            // Bar position (desktop) depends on full-width layout
            if (labelText.indexOf(barPositionDesktopLabel) > -1) {
                group.classList.toggle('ekumanov-forum-widgets-disabled', settingValues.widgetLayout !== 'full-width');
            }
        });
    };

    extend(ExtensionPage.prototype, 'oncreate', function () {
        if (this.extension && this.extension.id !== 'ekumanov-forum-widgets') return;
        // Bind event listeners for dependency toggles
        const boundApply = () => applyDependencies(this.element);
        setTimeout(boundApply, 100);
        this._ekumanovApplyDeps = boundApply;
    });

    extend(ExtensionPage.prototype, 'onupdate', function () {
        if (this.extension && this.extension.id !== 'ekumanov-forum-widgets') return;
        setTimeout(() => applyDependencies(this.element), 50);
    });
});
