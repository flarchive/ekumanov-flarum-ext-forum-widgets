<?php

/**
 * Standalone logic tests for the guest presence counter.
 *
 *     php tests/guest-heartbeat.php        # exit 0 = pass, 1 = failure
 *
 * The extension has no PHPUnit setup and deliberately no Composer dev
 * dependencies, so this file stubs the handful of framework interfaces the
 * controller touches and then loads the REAL src/Api/GuestHeartbeatController.php.
 * It exercises the shipped code rather than a reimplementation of it — the
 * point being that the counting rules are easy to break silently and hard to
 * notice in production, where a wrong number still looks like a number.
 *
 * Everything here is pure logic: no network, no database, no cache server.
 */

namespace Psr\Http\Message {
    interface ResponseInterface {}
    interface ServerRequestInterface {
        public function getHeaderLine(string $n): string;
        public function getServerParams(): array;
    }
}

namespace Psr\Http\Server {
    interface RequestHandlerInterface {}
}

namespace Laminas\Diactoros\Response {
    class EmptyResponse implements \Psr\Http\Message\ResponseInterface {
        public function __construct(public int $status = 204) {}
        public function getStatusCode(): int { return $this->status; }
    }
}

namespace Flarum\Settings {
    interface SettingsRepositoryInterface { public function get($k, $d = null); }
}

namespace Illuminate\Contracts\Cache {
    interface Repository {
        public function get($key, $default = null);
        public function put($key, $value, $ttl = null);
        public function add($key, $value, $ttl = null);
        public function increment($key, $value = 1);
    }
}

namespace Test {
    /**
     * In-memory stand-in for the Flarum cache; the map lives in $store.
     *
     * TTLs are honoured against a virtual clock ($clock, in seconds) so the
     * rate-limit window can be tested without sleeping. add() and increment()
     * follow Redis semantics, which is what production runs on: add() is
     * SET NX EX, and increment() is INCRBY — it keeps an existing TTL, and on
     * a missing key creates one with no TTL at all.
     */
    class FakeCache implements \Illuminate\Contracts\Cache\Repository {
        public array $store = [];
        public array $expires = [];
        public int $clock = 0;
        /** Runs between add() and increment(), to force the expiry race. */
        public ?\Closure $afterAdd = null;

        private function alive($key): bool {
            if (isset($this->expires[$key]) && $this->expires[$key] <= $this->clock) {
                unset($this->store[$key], $this->expires[$key]);
            }
            return array_key_exists($key, $this->store);
        }
        public function get($key, $default = null) { return $this->alive($key) ? $this->store[$key] : $default; }
        public function put($key, $value, $ttl = null) {
            $this->store[$key] = $value;
            if ($ttl === null) { unset($this->expires[$key]); } else { $this->expires[$key] = $this->clock + $ttl; }
            return true;
        }
        public function add($key, $value, $ttl = null) {
            $added = ! $this->alive($key) && $this->put($key, $value, $ttl);
            if ($this->afterAdd) { ($this->afterAdd)($key); }
            return $added;
        }
        public function increment($key, $value = 1) {
            if (! $this->alive($key)) { $this->store[$key] = 0; unset($this->expires[$key]); }
            return $this->store[$key] += $value;
        }
    }

    class FakeSettings implements \Flarum\Settings\SettingsRepositoryInterface {
        public function __construct(private array $vals = []) {}
        public function get($k, $d = null) { return $this->vals[$k] ?? $d; }
    }

    class FakeRequest implements \Psr\Http\Message\ServerRequestInterface {
        public function __construct(private string $ua, private string $ip) {}
        public function getHeaderLine(string $n): string {
            return strtolower($n) === 'user-agent' ? $this->ua : '';
        }
        public function getServerParams(): array { return ['REMOTE_ADDR' => $this->ip]; }
    }
}

namespace Ekumanov\ForumWidgets\Api {
    require __DIR__ . '/../src/Api/GuestHeartbeatController.php';

    /** Exposes the protected bot check for assertion. */
    class Probe extends GuestHeartbeatController {
        public function isBot(string $ua): bool { return $this->looksLikeBot($ua); }
        public function clientIp(\Psr\Http\Message\ServerRequestInterface $r): string { return $this->resolveClientIp($r); }
    }
}

namespace Test {
    use Ekumanov\ForumWidgets\Api\GuestHeartbeatController as C;
    use Ekumanov\ForumWidgets\Api\Probe;

    $pass = 0;
    $fail = 0;

    function check(string $label, $got, $want): void {
        global $pass, $fail;
        $ok = $got === $want;
        $ok ? $pass++ : $fail++;
        printf("  [%s] %s\n", $ok ? 'PASS' : 'FAIL', $label);
        if (! $ok) {
            printf("         got:  %s\n         want: %s\n",
                json_encode($got), json_encode($want));
        }
    }

    /**
     * Mirror of ForumResourceFields::getOnlineGuestsCount(). Kept in step with
     * that method by hand; if the counting rule changes in one, change both.
     */
    function displayedCount(array $guests, int $cutoff): int {
        $n = 0;
        foreach ($guests as $entry) {
            $x = C::normalizeEntry($entry);
            if ($x === null) {
                continue;
            }
            [$ts, $pings] = $x;
            if ($ts > $cutoff && $pings >= C::MIN_PINGS_TO_COUNT) {
                $n++;
            }
        }
        return $n;
    }

    $settings = new FakeSettings(['ekumanov-forum-widgets.last_seen_interval' => 5]);
    $realUA = 'Mozilla/5.0 (X11; Linux x86_64; rv:154.0) Gecko/20100101 Firefox/154.0';

    echo "\n=== 1. User-Agent gate ===\n";
    $probe = new Probe(new FakeCache(), $settings);

    // Real User-Agents observed in live traffic. The Chrome/145 Mac string is
    // the one the scraper fleet wears, and is indistinguishable from a genuine
    // Mac Chrome visitor — it must NOT be filtered. Behaviour catches it later.
    foreach ([
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64; rv:154.0) Gecko/20100101 Firefox/154.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    ] as $i => $ua) {
        check("real browser #$i passes the gate", $probe->isBot($ua), false);
    }

    foreach ([
        'pc',                       // observed scripted client; matches no needle
        '',                         // absent
        '   ',                      // whitespace only
        'Mozilla/5.0',              // truncated junk, under the length floor
        'Mozilla/5.0 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'python-requests/2.31.0',
        'curl/8.4.0',
    ] as $i => $ua) {
        check("bot or short UA #$i is filtered", $probe->isBot($ua), true);
    }

    echo "\n=== 2. normalizeEntry: both map formats ===\n";
    check('legacy bare int timestamp',   C::normalizeEntry(1756700000), [1756700000, 1]);
    check('legacy numeric string',       C::normalizeEntry('1756700000'), [1756700000, 1]);
    check('current [ts, pings]',         C::normalizeEntry([1756700000, 2]), [1756700000, 2]);
    check('ping count floored to 1',     C::normalizeEntry([1756700000, 0]), [1756700000, 1]);
    check('missing ping count defaults', C::normalizeEntry([1756700000]), [1756700000, 1]);
    check('garbage rejected',            C::normalizeEntry('abc'), null);
    check('null rejected',               C::normalizeEntry(null), null);

    echo "\n=== 3. one-shot traffic vs a real visitor ===\n";
    $cache = new FakeCache();
    $ctl = new C($cache, $settings);
    $scraperUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

    // Replays a burst measured in production: 38 distinct residential IPs, one
    // heartbeat each, all wearing a legitimate desktop Chrome UA.
    for ($i = 0; $i < 38; $i++) {
        $ctl->handle(new FakeRequest($scraperUA, "91.180.134.$i"));
    }
    $map = $cache->store[C::CACHE_KEY];
    check('38 one-shot fingerprints are recorded', count($map), 38);
    check('...and none of them are counted', displayedCount($map, time() - 300), 0);

    $ctl->handle(new FakeRequest($realUA, '203.0.113.9'));
    check('real visitor uncounted after 1st ping', displayedCount($cache->store[C::CACHE_KEY], time() - 300), 0);
    $ctl->handle(new FakeRequest($realUA, '203.0.113.9'));
    check('real visitor counted after 2nd ping', displayedCount($cache->store[C::CACHE_KEY], time() - 300), 1);

    for ($i = 0; $i < 5; $i++) {
        $ctl->handle(new FakeRequest($realUA, '203.0.113.9'));
    }
    $map = $cache->store[C::CACHE_KEY];
    $hash = substr(hash('sha256', '203.0.113.9|' . $realUA), 0, 16);
    check('still one guest after 7 pings', displayedCount($map, time() - 300), 1);
    check('ping tally capped at the threshold', $map[$hash][1], C::MIN_PINGS_TO_COUNT);

    echo "\n=== 4. upgrade over a live legacy map ===\n";
    $cache2 = new FakeCache();
    $legacy = [];
    for ($i = 0; $i < 20; $i++) {
        $legacy['legacy' . $i] = time();      // pre-1.6.6 bare-timestamp format
    }
    $cache2->store[C::CACHE_KEY] = $legacy;
    check('legacy entries await their 2nd ping', displayedCount($legacy, time() - 300), 0);

    (new C($cache2, $settings))->handle(new FakeRequest($realUA, '198.51.100.4'));
    $map2 = $cache2->store[C::CACHE_KEY];
    check('legacy entries survive the first write', count($map2), 21);
    check('every entry normalized to array form', array_sum(array_map('is_array', $map2)), 21);

    echo "\n=== 5. per-IP rate limit still enforced ===\n";
    $ctl3 = new C(new FakeCache(), $settings);
    $codes = [];
    for ($i = 0; $i < 9; $i++) {
        $codes[] = $ctl3->handle(new FakeRequest($realUA, '198.51.100.77'))->getStatusCode();
    }
    check('six accepted, then 429', $codes, [204, 204, 204, 204, 204, 204, 429, 429, 429]);

    echo "\n=== 6. the rate-limit window is fixed, not rolling ===\n";
    // One guest pinging every 55s — the fast edge of the client's 60s ±10%
    // jitter — for twenty minutes. A window that re-arms on every ping never
    // closes here, so the count only climbs and the 7th ping onward is
    // refused; a fixed window holds at most two of these pings at a time.
    $cache4 = new FakeCache();
    $ctl4 = new C($cache4, $settings);
    $codes = [];
    for ($i = 0; $i < 22; $i++) {
        $cache4->clock = $i * 55;
        $codes[] = $ctl4->handle(new FakeRequest($realUA, '198.51.100.78'))->getStatusCode();
    }
    check('a steady 55s pinger is never throttled', array_unique($codes), [204]);

    // The window really closes: a burst is refused, then served again 60s
    // after the window opened even though the burst kept hitting it.
    $cache5 = new FakeCache();
    $ctl5 = new C($cache5, $settings);
    $codes = [];
    foreach ([0, 1, 2, 3, 4, 5, 6, 30, 59, 60] as $t) {
        $cache5->clock = $t;
        $codes[] = $ctl5->handle(new FakeRequest($realUA, '198.51.100.79'))->getStatusCode();
    }
    check('burst refused within the window, served once it closes', $codes,
        [204, 204, 204, 204, 204, 204, 429, 429, 429, 204]);

    // The expiry race: the counter is alive when add() looks and gone by the
    // time increment() runs, which recreates it with no TTL. It must get one
    // back, or that IP stays locked out forever.
    $cache6 = new FakeCache();
    $ctl6 = new C($cache6, $settings);
    $ctl6->handle(new FakeRequest($realUA, '198.51.100.80'));
    $cache6->afterAdd = function ($key) use ($cache6) {
        if (str_contains($key, 'guest-rl')) {
            unset($cache6->store[$key], $cache6->expires[$key]);
        }
    };
    $cache6->clock = 10;
    $ctl6->handle(new FakeRequest($realUA, '198.51.100.80'));
    $rl = array_values(array_filter(array_keys($cache6->store), fn ($k) => str_contains($k, 'guest-rl')));
    check('counter recreated by the race gets its TTL back', isset($cache6->expires[$rl[0]]), true);

    echo "\n=== 7. X-Forwarded-For behind a private proxy ===\n";
    $ipOf = function (string $remote, string $xff): string {
        $req = new class ($remote, $xff) implements \Psr\Http\Message\ServerRequestInterface {
            public function __construct(private string $remote, private string $xff) {}
            public function getHeaderLine(string $n): string { return strtolower($n) === 'x-forwarded-for' ? $this->xff : ''; }
            public function getServerParams(): array { return ['REMOTE_ADDR' => $this->remote]; }
        };
        return (new Probe(new FakeCache(), new FakeSettings()))->clientIp($req);
    };
    check('spoofed first hop ignored, proxy-recorded hop used',
        $ipOf('10.0.0.2', '1.2.3.4, 203.0.113.9'), '203.0.113.9');
    check('private hops on the right are skipped',
        $ipOf('10.0.0.2', '203.0.113.9, 10.0.0.5'), '203.0.113.9');
    check('single hop still works', $ipOf('127.0.0.1', '203.0.113.9'), '203.0.113.9');
    check('garbage / all-private falls back to the peer', $ipOf('10.0.0.2', 'nonsense, 192.168.1.1'), '10.0.0.2');
    check('a public peer never trusts the header', $ipOf('198.51.100.1', '203.0.113.9'), '198.51.100.1');

    printf("\n%d passed, %d failed\n\n", $pass, $fail);
    exit($fail === 0 ? 0 : 1);
}
