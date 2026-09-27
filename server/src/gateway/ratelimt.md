Step 3 is the limiter itself. How it works:

- **A sliding window**, stored as a small sorted set of timestamps per user and rule in Redis. Unlike simple "per minute" counters, a user can't send 100 requests at 12:00:59 and another 100 at 12:01:00.
- **All logic in one Lua script,** so Redis runs check-and-count as a single atomic step. Even 100 simultaneous requests can never exceed the limit.
- **Redis's own clock,** so several server instances with slightly different clocks still agree.
- **Multi-rule checks are all-or-nothing.** For a refund (5/min **and** 30/day), if the daily limit blocks it, the per-minute counter isn't charged either.Typecheck passes. Now the correctness tests: exact limits, a concurrency burst, all-or-nothing multi-rule checks, the sliding window, and two separate "server instances" sharing counts.Everything is correct. Test 8's TTL check was a bug in my test script (it passed two keys at once), so let me check the key expiry properly:Every behaviour checks out:

| #   | Test                                                             | Result                                                                                                   |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Limit 5, 8 calls in a row                                        | `✓ ✓ ✓ ✓ ✓ ✗ ✗ ✗`, with `retryAfter` 60 s and the blocking rule named                                    |
| 2   | **100 simultaneous calls, limit 10**                             | **exactly 10 allowed**, 90 refused, so the atomicity works                                               |
| 3   | A different user                                                 | unaffected                                                                                               |
| 4   | **Per-minute 5 + per-day 3**                                     | blocked by the daily rule on call 4, and the refused calls **weren't charged** to the per-minute counter |
| 5   | Sliding window, 3 per 2 s                                        | the 4th call is blocked; after 2.1 s it's allowed again                                                  |
| 6   | 3 failed logins, check, reset                                    | locked (retry in 900 s); after a reset, free again                                                       |
| 7   | Headers                                                          | `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`, plus `retry-after` when blocked             |
| 8   | Keys                                                             | `crm:test:rl:{user:a}:t-seq`, expiring on their own (TTL 51 s; the daily key about 86,400 s)             |
| 9   | **Two separate server processes**, 8 calls each against limit 10 | 8 + 2 = **exactly 10** in total. Counts are shared                                                       |

**How it works**

- **Storage:** each (rule, subject) pair is one Redis **sorted set**. Each allowed request adds an entry scored by its timestamp. The key looks like `crm:dev:rl:{user:abc}:tool-read` and expires by itself once the window passes, so Redis never fills up with old counters.
- `CONSUME` (the main script), for each rule:
  1. drop entries older than the window;
  2. count what's left;
  3. if a rule is full, **stop immediately** and report which rule blocked it and when the oldest entry expires (the retry time);
  4. only if **every** rule has room, add the request to all of them.
     That's why refused calls cost nothing.
- `redis.call('TIME')`**:** timestamps come from Redis, not from each server, so two servers whose clocks differ by a few seconds still count consistently.
- **Four functions:**

| Function  | Does              | Used by                             |
| --------- | ----------------- | ----------------------------------- |
| `consume` | check, then count | `/mcp` per-user limits, tool limits |
| `peek`    | check only        | "is this login locked?"             |
| `hit`     | count only        | record a **failed** login           |
| `reset`   | clear             | after a successful login            |

- `defineCommand`**:** ioredis uploads each script once and afterwards runs it by its hash (`EVALSHA`), which is fast. If Redis restarts and forgets the script, ioredis re-uploads it automatically.
- `{subject}` **hash tag:** harmless on normal Redis. On Redis Cluster it keeps a user's keys on the same node, which multi-key scripts require. It's future-proofing at zero cost.
- `rateLimitHeaders`**:** turns a result into standard HTTP headers, so clients know their remaining budget and when to retry.

**Run:** `pnpm typecheck`

**Expected:** no errors. Nothing calls the limiter yet; Step 4 adds the per-user and per-IP limits to `/mcp`.

The order of checks on every /mcp request:

IP limit: the cheapest check, done before anything else. It blocks floods before any cryptography or database work.
Token: 401 if invalid. Failed attempts still count against the IP limit, which is what stops token guessing.
User limit: one user (whether via a login token or a PAT) gets 100 requests per minute in total.
Permissions, then tools (as before).

Details worth knowing

The headers on successful responses tell a well-behaved client how much budget is left, so it can slow down before hitting 429.
-32029: a custom JSON-RPC error code for rate limiting, so MCP clients see a structured error rather than a raw HTTP failure.
The user limit covers all tokens: a user's login token and every one of their PATs share the same 100 per minute, because the key is the user ID, not the token. Creating extra PATs doesn't buy more budget.
request.ip on the VPS: behind Caddy, every request would appear to come from Caddy's own IP. In Phase 9 you'll enable Fastify's trustProxy, so request.ip becomes the real client IP from the proxy header. Without it, all users would share one IP counter
