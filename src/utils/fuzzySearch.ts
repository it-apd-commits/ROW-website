// Shared typo-tolerant matching, used everywhere a beneficiary is searched
// or selected (Beneficiary List, BeneficiarySelect dropdown, Token Management,
// duplicate detection) so "Adib" reliably finds "Adeeb" and similar near-misses.

// Levenshtein edit distance — how many single-character edits (insert/
// delete/substitute) turn one string into the other, e.g. "adib"→"adeeb" = 1.
export function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const prevRow = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prevRow[j] = j;

    for (let i = 1; i <= a.length; i++) {
        let diagonal = prevRow[0];
        prevRow[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const temp = prevRow[j];
            prevRow[j] = a[i - 1] === b[j - 1]
                ? diagonal
                : 1 + Math.min(diagonal, prevRow[j], prevRow[j - 1]);
            diagonal = temp;
        }
    }
    return prevRow[b.length];
}

// Edit distance allowed as a fraction of the longer string's length, rather
// than a flat character count — a fixed threshold either misses real typos
// on short names or over-matches unrelated ones. 0.4 was picked by testing
// against real examples: it catches "adib"~"adeeb" (ratio 0.40) while still
// rejecting a same-length-difference near-miss like "adib"~"amit" (0.50).
const FUZZY_MAX_DISTANCE_RATIO = 0.4;

export function isFuzzyMatch(word: string, term: string): boolean {
    if (!word || !term) return false;
    const maxLen = Math.max(word.length, term.length);
    const allowedDistance = Math.floor(maxLen * FUZZY_MAX_DISTANCE_RATIO);
    if (allowedDistance === 0) return word === term;
    if (Math.abs(word.length - term.length) > allowedDistance) return false;
    return levenshteinDistance(word, term) <= allowedDistance;
}

// Matches a beneficiary name against a search term, tolerating minor
// spelling variations (e.g. "Adib" ~ "Adeeb") in addition to plain substring
// matches. Checked per-word (and against the full name) so a typo anywhere
// in a multi-word name is still caught.
export function nameMatchesSearch(name: string | null | undefined, term: string): boolean {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) return true;

    const normalizedName = (name || '').trim().toLowerCase();
    if (normalizedName.includes(normalizedTerm)) return true;

    const candidates = [...normalizedName.split(/\s+/), normalizedName];
    return candidates.some(word => isFuzzyMatch(word, normalizedTerm));
}
