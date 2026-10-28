import { describe, it, expect } from "vitest";
import { assessArticleQuality, englishTitleWords, isLikelyRefusal, QUALITY_PUBLISH_THRESHOLD } from "./quality";
import type { GeneratedArticle } from "./writer";

const body = [
  "OpenAI ogłosiło nowy model — szczegóły podaje [TechCrunch](https://techcrunch.com/2026/10/28/x).",
  "",
  "## Kluczowe wnioski",
  "",
  "- Pierwszy fakt ze źródła.",
  "- Drugi fakt ze źródła.",
  "",
  "## Co się zmienia",
  "",
  Array.from({ length: 450 }, (_, i) => `słowo${i}`).join(" "),
].join("\n");

const good: GeneratedArticle = {
  content: body,
  title: "OpenAI pokazuje nowy model rozumujący dla firm",
  excerpt: "OpenAI zaprezentowało nowy model rozumujący dla firm. Sprawdzamy, co zmienia w praktyce i kiedy trafi do użytkowników w Europie.",
  category: "modele-ai",
  tags: ["OpenAI", "modele rozumujące", "enterprise AI"],
  reading_time: 3,
};

describe("assessArticleQuality", () => {
  it("poprawny artykuł dostaje pełną notę", () => {
    expect(assessArticleQuality(good)).toEqual({ score: 100, issues: [] });
  });

  it("angielski tytuł spycha artykuł pod próg publikacji", () => {
    const result = assessArticleQuality({ ...good, title: "Can we trust LLMs to judge whether a research idea is novel?" });
    expect(result.score).toBeLessThan(QUALITY_PUBLISH_THRESHOLD);
  });

  it("karze kategorię spoza katalogu", () => {
    const result = assessArticleQuality({ ...good, category: "edukacja" });
    expect(result.issues).toContain("nieznana kategoria: edukacja");
  });

  it("brak linku do źródła i sekcji wniosków kumuluje kary", () => {
    const result = assessArticleQuality({ ...good, content: body.replace(/\[TechCrunch\]\([^)]+\)/, "TechCrunch").replace("## Kluczowe wnioski", "## Wstęp") });
    expect(result.score).toBe(60);
  });
});

describe("englishTitleWords", () => {
  it("wykrywa angielski tytuł po słowach funkcyjnych", () => {
    expect(englishTitleWords("Jury selection in Musk v. Altman begins with the first witnesses")).not.toEqual([]);
    expect(englishTitleWords("Can we trust LLMs to judge whether a research idea is novel?")).not.toEqual([]);
  });

  it("nie flaguje polskich tytułów z angielskimi nazwami własnymi", () => {
    expect(englishTitleWords("OpenAI i Microsoft rozszerzają współpracę wokół GPT-6")).toEqual([]);
    expect(englishTitleWords("To on stoi za sukcesem Claude Code")).toEqual([]);
    expect(englishTitleWords("Google zaprasza was do testów Gemini w Polsce")).toEqual([]);
  });

  it("nie flaguje polskich tytułów z angielskimi nazwami produktów", () => {
    // Przypadki z niezależnego code review 2026-10-28 — poprzednia wersja
    // heurystyki odrzucała je na stałe (źródło oznaczane jako przetworzone).
    expect(englishTitleWords("Gemini in Chrome trafia do Polski i UE")).toEqual([]);
    expect(englishTitleWords("Claude for Chrome już dostępny i za darmo")).toEqual([]);
    expect(englishTitleWords("Raport State of AI 2026: Chiny i USA na czele")).toEqual([]);
    expect(englishTitleWords("Copilot for Microsoft 365 – nowe funkcje i ceny")).toEqual([]);
  });

  it("flaguje angielski tytuł bez polskich sygnałów od 2 słów funkcyjnych", () => {
    expect(englishTitleWords("OpenAI expands partnership with the Pentagon")).not.toEqual([]);
    expect(englishTitleWords("Why we stopped using agents")).not.toEqual([]);
  });

  it("granice słów działają z polskimi znakami", () => {
    // "inż." nie może dać angielskiego "in"; "oną" nie może dać "on".
    expect(englishTitleWords("Mgr inż. z Krakowa buduje agenta AI dla szpitali — to przełom")).toEqual([]);
  });
});

describe("isLikelyRefusal", () => {
  it("wykrywa odmowę na początku odpowiedzi", () => {
    expect(isLikelyRefusal("Nie mogę przetworzyć tego materiału, ponieważ treść źródła jest nieczytelna.")).toBe(true);
    expect(isLikelyRefusal("Brak treści źródłowej do adaptacji.")).toBe(true);
    expect(isLikelyRefusal("I can't help with that request.")).toBe(true);
  });

  it("nie odrzuca artykułu z cytatem zawierającym 'nie mogę' w środku tekstu", () => {
    const article = `${"Wstęp artykułu o premierze. ".repeat(20)}\n\n„Nie mogę tego komentować" — powiedział rzecznik firmy.`;
    expect(isLikelyRefusal(article)).toBe(false);
  });
});
