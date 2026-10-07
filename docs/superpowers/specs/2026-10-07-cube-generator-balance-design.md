# Cube generator: "Randomize copy counts" toggle + "Element variance" slider — design

Supplied by the user on 2026-10-07 against `master` @ 7febf2a, then extended with the
clarifications at the end, which the user approved. Where the two disagree, the
clarifications win.

Two changes to the cube pool generator, built together because both rewrite the same
pick loop:

- **A. Randomize copy counts toggle.** When off, every picked card gets the standard
  rarity max, and the pool may overshoot the cube size to fit the last card.
- **B. Element variance slider.** Controls how evenly the four elements are split,
  plus a fix for the biased shuffle.

## Current behaviour

- **Settings UI:** `src/routes/cubes/[slug]/edit/+page.svelte`.
  - The settings object is `{ sets, elements, cubeSize, includeAvatars,
includeAllAvatars, rarities: { Ordinary: {enabled, max}, Exceptional, Elite, Unique } }`.
  - It's saved as JSON in `cubes.settings` via `PATCH /api/cubes/{id}`.
  - "Generate" PATCHes the settings, then POSTs `/api/cubes/{id}/generate`.
- **Generator:** `src/routes/api/cubes/[id]/generate/+server.js`.
  - It filters the catalog by sets, elements and rarities, and optionally adds every
    avatar up front.
  - It shuffles the eligible cards with `sort(() => Math.random() - 0.5)` and walks
    the list in passes.
  - Each card gets `ceil(random × remaining)` copies (1..max), clamped to
    `cubeSize − totalAdded`, until the pool reaches `cubeSize`.
  - Max per card is `rarities[r].max ?? getDefaultMax(r)` (4/3/2/1). Avatars are 1.
- **Basic sites** (`src/lib/server/basicSites.js`) are added afterwards at 30 each and
  don't count toward `cubeSize`. **Leave that as it is.**
- **Problems:**
  1. The last card can be cut short (e.g. a stray 1x Ordinary).
  2. Elements ignore balance entirely, and the `sort`-based shuffle is biased (cards
     keep part of their DB order).
     - The real cube "Thundering Crucible" (358 cards) came out Air 42% / Earth 29% /
       Water 20% / Fire 9% for single-element cards.
     - Its non-basic sites were Earth 19 / Water 11 / Air 9 / Fire 4.
     - The catalog itself is roughly even: about 200 single-element cards per element,
       about 195 colourless and a few dozen multi-element.

## New settings

Both are stored in the existing `cubes.settings` JSON, so no migration is needed.

| key               | type               | default (also for existing cubes missing the key) |
| ----------------- | ------------------ | ------------------------------------------------- |
| `randomizeCopies` | boolean            | `true` (current behaviour)                        |
| `elementVariance` | integer 30–100 (%) | `100` (fully random split)                        |

Read them with `??` so missing keys fall back to the defaults, and clamp
`elementVariance` to 30–100.

## UI (`cubes/[slug]/edit/+page.svelte`)

1. **"Rarities & Max Copies" section:** add a checkbox at the top, **"Randomize copy
   counts"** (bound to `settings.randomizeCopies`).
   - When it's unticked, show the hint: "Every card gets standard copies: 4 Ordinary,
     3 Exceptional, 2 Elite, 1 Unique. The cube size may round up by a few cards to fit
     the last card."
   - When it's unticked, **disable the per-rarity Max inputs**, since they're ignored.
     Keep their saved values, so ticking it again restores them.
   - The rarity _enabled_ checkboxes keep working.
2. **"Elements" section:** add a slider, **"Element variance"**
   (`settings.elementVariance`, range 30–100, step 5), and show its current value.
   - End labels: "30% (near even)" and "100% (fully random)".
   - Hint: "How far each element's share can stray from an even split. Colourless and
     multi-element cards aren't affected."
   - Disable it when exactly one element is selected. No elements selected means all
     four, as now.
3. **After Generate:**
   - Show the per-element breakdown from the response, e.g.
     `Air 72 · Earth 68 · Fire 81 · Water 75 (sites 12 / 11 / 14 / 13)`.
   - If the response includes a new `cubeSize` (overshoot), set `settings.cubeSize` to
     it. Otherwise the next Save/Generate PATCHes the old value back.
   - Show the overshoot note as an info message, not an error.

## Generator algorithm

Extract the logic into a pure, DB-free module, `src/lib/server/cubePool.js`, so it's
unit-testable. Pass in an injectable `rng`, defaulting to `Math.random`. The `+server.js`
handler keeps the DB loading, the filtering, the basic sites and the persistence.

### 1. Shuffle

`shuffle(arr, rng)` is an in-place **Fisher–Yates** shuffle. It replaces both
`sort(() => Math.random() - 0.5)` uses in the current handler. The pack generator
doesn't use this pattern, so it needs no change.

### 2. Element shares

`elementShares(elements, variance, rng)` works on the selected elements `E` (k of them;
empty means all four).

- `even = 1/k` and `v = variance / 100`.
- Draw a uniform Dirichlet split: `x_e = −ln(rng())` for each element, then
  `r_e = x_e / Σx`.
- `share_e = (1 − v)·even + v·r_e`.
- Draw a fresh split every Generate.
- At 30% with 4 elements, every element gets ≥ 17.5% (0.7 × 25%). At 100% the split is
  fully random, and something like 70/20/10/0 can happen.

### 3. Buckets and quotas

- Up-front avatars (`includeAllAvatars`) are added first, as now, and count toward the
  total.
- Put the remaining eligible cards into buckets by **type group** (Site vs everything
  else, i.e. spells) and **element class**:
  - one bucket per selected element for **single-element** cards;
  - one **"other"** bucket for colourless, multi-element and avatar cards. This bucket
    isn't balanced.
- `budget = cubeSize − upfront`. Split it by natural proportion of eligible cards:
  - `siteBudget = budget × (#eligible sites / #eligible cards)`, and the spell budget
    is the rest.
  - Within each type group, `otherQuota = groupBudget × (#other cards in group /
#cards in group)`, and `elementalBudget` = the rest.
  - `quota[group][e] = elementalBudget × share_e`. **Sites and spells use the same
    `share`**, so they come out in the same element proportions.
  - Round the quotas with largest-remainder so they sum to `budget` exactly.

### 4. Fill loop (deficit-driven, shared by both copy modes)

Each bucket keeps its own Fisher–Yates-shuffled card list and a cursor.

Repeat until `totalAdded >= cubeSize` or every bucket is exhausted:

1. Pick the non-exhausted bucket with the **largest deficit** (`quota − filled`; ties
   are broken randomly). If every remaining deficit is ≤ 0 but the pool is still short
   (because some buckets ran dry), keep going by picking the bucket with the most
   remaining capacity. That way the shortfall moves to the other buckets.
2. Take that bucket's next card and add copies to it:
   - **`randomizeCopies === true`** (current behaviour, kept):
     - `max = rarities[r].max ?? getDefaultMax(r)`.
     - Add `min(ceil(rng() × (max − current)), cubeSize − totalAdded)`. This never
       overshoots.
     - When the cursor reaches the end of the list, reshuffle the cards still below
       max and start another pass.
     - The bucket is exhausted when every card is at max.
   - **`randomizeCopies === false`:**
     - `max = getDefaultMax(r)`, the standard 4/3/2/1, **ignoring `rarities[r].max`**.
       Avatars are 1.
     - Add the full `max` to a card that isn't in the pool yet, in one go, and **never
       truncate**.
     - A single pass is enough; the bucket is exhausted when its list is used up.
3. Update `filled`, `totalAdded` and the per-element counters.

Results:

- **Overshoot (copies off only):** the last card always gets its full count, so
  `totalAdded` can end up to 3 over `cubeSize`. If `totalAdded > cubeSize`, write
  `totalAdded` back to `settings.cubeSize` in the cube row, in the same update that sets
  `updated_at`.
- **Shortfall:** if every bucket is exhausted before reaching `cubeSize`, keep the
  existing warning (`Could only generate X/Y cards with current settings`) and don't
  change `cubeSize`.
- If an element's bucket ran dry before meeting its quota, add a note such as
  `Fire ran out of eligible cards (got 31 of 45); the rest was filled from other elements.`

### 5. Persist and respond

Insert the pool and basic sites as now, then return:

```json
{
  "success": true,
  "poolSize": 203,
  "cubeSize": 203,
  "warning": null,
  "notes": ["Pool is 203 (was 200): cube size rounded up to fit the last card at full copies."],
  "elementCounts": {
    "spells": { "Air": 40, "Earth": 38, "Fire": 41, "Water": 37 },
    "sites": { "Air": 6, "Earth": 7, "Fire": 6, "Water": 6 }
  }
}
```

- `cubeSize` is always the (possibly updated) saved size.
- `elementCounts` counts **copies of single-element, non-basic cards only**.

## Tests

Unit tests use `cubePool.js` with a seeded rng and a fake catalog, following the pattern
of `tests/pso-link.spec.js` (Playwright tests in plain Node, no browser).

**Shuffle**

- Over many runs, each item lands in each position roughly uniformly.

**`elementShares`**

- The shares sum to 1.
- At 30%, every share is ≥ 0.7/k.
- A single element gets 1.0.
- The result is deterministic for a given seed.

**Copies on**

- The total equals `cubeSize` exactly.
- Custom `rarities.max` values are honoured.
- No card exceeds its max.

**Copies off**

- Every non-avatar card's quantity equals the standard max for its rarity.
- Custom `rarities.max` (e.g. Ordinary 2) is **ignored**, so the card still gets 4.
- Overshoot: target 10 with Ordinaries only gives 12, and the returned `cubeSize` is 12.
- Exact fit: target 12 gives 12, with no overshoot and no note.
- The overshoot never exceeds 3.

**Balance**

- With a fake catalog of 4 elements × (100 spells + 15 sites) plus 100 colourless, at
  30%, every element's share of single-element copies is ≥ ~17%. Allow for rounding and
  copy-count granularity.
- Sites are split in about the same proportions as spells.
- Colourless cards appear at about their natural rate.

**Run-dry and edge cases**

- An element with too few cards hands its shortfall to the others and the note is
  returned.
- When the whole pool is too small, you get the warning and `cubeSize` is unchanged.
- Defaults: settings without the new keys behave as `randomizeCopies: true` and
  `elementVariance: 100`.

E2E, alongside `tests/cube-basics.spec.js`:

- Both new controls save and reload.
- The Max inputs are disabled when the toggle is off.
- After an overshooting generate, the size field shows the new number.

## Out of scope

- The basic sites logic.
- Pack generation.
- The deck builder.
- The public `/api/v1` endpoints.
- Item 2 ("Sizes" section: renaming "Cube Size" and adding Spellbook/Atlas minimums)
  comes in a separate PR that touches the same edit page. Keep the cube size input where
  it is, so that PR can move it later.

## Decisions already made (don't re-ask)

- When copies are off, the generator always uses the standard 4/3/2/1 and the Max
  fields are greyed out.
- An overshoot updates the saved cube size.
- Randomize copies is on by default.
- Colourless and multi-element cards aren't balanced.
- Sites follow the same element split as spells.
- The variance slider goes from 30% to 100%, defaulting to 100%.

## Clarifications (approved 2026-10-07)

1. **Colourless means `[]` or `["None"]`.** The catalog stores colourless cards as
   `["None"]` (229 cards, 34 of them avatars), never `[]`.
   - The old element filter let a card through only when its list was empty, so
     selecting any element silently dropped **every** colourless card. That is a bug,
     and the user confirmed it: colourless cards must be eligible whatever elements are
     selected.
   - The generator treats both encodings as colourless. Colourless cards always pass the
     element filter and go in the "other" bucket.
   - A multi-element card passes only if all its elements are selected. `"None"` never
     appears alongside other elements.
2. **`??`, not `||`, in the edit page too.** The page seeds its form state with `||`,
   which would turn `randomizeCopies: false` back into `true` on every reload. Both new
   keys use `??` there as well as in the generator.
3. **Avatars.**
   - With `includeAvatars && includeAllAvatars`, every eligible avatar is added up front
     and kept out of the buckets.
   - With `includeAvatars` only, avatars go in the "other" bucket of the spell group.
   - Avatars are always 1 copy in both modes. Their rarity can be `null`, `Elite` or
     `Unique`, so rarity does not decide their copy count.
4. **Empty element buckets.** If an element has no eligible cards in a type group (e.g.
   no Fire sites in the chosen sets), its quota there is filled from the other buckets
   like any run-dry. The note names the group, e.g. `Fire sites ran out of eligible
cards (got 0 of 9); the rest was filled from other elements.`
5. **`elementCounts`** has a key for each selected element only (all four when none are
   selected).
6. **Branch.** The repo's default branch is `master`; 7febf2a is the merge of PR #13.
