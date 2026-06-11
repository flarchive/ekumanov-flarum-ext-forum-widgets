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

    /**
     * Cloudflare's published edge ranges (https://www.cloudflare.com/ips/).
     * CF-Connecting-IP is only honoured when the request actually arrived from
     * one of these — otherwise that header is whatever the caller chose to send.
     * Last reviewed 2026-06; refresh if Cloudflare ever changes its ranges (rare).
     */
    protected const CLOUDFLARE_RANGES = [
        '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
        '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
        '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
        '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
        '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
        '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
    ];

    public function __construct(
        protected Cache $cache,
        protected SettingsRepositoryInterface $settings
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // Feature gate. We still answer 204 (rather than 404 / error) so an
        // older client whose admin just turned the feature off doesn't spam
        // the logs — it just wastes a request until the page is reloaded.
        // `enable_heartbeat` is included so that disabling the heartbeat truly
        // records nothing, even for a stale client still posting on its own.
        if (! (bool) $this->settings->get('ekumanov-forum-widgets.show_online_users', true)
            || ! (bool) $this->settings->get('ekumanov-forum-widgets.show_online_guests', true)
            || ! (bool) $this->settings->get('ekumanov-forum-widgets.enable_heartbeat', true)) {
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
     * Read the real client IP, trusting forwarded headers only when the actual
     * connecting peer is entitled to set them. This matters because the route is
     * unauthenticated and CSRF-exempt: both the rate limit and the guest
     * fingerprint key off this value, so a blindly-trusted CF-Connecting-IP /
     * X-Forwarded-For would let anyone hitting the origin directly forge a fresh
     * identity per request — bypassing the per-IP limit and inflating the count.
     *
     * Resolution order:
     *   1. Peer is a Cloudflare edge → CF-Connecting-IP is the genuine visitor.
     *      (When a front nginx rewrites REMOTE_ADDR via real_ip this branch is
     *      simply skipped and REMOTE_ADDR already holds the visitor — same result.)
     *   2. Peer is private/loopback → a local reverse proxy; its X-Forwarded-For
     *      first hop is the client. A direct public attacker has a public
     *      REMOTE_ADDR and never reaches this branch.
     *   3. Otherwise the peer IS the client — use REMOTE_ADDR, never a header.
     */
    protected function resolveClientIp(ServerRequestInterface $request): string
    {
        $remote = trim((string) ($request->getServerParams()['REMOTE_ADDR'] ?? ''));

        if ($remote !== '' && $this->ipInRanges($remote, self::CLOUDFLARE_RANGES)) {
            $cf = trim($request->getHeaderLine('CF-Connecting-IP'));
            if ($cf !== '') {
                return $cf;
            }
        }

        if ($remote !== '' && $this->isPrivateOrReserved($remote)) {
            $xff = $request->getHeaderLine('X-Forwarded-For');
            if ($xff !== '') {
                $first = trim(explode(',', $xff)[0]);
                if ($first !== '') {
                    return $first;
                }
            }
        }

        return $remote;
    }

    /** True if $ip falls inside any of the given CIDR blocks (IPv4 or IPv6). */
    protected function ipInRanges(string $ip, array $cidrs): bool
    {
        foreach ($cidrs as $cidr) {
            if ($this->ipInRange($ip, $cidr)) {
                return true;
            }
        }

        return false;
    }

    /** Binary CIDR containment test that works for both IPv4 and IPv6. */
    protected function ipInRange(string $ip, string $cidr): bool
    {
        [$subnet, $bits] = array_pad(explode('/', $cidr, 2), 2, null);
        $bits = (int) $bits;

        $ipBin = @inet_pton($ip);
        $subnetBin = @inet_pton((string) $subnet);

        // Reject malformed input and never compare a v4 address to a v6 subnet.
        if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
            return false;
        }

        $whole = intdiv($bits, 8);
        $partial = $bits % 8;

        if ($whole > 0 && strncmp($ipBin, $subnetBin, $whole) !== 0) {
            return false;
        }

        if ($partial === 0) {
            return true;
        }

        $mask = chr((0xFF << (8 - $partial)) & 0xFF);

        return ($ipBin[$whole] & $mask) === ($subnetBin[$whole] & $mask);
    }

    /** True for RFC1918 / loopback / other reserved space — i.e. a local proxy hop. */
    protected function isPrivateOrReserved(string $ip): bool
    {
        return filter_var($ip, FILTER_VALIDATE_IP) !== false
            && filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) === false;
    }
}
