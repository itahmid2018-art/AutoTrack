import { InventoryItem, ToolDetails } from '../types';

export type SuggestedPartMatchReason =
  | 'Exact Model & Brand'
  | 'Model Match'
  | 'Series & Brand Match'
  | 'Brand Spare Part';

export interface SuggestedPartMatch {
  item: InventoryItem;
  score: number;
  matchReason: SuggestedPartMatchReason;
  matchedTokens: string[];
}

export interface SuggestedPartsOptions {
  limit?: number;
  categoryFilter?: string;
  deduplicateVariants?: boolean;
}

const GENERIC_BRAND_STOPWORDS = new Set([
  'professional',
  'diy',
  'green',
  'other',
  'vendor',
  'tools',
  'tool',
  'service',
  'parts',
  'genuine',
  'heavy',
  'duty',
  'oem',
  'replacement',
]);

const GENERIC_MODEL_STOPWORDS = new Set([
  'professional',
  'cordless',
  'heavy',
  'duty',
  'tool',
  'sliding',
  'compound',
  'saw',
  'drill',
  'driver',
  'grinder',
  'hammer',
  'rotary',
  'demolition',
  'breaker',
  'angle',
  'impact',
  'wrench',
  'blower',
  'washer',
]);

const COMMON_SPARE_CATEGORY_BONUSES: Array<{ keyword: string; bonus: number }> = [
  { keyword: 'carbon brush', bonus: 8 },
  { keyword: 'chuck', bonus: 7 },
  { keyword: 'switch', bonus: 7 },
  { keyword: 'armature', bonus: 6 },
  { keyword: 'bearing', bonus: 6 },
  { keyword: 'gear', bonus: 5 },
  { keyword: 'stator', bonus: 5 },
  { keyword: 'cord', bonus: 4 },
];

export function extractBrandKeywords(brand: string): string[] {
  const cleaned = brand
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC_BRAND_STOPWORDS.has(token));

  return Array.from(new Set(cleaned));
}

export function extractModelTokens(modelNumber: string): {
  full: string;
  compact: string;
  coreTokens: string[];
  prefixToken: string | null;
} {
  const rawWords = modelNumber
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !GENERIC_MODEL_STOPWORDS.has(w));

  const full = rawWords.join(' ').trim();
  const compact = full.replace(/[^a-z0-9]/g, '');

  const coreSet = new Set<string>();
  if (full.length >= 3) coreSet.add(full);

  // Adjacent pairs like "gbh 2-26", "gws 900-100"
  if (rawWords.length >= 2) {
    const firstTwo = `${rawWords[0]} ${rawWords[1]}`;
    if (firstTwo.length >= 4) coreSet.add(firstTwo);
  }

  // Individual meaningful numeric/alphanumeric tokens (e.g., "2-26", "hr2470", "900-100", "ls1019l", "te70")
  for (const word of rawWords) {
    if (/\d/.test(word) && word.length >= 3) {
      coreSet.add(word);
      const compactWord = word.replace(/[^a-z0-9]/g, '');
      if (compactWord.length >= 4) {
        coreSet.add(compactWord);
      }
    }
  }

  // Split leading alphanumeric prefix like "hr2470" -> "hr"
  let prefixToken: string | null = null;
  if (rawWords.length > 0) {
    const firstAlpha = rawWords[0].match(/^[a-z]{2,5}/)?.[0] || null;
    if (firstAlpha && !GENERIC_MODEL_STOPWORDS.has(firstAlpha)) {
      prefixToken = firstAlpha;
    }
  }

  return {
    full,
    compact,
    coreTokens: Array.from(coreSet),
    prefixToken,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordMatch(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, 'i');
  return pattern.test(haystack);
}

function normalizeVariantBaseName(name: string): string {
  return name.replace(/\s+#\d+$/i, '').trim().toLowerCase();
}

export function getSuggestedPartsForTool(
  tool: Pick<ToolDetails, 'brand' | 'modelNumber'> & Partial<Pick<ToolDetails, 'category'>>,
  inventory: InventoryItem[],
  options: SuggestedPartsOptions = {}
): SuggestedPartMatch[] {
  const {
    limit = 8,
    categoryFilter = 'All',
    deduplicateVariants = true,
  } = options;

  const brandKeywords = extractBrandKeywords(tool.brand || '');
  const modelTokens = extractModelTokens(tool.modelNumber || '');

  if (brandKeywords.length === 0 && !modelTokens.full) {
    return [];
  }

  const scored: SuggestedPartMatch[] = [];

  for (const item of inventory) {
    if (categoryFilter !== 'All' && item.category !== categoryFilter) {
      continue;
    }

    const itemBrand = (item.brand || '').toLowerCase();
    const itemName = (item.name || '').toLowerCase();
    const itemModels = (item.compatibleModels || '').toLowerCase();
    const modelAndName = `${itemModels} ${itemName}`;
    const compactModelAndName = modelAndName.replace(/[^a-z0-9]/g, '');

    let brandScore = 0;
    let modelScore = 0;
    const matchedTokens: string[] = [];

    for (const brandKey of brandKeywords) {
      if (hasWordMatch(itemBrand, brandKey)) {
        brandScore = Math.max(brandScore, 28);
        matchedTokens.push(brandKey);
      } else if (hasWordMatch(modelAndName, brandKey)) {
        brandScore = Math.max(brandScore, 14);
        matchedTokens.push(brandKey);
      }
    }

    let isExactModel = false;
    if (
      modelTokens.full.length >= 3 &&
      (hasWordMatch(modelAndName, modelTokens.full) ||
        (modelTokens.compact.length >= 4 && compactModelAndName.includes(modelTokens.compact)))
    ) {
      modelScore = 60;
      isExactModel = true;
      matchedTokens.push(modelTokens.full);
    } else {
      for (const token of modelTokens.coreTokens) {
        if (hasWordMatch(modelAndName, token)) {
          modelScore = Math.max(modelScore, token.includes(' ') ? 46 : 38);
          matchedTokens.push(token);
        }
      }

      if (modelScore === 0 && modelTokens.prefixToken && hasWordMatch(modelAndName, modelTokens.prefixToken)) {
        modelScore = 16;
        matchedTokens.push(modelTokens.prefixToken);
      }
    }

    // Ignore items with neither brand nor model relevance
    if (brandScore === 0 && modelScore === 0) {
      continue;
    }

    // Prioritize common fast-moving repair spares and available stock
    const itemCategoryLower = (item.category || '').toLowerCase();
    let commonBonus = 0;
    for (const entry of COMMON_SPARE_CATEGORY_BONUSES) {
      if (itemCategoryLower.includes(entry.keyword) || itemName.includes(entry.keyword)) {
        commonBonus = entry.bonus;
        break;
      }
    }
    const stockBonus = item.stockQty > 0 ? 4 : 0;

    const totalScore = modelScore + brandScore + commonBonus + stockBonus;

    let matchReason: SuggestedPartMatchReason;
    if (isExactModel && brandScore > 0) {
      matchReason = 'Exact Model & Brand';
    } else if (modelScore >= 38) {
      matchReason = 'Model Match';
    } else if (modelScore > 0 && brandScore > 0) {
      matchReason = 'Series & Brand Match';
    } else {
      matchReason = 'Brand Spare Part';
    }

    scored.push({
      item,
      score: totalScore,
      matchReason,
      matchedTokens: Array.from(new Set(matchedTokens)),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.item.stockQty > 0) !== (a.item.stockQty > 0)) {
      return b.item.stockQty > 0 ? 1 : -1;
    }
    return a.item.sku.localeCompare(b.item.sku);
  });

  if (!deduplicateVariants) {
    return scored.slice(0, limit);
  }

  const uniqueResults: SuggestedPartMatch[] = [];
  const seenBaseNames = new Set<string>();
  for (const match of scored) {
    const baseName = normalizeVariantBaseName(match.item.name);
    if (seenBaseNames.has(baseName)) continue;
    seenBaseNames.add(baseName);
    uniqueResults.push(match);
    if (uniqueResults.length >= limit) break;
  }

  return uniqueResults;
}
