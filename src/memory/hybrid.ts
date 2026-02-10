// --- Temporal routing ---
const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const DAY_MAP: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "do", "does", "did", "has", "have", "had", "will", "would",
  "can", "could", "should", "may", "might", "shall", "must",
  "in", "on", "at", "to", "for", "of", "with", "by", "from",
  "and", "or", "not", "no", "but", "if", "so", "as", "than",
  "that", "this", "it", "its", "my", "your", "his", "her",
  "we", "they", "them", "what", "when", "where", "how", "who",
  "which", "why", "about", "any", "all", "some",
]);

function queryWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

/**
 * Extract date references (YYYY-MM-DD) from a query string for temporal routing.
 */
export function extractDates(query: string, ref?: Date): string[] {
  const now = ref ?? new Date();
  const q = query.toLowerCase();
  const dates = new Set<string>();

  // ISO dates
  for (const m of query.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    dates.add(`${m[1]}-${m[2]}-${m[3]}`);
  }

  // "February 8th", "Feb 8"
  const monthPattern = Object.keys(MONTH_MAP).join("|");
  const monthDayRe = new RegExp(
    `(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?`,
    "g",
  );
  for (const m of q.matchAll(monthDayRe)) {
    const mo = MONTH_MAP[m[1]!]!;
    const day = Number.parseInt(m[2]!, 10);
    const yr = m[3] ? Number.parseInt(m[3], 10) : now.getFullYear();
    dates.add(`${String(yr).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  // "8th February"
  const dayMonthRe = new RegExp(
    `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s+(\\d{4}))?`,
    "g",
  );
  for (const m of q.matchAll(dayMonthRe)) {
    const day = Number.parseInt(m[1]!, 10);
    const mo = MONTH_MAP[m[2]!]!;
    const yr = m[3] ? Number.parseInt(m[3], 10) : now.getFullYear();
    dates.add(`${String(yr).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  // Relative dates
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (q.includes("today")) dates.add(fmt(now));
  if (q.includes("yesterday")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    dates.add(fmt(d));
  }
  if (q.includes("day before yesterday")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 2);
    dates.add(fmt(d));
  }
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (q.includes(`last ${dayName}`)) {
      let back = (now.getDay() - dayNum) % 7;
      // getDay() is 0=Sunday, but our map is 0=Monday. Adjust:
      const jsDay = now.getDay();
      const pyDay = (jsDay + 6) % 7; // Convert to Monday=0
      back = (pyDay - dayNum) % 7;
      if (back <= 0) back += 7;
      const d = new Date(now);
      d.setDate(d.getDate() - back);
      dates.add(fmt(d));
    }
  }

  return Array.from(dates);
}

/**
 * Compute filepath relevance: fraction of query words found in the file path.
 */
export function filepathScore(query: string, filepath: string): number {
  const words = queryWords(query);
  if (words.size === 0) return 0;
  const fpNormalized = filepath.toLowerCase().replace(/[-_/\\]/g, " ");
  let matches = 0;
  for (const w of words) {
    if (fpNormalized.includes(w)) matches++;
  }
  return matches / words.size;
}

/**
 * Compute keyword overlap score for arbitrary text.
 */
export function keywordOverlapScore(query: string, text: string): number {
  const words = queryWords(query);
  if (words.size === 0) return 0;
  const textLower = text.toLowerCase();
  let matches = 0;
  for (const w of words) {
    if (textLower.includes(w)) matches++;
  }
  return matches / words.size;
}

export type HybridSource = string;

export type HybridVectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore: number;
};

export type HybridKeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  textScore: number;
};

export function buildFtsQuery(raw: string): string | null {
  const tokens =
    raw
      .match(/[A-Za-z0-9_]+/g)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];
  if (tokens.length === 0) {
    return null;
  }
  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" AND ");
}

export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999;
  return 1 / (1 + normalized);
}

/** Enhanced hybrid weight configuration with filepath, header, temporal, and adaptive support. */
export type EnhancedHybridWeights = {
  /** Weight for filepath-based scoring (query terms in file path). Default 0. */
  filepathWeight?: number;
  /** Weight for header/section scoring. Default 0. */
  headerWeight?: number;
  /** Multiplier applied to results whose file path matches extracted date references. Default 1 (no boost). */
  temporalBoost?: number;
  /** Enable adaptive weighting: shift to vector-heavy when keyword overlap is very low. */
  adaptive?: {
    enabled: boolean;
    /** Threshold for best keyword score below which adaptive kicks in. Default 0.1. */
    keywordThreshold?: number;
    /** Weights used when adaptive is active. */
    vectorWeight?: number;
    textWeight?: number;
    filepathWeight?: number;
    headerWeight?: number;
  };
  /** Raw query string, needed for filepath scoring and temporal routing. */
  query?: string;
};

export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
  enhanced?: EnhancedHybridWeights;
}): Array<{
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: HybridSource;
}> {
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      source: HybridSource;
      snippet: string;
      vectorScore: number;
      textScore: number;
    }
  >();

  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
    });
  }

  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  const enh = params.enhanced;
  const rawQuery = enh?.query ?? "";
  const fpWeight = enh?.filepathWeight ?? 0;
  const headerWeight = enh?.headerWeight ?? 0;
  const temporalBoost = enh?.temporalBoost ?? 1;

  // Temporal routing: extract dates from query
  const dateRefs = rawQuery ? extractDates(rawQuery) : [];
  const hasTemporal = dateRefs.length > 0 && temporalBoost > 1;

  // Determine if adaptive weighting should activate
  const adaptiveCfg = enh?.adaptive;
  const bestTextScore = Math.max(0, ...Array.from(byId.values()).map((e) => e.textScore));
  const adaptiveThreshold = adaptiveCfg?.keywordThreshold ?? 0.1;
  const useAdaptive =
    adaptiveCfg?.enabled === true && bestTextScore < adaptiveThreshold;

  let vw = params.vectorWeight;
  let tw = params.textWeight;
  let fw = fpWeight;
  let hw = headerWeight;

  if (useAdaptive) {
    vw = adaptiveCfg?.vectorWeight ?? 0.85;
    tw = adaptiveCfg?.textWeight ?? 0.05;
    fw = adaptiveCfg?.filepathWeight ?? 0.05;
    hw = adaptiveCfg?.headerWeight ?? 0.05;
  }

  const merged = Array.from(byId.values()).map((entry) => {
    const fpScore = rawQuery && fw > 0 ? filepathScore(rawQuery, entry.path) : 0;
    // Header scoring: use the snippet's first markdown heading if present
    let hScore = 0;
    if (rawQuery && hw > 0) {
      const headerMatch = entry.snippet.match(/^#{1,6}\s+(.+)/m);
      if (headerMatch) {
        hScore = keywordOverlapScore(rawQuery, headerMatch[1]!);
      }
    }

    let score = vw * entry.vectorScore + tw * entry.textScore + fw * fpScore + hw * hScore;

    // Apply temporal boost if file path contains a matching date
    if (hasTemporal && dateRefs.some((d) => entry.path.includes(d))) {
      score *= temporalBoost;
    }

    return {
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet,
      source: entry.source,
    };
  });

  return merged.toSorted((a, b) => b.score - a.score);
}
