export interface Segment {
  text: string;
  isQuote: boolean;
}

/**
 * Splits text into quote and non-quote segments.
 */
export function splitQuotes(text: string): Segment[] {
  const segments: Segment[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if ((char === '"' || char === "'") && (!inQuote || char === quoteChar)) {
      if (current) {
        segments.push({ text: current, isQuote: inQuote });
        current = "";
      }
      inQuote = !inQuote;
      quoteChar = inQuote ? char : "";
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push({ text: current, isQuote: inQuote });
  }

  return segments;
}

/**
 * Transforms standard narrative prose from the source actor's perspective
 * into a dehydrated canonical form with entity@<id>[original] placeholder tags.
 */
export function dehydrate(
  content: string,
  sourceId: string,
  targetIds: string[],
  aliasMap: Record<string, string>,
): string {
  if (!content) return "";

  const segments = splitQuotes(content);

  const processedSegments = segments.map((seg) => {
    if (seg.isQuote) {
      return `"${seg.text}"`;
    }

    let text = seg.text;

    // 1. Map lowercase aliases/names/IDs to IDs
    const nameToId = new Map<string, string>();

    // Add target IDs and source ID themselves
    nameToId.set(sourceId.toLowerCase(), sourceId);
    targetIds.forEach((id) => {
      nameToId.set(id.toLowerCase(), id);
    });

    // Add entries from aliasMap (mapped lowercased)
    Object.entries(aliasMap).forEach(([name, id]) => {
      nameToId.set(name.toLowerCase(), id);
    });

    // Sort names by length descending to match longest name first
    const sortedNames = Array.from(nameToId.keys()).sort(
      (a, b) => b.length - a.length,
    );

    // Track state of matched target IDs for pronoun lookback
    const matchedTargetIds: string[] = [];

    // 2. Replace names and aliases with entity@<id>[name]
    sortedNames.forEach((name) => {
      const id = nameToId.get(name)!;
      const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedName}\\b`, "gi");

      text = text.replace(regex, (matched) => {
        if (id !== sourceId) {
          matchedTargetIds.push(id);
        }
        return `entity@${id}[${matched}]`;
      });
    });

    // 3. Replace first-person pronouns with source actor tag
    const firstPersonPronouns = [
      { word: "i" },
      { word: "me" },
      { word: "my" },
      { word: "myself" },
      { word: "mine" },
      { word: "we" },
      { word: "us" },
      { word: "our" },
      { word: "ours" },
      { word: "ourselves" },
    ];

    firstPersonPronouns.forEach(({ word }) => {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      text = text.replace(regex, (matched) => {
        return `entity@${sourceId}[${matched}]`;
      });
    });

    // 4. Replace third-person pronouns using state lookback
    const thirdPersonPronouns = [
      "he",
      "him",
      "his",
      "himself",
      "she",
      "her",
      "hers",
      "herself",
      "they",
      "them",
      "their",
      "theirs",
      "themselves",
    ];
    thirdPersonPronouns.forEach((pronoun) => {
      const regex = new RegExp(`\\b${pronoun}\\b`, "gi");
      text = text.replace(regex, (matched) => {
        const lastTargetId =
          matchedTargetIds[matchedTargetIds.length - 1] || targetIds[0];
        if (lastTargetId) {
          return `entity@${lastTargetId}[${matched}]`;
        }
        return matched;
      });
    });

    return text;
  });

  return processedSegments.join("");
}
