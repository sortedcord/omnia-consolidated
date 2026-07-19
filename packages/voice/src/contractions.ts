import { splitQuotes } from "./dehydration.js";

/**
 * Preprocessor that expands common contractions (e.g. "he's" -> "he is", "I'm" -> "I am")
 * in non-quote segments of a text, keeping dialogue segments untouched.
 */
export function expandContractions(text: string): string {
  if (!text) return "";

  const contractionMap: Record<string, string> = {
    "i'm": "I am",
    "you're": "you are",
    "he's": "he is",
    "she's": "she is",
    "it's": "it is",
    "we're": "we are",
    "they're": "they are",
    "i've": "I have",
    "you've": "you have",
    "we've": "we have",
    "they've": "they have",
    "i'd": "I would",
    "you'd": "you would",
    "he'd": "he would",
    "she'd": "she would",
    "we'd": "we would",
    "they'd": "they would",
    "i'll": "I will",
    "you'll": "you will",
    "he'll": "he will",
    "she'll": "she will",
    "we'll": "we will",
    "they'll": "they will",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "haven't": "have not",
    "hasn't": "has not",
    "hadn't": "had not",
    "won't": "will not",
    "wouldn't": "would not",
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "can't": "cannot",
    "couldn't": "could not",
    "shouldn't": "should not",
    "mightn't": "might not",
    "mustn't": "must not",
  };

  const segments = splitQuotes(text);
  const processed = segments.map((seg) => {
    if (seg.isQuote) {
      return `"${seg.text}"`;
    }

    let chunk = seg.text;
    Object.entries(contractionMap).forEach(([contraction, replacement]) => {
      const escaped = contraction.replace("'", "'");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      chunk = chunk.replace(regex, (matched) => {
        const isCapitalized = matched[0] === matched[0].toUpperCase();
        let finalRep = replacement;
        if (isCapitalized) {
          finalRep = finalRep[0].toUpperCase() + finalRep.slice(1);
        } else {
          if (finalRep.startsWith("I ")) {
            // Keep I capitalized
          } else {
            finalRep = finalRep[0].toLowerCase() + finalRep.slice(1);
          }
        }
        return finalRep;
      });
    });
    return chunk;
  });

  return processed.join("");
}
