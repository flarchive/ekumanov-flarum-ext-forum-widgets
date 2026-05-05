<?php

namespace Ekumanov\ForumWidgets\Api;

use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Cache\Repository as Cache;
use Laminas\Diactoros\Response\EmptyResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Records "this guest is here, right now" by hashing IP+UA and writing the
 * resulting fingerprint into a TTL'd map in the cache. The displayed guest
 * count is derived from the same map (entries with a recent timestamp). All
 * dedup is approximate: two guests behind the same NAT with the same browser
 * collapse into one, mobile users on a rotating IP can be double-counted.
 * That fuzziness is intentional — the alternative is a persistent client-side
 * identifier, which we explicitly chose not to introduce.
 */
class GuestHeartbeatController implements RequestHandlerInterface
{
    /**
     * Soft cap on the size of the guest presence map. Beyond this we evict
     * the oldest entry per write — bounds memory under sustained abuse
     * (one IP cycling User-Agent strings) regardless of how creative the
     * attacker gets.
     */
    public const MAX_ENTRIES = 2000;

    /**
     * Hard cap on heartbeats per IP per minute. Legitimate clients ping
     * roughly once per minute, so 6 leaves a generous buffer for retries
     * and clock drift while still throttling a flood from one source.
     */
    public const RATE_LIMIT_PER_MIN = 6;

    public const CACHE_KEY = 'ekumanov-forum-widgets.online-guests';

    public function __construct(
        protected Cache $cache,
        protected SettingsRepositoryInterface $settings
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // Feature gate. We still answer 204 (rather than 404 / error) so an
        // older client whose admin just turned the feature off doesn't spam
        // the logs — it just wastes a request until the page is reloaded.
        if (! (bool) $this->settings->get('ekumanov-forum-widgets.show_online_users', true)
            || ! (bool) $this->settings->get('ekumanov-forum-widgets.show_online_guests', false)) {
            return new EmptyResponse(204);
        }

        $ip = $this->resolveClientIp($request);

        // Per-IP rate limit, fixed 60s window. Cheap and memory-bounded
        // (one cache entry per active IP, all expire after 60s).
        $rlKey = 'ekumanov-forum-widgets.guest-rl.' . hash('sha256', $ip);
        $count = (int) $this->cache->get($rlKey, 0);
        if ($count >= self::RATE_LIMIT_PER_MIN) {
            return new EmptyResponse(429);
        }
        $this->cache->put($rlKey, $count + 1, 60);

        // Identifier collapses tabs from the same browser/network into one.
        // Truncated to keep the cached map compact (full SHA-256 is 64 hex
        // chars × thousands of entries adds up).
        $ua = $request->getHeaderLine('User-Agent');
        $hash = substr(hash('sha256', $ip . '|' . $ua), 0, 16);

        $intervalMin = max(1, (int) $this->settings->get('ekumanov-forum-widgets.last_seen_interval', 5));
        $now = time();
        $cutoff = $now - $intervalMin * 60;

        // Single-key hashmap of {hash → lastSeenTs}. Race-y under contention
        // (two concurrent writers can lose each other's update) but for a
        // fuzzy counter, an occasional dropped tick is acceptable.
        $guests = $this->cache->get(self::CACHE_KEY, []);
        if (! is_array($guests)) {
            $guests = [];
        }

        // Inline prune keeps the map bounded in steady state.
        $guests = array_filter($guests, fn ($ts) => $ts > $cutoff);

        // Hard cap: when full and the entry is new, evict the oldest. When
        // updating an existing entry, the count stays put so no eviction.
        if (! isset($guests[$hash]) && count($guests) >= self::MAX_ENTRIES) {
            asort($guests, SORT_NUMERIC);
            $guests = array_slice($guests, 1, null, true);
        }
        $guests[$hash] = $now;

        // Wrapping TTL = window + small grace. After this, the whole map
        // can be evicted; the next heartbeat rebuilds it from scratch.
        $this->cache->put(self::CACHE_KEY, $guests, $intervalMin * 60 + 60);

        return new EmptyResponse(204);
    }

    /**
     * Read the real client IP. Order: CF-Connecting-IP (set only by
     * Cloudflare; trustworthy when the origin firewall accepts CF traffic
     * only) → X-Forwarded-For (first hop) → REMOTE_ADDR. If the forum sits
     * directly on the public internet, only REMOTE_ADDR matters; if it's
     * behind a misconfigured proxy, the first two can be spoofed to inflate
     * the count, but the worst case remains "the displayed number is wrong".
     */
    protected function resolveClientIp(ServerRequestInterface $request): string
    {
        $cf = $request->getHeaderLine('CF-Connecting-IP');
        if ($cf !== '') {
            return trim($cf);
        }

        $xff = $request->getHeaderLine('X-Forwarded-For');
        if ($xff !== '') {
            $first = trim(explode(',', $xff)[0]);
            if ($first !== '') {
                return $first;
            }
        }

        $server = $request->getServerParams();

        return $server['REMOTE_ADDR'] ?? '';
    }
}
