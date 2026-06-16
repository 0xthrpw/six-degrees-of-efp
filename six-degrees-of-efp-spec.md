# Six Degrees of EFP — Game Spec

*A browser game where you connect one Ethereum account to another by hopping through the EFP follow graph, in as few steps as possible.*

Think **Six Degrees of Wikipedia**, but the links are "follows" instead of hyperlinks, the pages are people (rendered with their ENS name + avatar), and the optional sign-in is **Sign-In With Ethereum**. It showcases all three protocols with one tight, addictive loop.

---

## 1. Concept

You're given a **START** account and a **TARGET** account. You "stand on" START and can see everyone START follows. Click one to hop to it. Keep hopping along follow edges until you land on TARGET. Fewer hops = better score.

The fun comes from intuition about the social graph: *"vitalik.eth probably follows someone who follows my target…"* It's a puzzle, a social-knowledge test, and — for an internal cohort where the nodes are your coworkers — a genuinely funny "do you know who follows whom around here" game.

---

## 2. Core gameplay loop

1. Show **START** and **TARGET** cards at the top (ENS name + avatar for each).
2. Render the **following list** of the account the player is currently on, as a grid/list of cards (name + avatar + follower count).
3. Player picks a card → that becomes the new current account; hop counter +1; the new account's following list loads.
4. **Win** when the player lands on TARGET. (Optional "implied win": stop one early if TARGET appears in the current following list — see §7.)
5. Show result: hops taken vs. **par** (the shortest possible path), time, and a shareable summary.

Controls: a hop, an **Undo/Back** (step back one node), a **Restart**, and a **Search** box to filter a long following list by name.

---

## 3. Game modes

**MVP — Daily Challenge.** Everyone gets the *same* START→TARGET pair each day. Leaderboard ranks by hops, then time. This is the office-competition driver ("I did it in 3, beat that").

**Stretch modes:**
- **Endless / Practice** — random solvable pairs with escalating par (2 → 3 → 4 hops).
- **Me Mode** — START is *your* account (resolved via SIWE sign-in); reach a random coworker. Personal, and a natural reason to sign in.
- **Head-to-head race** — two players race the same pair live; first to TARGET (or fewest hops) wins.

---

## 4. Scoring

- **Primary:** number of hops taken.
- **Par:** the optimal hop count from a server-side shortest-path search. Display "You: 4 · Best possible: 3".
- **Tiebreaker:** elapsed time.
- **Bonuses (optional):** matched par; finished under a target time; found a path no one else did.

Keep it legible: a hop counter that ticks up, and a clean post-game card. Resist over-gamifying for v1.

---

## 5. How each protocol is used

This is the part worth showing off in the submission — each protocol does real work, not decoration.

| Protocol | Role in the game |
|---|---|
| **EFP** | The entire game board. Every edge is a follow relationship. `/following` provides the moves; `/stats` gives follower/following counts for display and difficulty; `/followers` powers reverse search and the "loose" undirected mode. |
| **ENS** | The human layer. Every node is rendered as an ENS name + avatar instead of a `0x…` address, which is what makes the graph recognizable and the puzzle solvable by intuition. Also powers the search box (type a name to find a hop). |
| **SIWE** | Identity + integrity. Sign in to play **Me Mode** as yourself, and to post scores to a leaderboard tied to your ENS identity. The signature proves you own the account whose name shows on the board, so scores can't be spoofed. |

---

## 6. The graph & algorithm

**Edges are directed.** "A follows B" lets you move A → B, not B → A. Directed traversal is more interesting and more on-theme; offer an optional **Loose Mode** that treats follows as undirected (either direction counts) for a gentler experience.

**Shortest path = BFS.** To compute par and to guarantee a pair is solvable, run breadth-first search over the directed follow graph from START until TARGET is dequeued. BFS (not DFS/Dijkstra) because every edge has weight 1 and you want the minimum hop count.

```
function shortestHops(start, target, getFollowing):
    if start == target: return 0
    visited = {start}
    queue = [(start, 0)]
    while queue not empty:
        (node, depth) = queue.popleft()
        for next in getFollowing(node):        # EFP /following
            if next == target: return depth + 1
            if next not in visited:
                visited.add(next)
                queue.append((next, depth + 1))
    return INFINITY        # unreachable
```

**Pair selection.** Never hand the player an unsolvable or trivially deep puzzle. Precompute candidate pairs and keep only those with a known par in the sweet spot (2–4 hops). For the Daily Challenge, pick one pair of the target difficulty and pin it.

**Snapshot the graph for fairness.** Follow data changes; pin a daily snapshot so everyone solves the identical graph and pars stay valid all day. (See §9 — this falls out naturally if you precompute.)

---

## 7. Win-condition nuance

Two options, pick one and be consistent:
- **Land exactly on TARGET** (simplest, clearest). The hop onto TARGET ends the game.
- **Implied final hop:** the player wins as soon as TARGET appears in the *current* account's following list, saving one click. Slightly slicker but make the rule obvious in the UI so par math lines up.

Recommended for v1: **land exactly on TARGET.**

---

## 8. EFP API integration

Public base URL: `https://api.ethfollow.xyz/api/v1`  (accepts an address *or* an ENS name as the user identifier).

| Need | Endpoint |
|---|---|
| Outgoing edges (the moves) | `GET /users/{addressOrENS}/following` |
| Reverse edges (loose mode / reverse BFS) | `GET /users/{addressOrENS}/followers` |
| Follower/following counts (display + difficulty) | `GET /users/{addressOrENS}/stats` |
| ENS name, avatar, records (the card UI) | `GET /users/{addressOrENS}/ens` |

Example following response shape (followers/following are symmetric):

```json
{
  "following": [
    {
      "efp_list_nft_token_id": "5895",
      "address": "0xd56c76b3f924e8f84a02654ff072a363a84b91d9",
      "tags": [],
      "is_following": true,
      "is_blocked": false,
      "is_muted": false,
      "updated_at": "2024-10-14T19:45:38.617Z"
    }
  ]
}
```

Integration notes:
- **Only the follow edge matters** for traversal. Ignore entries flagged `is_blocked` / `is_muted`; don't render them as moves.
- **Pagination:** large accounts follow thousands, so page through with `limit` / `offset` (confirm exact param names and max page size against the live docs before building — large lists are the main thing that'll bite you).
- **ENS data** is served via the enstate service (`ens.efp.app`) behind the `/ens` endpoint; expect `null` for accounts with no primary name — fall back to a truncated `0x…` + generated avatar.
- **Caching:** the public API caches responses in Cloudflare KV with a 5-minute TTL. Be polite — for the precomputed approach you'll crawl once and serve from your own store, so you're not hammering it during play.
- **Identity Kit:** the EFP team ships the **Ethereum Identity Kit** (`ethidentitykit.com`) with prebuilt React components for ENS/EFP profiles and SIWE, plus an API wrapper. It can save you most of the card-rendering and sign-in plumbing.

---

## 9. Architecture

**Option A — pure client (fastest to ship, fewer features).**
React/Vite SPA. Fetch `/following` live on each hop, render cards from `/ens`, do SIWE with viem/wagmi. Downside: you can't compute **par** without crawling the graph, so this works for a free-play "just connect them" toy but not for scored Daily Challenges.

**Option B — precomputed graph + thin backend (recommended).**
An offline job crawls the relevant slice of the EFP graph, stores an adjacency list, runs BFS to choose daily pairs with known par, and serves: today's puzzle, solution validation, and the leaderboard. The frontend stays dumb and fast. Gets you fairness (pinned snapshot), par, and anti-cheat for free.

**Strong recommendation: scope the graph to your internal cohort for the MVP.** Crawl just your company's accounts (plus maybe a small seed set) — likely tens to low-hundreds of nodes. The whole adjacency list builds in seconds, par computation is instant, pairs are guaranteed solvable, following lists are small enough to show without heavy pagination, and the game becomes *about your coworkers*, which is the whole charm. Expand to the global EFP graph as a stretch goal.

---

## 10. Screens

1. **Home / Daily** — today's START→TARGET, "Play" button, your best, mini leaderboard. Optional "Sign in with Ethereum."
2. **Board** — START & TARGET pinned at top; current-account following grid in the middle (card = avatar + name + follower count); hop counter, timer, Undo, Restart, Search.
3. **Result** — hops vs. par, time, the path you took (replayable), and a share card: *"alice.eth → bob.eth in 3 hops. Beat me."*
4. **Leaderboard** — ranked by hops then time, names via ENS, gated by SIWE for posting.

---

## 11. Difficulty tuning

- **Par length:** 2 = easy, 3 = medium, 4+ = hard.
- **Target popularity:** low-follower targets are harder to reach (fewer inbound paths); high-follower targets are easier.
- **Branching:** very high-degree current nodes can overwhelm — mitigate by sorting the following grid (e.g., by follower count or "relevance to target") and offering search.
- **Loose Mode** (undirected) as an accessibility/easy toggle.

---

## 12. Edge cases

- **Dead-end node** (follows no one) → enable Undo/Restart; exclude pure dead-ends as targets.
- **Huge following lists** → search + sorted display + pagination (the #1 perf/UX risk).
- **Unresolved ENS** → truncated address + generated avatar; never block a hop on missing name.
- **Already at target / self-pair** → guard against in pair selection.
- **Stale data mid-game** → solve against a pinned daily snapshot so par stays valid.
- **Blocked/muted entries** → exclude from traversal and from the grid.

---

## 13. MVP checklist

- [ ] Cohort graph crawled + adjacency list stored
- [ ] BFS par + daily solvable-pair picker
- [ ] Board screen: following grid, hop counter, Undo/Restart, Search
- [ ] ENS name + avatar on every card
- [ ] Win detection + result screen (hops vs. par)
- [ ] SIWE sign-in → leaderboard (hops, then time)
- [ ] Directed edges; "land exactly on TARGET" win rule

## 14. Stretch

Endless mode · Me Mode · live head-to-head race · share/replay cards · hints (reveal one optimal next hop) · global (non-cohort) graph · "mutuals-only" hard mode.

---

## 15. Open questions for the team

1. **Cohort-only or the whole EFP graph** for v1? (Cohort is far simpler and more fun internally.)
2. **Directed or undirected** edges as the default?
3. **Live-fetch (Option A) or precompute (Option B)?** Precompute unlocks scoring.
4. Where does the **leaderboard** live (tiny serverless KV/DB)?
5. Exact pagination params and page caps on `/following` — confirm before building.

## 16. References

- EFP API: `https://api.ethfollow.xyz/api/v1` — docs at `docs.ethfollow.xyz/api` / `docs.efp.app`
- Ethereum Identity Kit (React components + SIWE + API wrapper): `ethidentitykit.com`
- ENS data service (enstate): `ens.efp.app`
