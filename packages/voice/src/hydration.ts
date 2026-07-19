import nlp from "compromise";
import { Entity, WorldState, resolveAlias } from "@omnia/core";
import { splitQuotes } from "./dehydration.js";

/**
 * Hydrates a dehydrated narration text containing entity@<id>[original] symbol tags
 * into natural language from a specific viewer's perspective.
 */
export function hydrate(content: string, viewer: Entity): string {
  if (!content) return "";
  const segments = splitQuotes(content);

  const processedSegments = segments.map((seg) => {
    if (seg.isQuote) {
      return `'${seg.text}'`;
    }

    // Match entity@<id>[original] and optionally the following space and word
    const regex = /entity@([a-zA-Z0-9-]+)\[([^\]]+)\](?:\s+([a-zA-Z]+))?/g;

    const firstPersonSet = new Set([
      "i",
      "me",
      "my",
      "myself",
      "mine",
      "we",
      "us",
      "our",
      "ours",
    ]);
    const thirdPersonSet = new Set([
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
    ]);

    return seg.text.replace(regex, (matchStr, id, original, followingWord) => {
      const isSelf = id === viewer.id;
      const lowerOriginal = original.toLowerCase();
      let resolvedSubject = "";
      let isThirdPersonSingular = false;

      if (isSelf) {
        if (["his", "her", "their", "my", "its", "our"].includes(lowerOriginal))
          resolvedSubject = "my";
        else if (["hers", "theirs", "mine", "ours"].includes(lowerOriginal))
          resolvedSubject = "mine";
        else if (
          [
            "himself",
            "herself",
            "themselves",
            "myself",
            "itself",
            "ourselves",
          ].includes(lowerOriginal)
        )
          resolvedSubject = "myself";
        else if (["he", "she", "they", "i", "we"].includes(lowerOriginal))
          resolvedSubject = "I";
        else if (["him", "her", "them", "me", "us"].includes(lowerOriginal))
          resolvedSubject = "me";
        else {
          // Noun/alias mapped to self: check preceding/succeeding context
          const matchIdx = seg.text.indexOf(matchStr);
          const precedingText = seg.text.slice(0, matchIdx);
          const prec = precedingText.trim();
          const words = prec.split(/\s+/);
          const lastWord = words[words.length - 1]?.toLowerCase() || "";

          const prepositions = [
            "to",
            "with",
            "for",
            "at",
            "by",
            "from",
            "in",
            "on",
            "about",
            "between",
            "of",
            "under",
            "over",
            "behind",
            "beside",
            "through",
          ];
          if (prepositions.includes(lastWord)) {
            resolvedSubject = "me";
          } else {
            resolvedSubject = "I";
          }
        }
      } else {
        const alias = resolveAlias(viewer, id);
        if (firstPersonSet.has(lowerOriginal)) {
          if (["my", "our"].includes(lowerOriginal))
            resolvedSubject = `${alias}'s`;
          else if (["mine", "ours"].includes(lowerOriginal))
            resolvedSubject = `${alias}'s`;
          else if (["myself", "ourselves"].includes(lowerOriginal))
            resolvedSubject = "himself";
          else {
            resolvedSubject = alias;
            isThirdPersonSingular = true;
          }
        } else if (thirdPersonSet.has(lowerOriginal)) {
          resolvedSubject = original;
          if (["he", "she", "it"].includes(lowerOriginal)) {
            isThirdPersonSingular = true;
          }
        } else {
          resolvedSubject = alias;
          isThirdPersonSingular = true;
        }
      }

      if (followingWord) {
        if (isThirdPersonSingular) {
          const conj = nlp(followingWord).verbs().conjugate()[0] as any;
          if (conj && conj.Infinitive === followingWord && conj.PresentTense) {
            return `${resolvedSubject} ${conj.PresentTense}`;
          }
        }
        return `${resolvedSubject} ${followingWord}`;
      }

      return resolvedSubject;
    });
  });

  return processedSegments.join("");
}

/**
 * Hydrates a dehydrated narration text containing entity@<id>[original] symbol tags
 * into natural language from an objective world perspective.
 */
export function hydrateObjective(
  content: string,
  worldState: WorldState,
): string {
  if (!content) return "";
  const segments = splitQuotes(content);

  const processedSegments = segments.map((seg) => {
    if (seg.isQuote) {
      return `'${seg.text}'`;
    }

    // Match entity@<id>[original] and optionally the following space and word
    const regex = /entity@([a-zA-Z0-9-]+)\[([^\]]+)\](?:\s+([a-zA-Z]+))?/g;

    const firstPersonSet = new Set([
      "i",
      "me",
      "my",
      "myself",
      "mine",
      "we",
      "us",
      "our",
      "ours",
    ]);
    const thirdPersonSet = new Set([
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
    ]);

    return seg.text.replace(regex, (matchStr, id, original, followingWord) => {
      const entity = worldState.getEntity(id);
      const name = entity?.attributes.get("name")?.getValue() || id;
      const lowerOriginal = original.toLowerCase();
      let resolvedSubject = "";
      let isThirdPersonSingular = false;

      if (firstPersonSet.has(lowerOriginal)) {
        if (["my", "our"].includes(lowerOriginal))
          resolvedSubject = `${name}'s`;
        else if (["mine", "ours"].includes(lowerOriginal))
          resolvedSubject = `${name}'s`;
        else if (["myself", "ourselves"].includes(lowerOriginal))
          resolvedSubject = "himself";
        else {
          resolvedSubject = name;
          isThirdPersonSingular = true;
        }
      } else if (thirdPersonSet.has(lowerOriginal)) {
        resolvedSubject = original;
        if (["he", "she", "it"].includes(lowerOriginal)) {
          isThirdPersonSingular = true;
        }
      } else {
        resolvedSubject = name;
        isThirdPersonSingular = true;
      }

      if (followingWord) {
        if (isThirdPersonSingular) {
          const conj = nlp(followingWord).verbs().conjugate()[0] as any;
          if (conj && conj.Infinitive === followingWord && conj.PresentTense) {
            return `${resolvedSubject} ${conj.PresentTense}`;
          }
        }
        return `${resolvedSubject} ${followingWord}`;
      }

      return resolvedSubject;
    });
  });

  return processedSegments.join("");
}
