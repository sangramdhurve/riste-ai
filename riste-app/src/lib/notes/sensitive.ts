/**
 * Keyword backstop for "is this note too personal to ever appear in a message?"
 * Health, grief, money and conflict notes are reminders for the user only. A
 * false positive just keeps a note private (the user can untick it); a false
 * negative could put someone's surgery into an auto-sent greeting, so this
 * deliberately errs wide. Pure and dependency-free so the add-note form can
 * pre-tick the box as you type.
 */
const LATIN = new RegExp(
  "\\b(" +
    [
      // grief
      "died", "dies", "death", "dead", "passed away", "funeral", "cremation", "grief", "mourning",
      "maut", "nidhan", "guzar ga\\w*",
      // health
      "hospital\\w*", "surgery", "operation", "cancer", "chemo\\w*", "diagnos\\w*", "illness",
      "sick", "ill", "accident", "injur\\w*", "pregnan\\w*", "miscarriage", "icu", "rehab",
      "depress\\w*", "anxiety", "therapy", "therapist", "suicid\\w*", "bimar\\w*", "beemar\\w*",
      "aspatal",
      // money
      "money", "loan\\w*", "debt\\w*", "borrow\\w*", "lent", "owe\\w*", "salary", "rent",
      "fired", "laid off", "layoff\\w*", "jobless", "paisa", "paise", "karz\\w*", "udhaar",
      // conflict
      "divorce\\w*", "breakup", "broke up", "separated", "fight\\w*", "fought", "argument\\w*",
      "conflict", "angry", "upset", "talaq", "jhag(?:da|ra)\\w*",
    ].join("|") +
    ")\\b",
  "i"
);

// Devanagari has no ASCII word boundaries, so match these as plain substrings.
const DEVANAGARI = [
  "बीमार", "अस्पताल", "ऑपरेशन", "मौत", "मृत्यु", "गुज़र गए", "गुजर गए", "निधन", "अंतिम संस्कार",
  "तलाक", "झगड़ा", "पैसे", "पैसा", "कर्ज़", "कर्ज", "उधार", "नौकरी छूट",
];

export function looksSensitive(text: string | null | undefined): boolean {
  if (!text) return false;
  return LATIN.test(text) || DEVANAGARI.some((w) => text.includes(w));
}
