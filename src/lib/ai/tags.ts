import slugify from "slugify";

/** Slug tagu — JEDNA definicja dla pipeline'u i lookupów (`tags.slug` UNIQUE). */
export function tagSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, locale: "pl" });
}

export interface TagCandidate {
  name: string;
  slug: string;
}

export const MAX_TAGS_PER_ARTICLE = 5;
const MAX_BRAND_NEW_TAGS = 1;
const MAX_TAG_LENGTH = 40;

/**
 * Tagi z odpowiedzi AI → kandydaci: przycięte, bez pustych/przydługich
 * (zdanie zamiast encji), zdeduplikowane PO SLUGU ("GPT-5" i "GPT 5" to ten
 * sam tag — wcześniej oba szły do upsertu).
 */
export function normalizeTagCandidates(rawTags: unknown): TagCandidate[] {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set<string>();
  const out: TagCandidate[] = [];
  for (const raw of rawTags) {
    if (typeof raw !== "string") continue;
    const name = raw.replace(/^#/, "").replace(/\s+/g, " ").trim();
    if (!name || name.length > MAX_TAG_LENGTH) continue;
    const slug = tagSlug(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name, slug });
  }
  return out;
}

export interface TagSelection {
  /** Tagi już istniejące w bazie — linkujemy po id, nazwa kanoniczna z DB. */
  existing: { id: string; slug: string }[];
  /** Całkiem nowe encje do utworzenia (maks. 1). */
  create: TagCandidate[];
  /** Odrzucone nowe tagi (log/telemetria). */
  dropped: string[];
}

/**
 * Dyscyplina katalogu tagów egzekwowana w KODZIE (prompt tylko prosi):
 *
 * 1. tagi z katalogu top-100 (przekazanego do promptu) — pierwszeństwo,
 * 2. tagi spoza listy, ale ISTNIEJĄCE już w bazie (katalog ma ~2,6k pozycji)
 *    — bogatsze tagowanie bez tworzenia nowych bytów (pierwsza, zbyt wąska
 *    wersja przycinała wszystko spoza top-60 i artykuły miały po 1 tagu),
 * 3. tagi CAŁKIEM nowe — maksymalnie JEDEN (nowa encja, np. premiera modelu).
 *
 * Łącznie maks. 5. Dopasowanie po slugu, więc istniejący tag NIGDY nie jest
 * przemianowywany — dawny upsert `{ name, slug }` z `onConflict: slug`
 * nadpisywał kanoniczną nazwę ("OpenAI") wariantem z AI ("openai").
 */
export function selectTags(
  candidates: TagCandidate[],
  catalogSlugs: ReadonlySet<string>,
  existingBySlug: ReadonlyMap<string, { id: string }>,
): TagSelection {
  const inCatalog: { id: string; slug: string }[] = [];
  const knownInDb: { id: string; slug: string }[] = [];
  const brandNew: TagCandidate[] = [];

  for (const candidate of candidates) {
    const existing = existingBySlug.get(candidate.slug);
    if (existing) {
      (catalogSlugs.has(candidate.slug) ? inCatalog : knownInDb).push({ id: existing.id, slug: candidate.slug });
    } else {
      brandNew.push(candidate);
    }
  }

  const existing = [...inCatalog, ...knownInDb].slice(0, MAX_TAGS_PER_ARTICLE);
  const room = Math.max(0, Math.min(MAX_BRAND_NEW_TAGS, MAX_TAGS_PER_ARTICLE - existing.length));
  const create = brandNew.slice(0, room);
  const dropped = brandNew.slice(room).map((t) => t.name);
  return { existing, create, dropped };
}
