// A conservative support filter, not a truth classifier or a calibrated probability.
// Typed questions require a value in the source text; topic similarity is insufficient.
export type EvidenceRecord = {
  id: string;
  excerpt: string;
  title: string;
  sources: readonly { sourceId: string }[];
};
const number =
  /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|sixty|hundred|thousand)\b/i;
const date =
  /\b\d{4}-\d{2}-\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i;
const uncertain =
  /\b(?:unknown|unconfirmed|unverified|unscheduled|unapproved|not (?:known|recorded|confirmed|measured|verified|final)|no (?:final|confirmed|exact|measured)|did not (?:measure|confirm|record)|don't know|do not know|seller claim)\b/i;
export function evidenceTerms(text: string) {
  return [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter(
          (w) =>
            w.length > 2 &&
            !/^(what|which|who|whose|when|where|how|why|did|does|have|has|had|the|and|but|for|from|with|that|this|was|were|are|our|you|your|should|would|could|can|want|said|say|tell|about|after|before|into|than|then|just|get|got|much|many|exact|name|number|last|next|my|its)$/.test(
              w,
            ),
        )
        .map((w) => w.replace(/(?:ing|ed|s)$/, "")),
    ),
  ];
}
type Facet = {
  name: string;
  query: RegExp;
  support: (text: string) => boolean;
};
const facets: Facet[] = [
  {
    name: "identifier",
    query: /\b(?:serial|model) number\b|\bfirmware version\b/i,
    support: (t) =>
      /\b(?:serial|model|firmware|version)\b.{0,35}\b[A-Z0-9][A-Z0-9._-]*\d[A-Z0-9._-]*\b/i.test(
        t,
      ),
  },
  {
    name: "phone",
    query: /\b(?:phone|telephone) number\b/i,
    support: (t) =>
      /\b(?:phone|telephone|call|contact)\b.{0,30}\+?[\d (][\d ()-]{7,18}\d/i.test(
        t,
      ),
  },
  {
    name: "address",
    query: /\b(?:street|postal|mailing) address\b/i,
    support: (t) =>
      /\b\d{1,5}\s+(?:[\w'-]+\s+){1,4}(?:Street|Road|Avenue|Lane|Drive|Court|Way|St|Rd|Ave)\b/i.test(
        t,
      ),
  },
  {
    name: "birth_date",
    query: /\b(?:birth date|date of birth|birthday)\b/i,
    support: (t) => /\bborn|birth/i.test(t) && date.test(t),
  },
  {
    name: "appointment_date",
    query: /\bappointment (?:date|time)\b|\bwhen\b.*\bappointment\b/i,
    support: (t) => /appointment|scheduled|booked/i.test(t) && date.test(t),
  },
  {
    name: "medical_measurement",
    query: /\bblood pressure\b|\b(?:kilograms|weigh|weight)\b/i,
    support: (t) =>
      /\b\d{2,3}\s*\/\s*\d{2,3}\b|\b\d+(?:\.\d+)?\s*(?:kg|kilograms|pounds|lbs)\b/i.test(
        t,
      ),
  },
  {
    name: "causal_effect",
    query: /\b(?:measured|exact) causal effect\b/i,
    support: (t) =>
      /randomized|controlled (?:trial|experiment)/i.test(t) &&
      number.test(t) &&
      !/not (?:proof|causal)|no causal/i.test(t),
  },
  {
    name: "person",
    query:
      /\bname\b.*\b(?:specialist|doctor|dentist|veterinarian|vet)\b|\b(?:specialist|doctor|dentist|veterinarian|vet)'s name\b/i,
    support: (t) =>
      /\b(?:specialist|doctor|dentist|veterinarian|vet)\b.{0,30}\b(?:Dr\.?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(
        t,
      ),
  },
  {
    name: "author",
    query: /\b(?:who|author)\b.*\b(?:book|author)\b/i,
    support: (t) =>
      /\b(?:author|written by|book.{0,50}\bby)\s+(?:is\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+/.test(
        t,
      ),
  },
  {
    name: "employer",
    query: /\b(?:which|what) company\b.*\b(?:employ|work)|\bwho employs\b/i,
    support: (t) =>
      /\b(?:works? (?:at|for)|employed by|employer is)\s+[A-Z][\w-]+/.test(t),
  },
  {
    name: "booking",
    query:
      /\b(?:hotel|airport)\b.*\b(?:book|ticket|confirm)|\b(?:book|ticket|confirm)\b.*\b(?:hotel|airport)\b/i,
    support: (t) =>
      /\b(?:booked|confirmed|ticket|reservation)\b/.test(t) &&
      /\b(?:hotel|airport)\b/i.test(t) &&
      !/not (?:booked|confirmed)|nothing was booked/i.test(t),
  },
  {
    name: "insurer",
    query: /\b(?:which|what) insurance company\b/i,
    support: (t) =>
      /\b(?:insurer|insurance company|insured (?:by|with)|quote (?:from|by))\s+(?:is\s+)?[A-Z][\w-]+/.test(
        t,
      ),
  },
  {
    name: "leave_balance",
    query: /\b(?:sick|vacation|leave) days\b.*\b(?:left|remain|balance)\b/i,
    support: (t) =>
      /sick|vacation|leave/i.test(t) &&
      /left|remaining|balance/i.test(t) &&
      number.test(t),
  },
  {
    name: "transaction",
    query: /\b(?:which|what) shares\b.*\b(?:sell|sold)\b/i,
    support: (t) => /\b(?:sold|sale of)\b/i.test(t) && number.test(t),
  },
  {
    name: "amount",
    query:
      /\bhow much\b.*\b(?:spend|spent|revenue|earn|paid)|\b(?:sale price|property taxes|interest rate|revenue)\b/i,
    support: (t) =>
      number.test(t) &&
      /\$|€|£|percent|%|dollars?|paid|spent|revenue|tax|interest|sale price/i.test(
        t,
      ),
  },
];
export function requestedFacet(query: string) {
  if (
    !/^(?:what|which|who|whose|when|where|how|do you know|tell me|remind me)\b/i.test(
      query.trim(),
    ) ||
    /^what is (?:a|an)\b|^how (?:do|can|should) (?:I|we)\b/i.test(query.trim())
  )
    return undefined;
  return facets.find((f) => f.query.test(query));
}
export function isMemoryQuestion(query: string) {
  if (
    /^how (?:do|can|should) (?:I|we)\b|\b(?:should|could) (?:I|we)\b/i.test(
      query.trim(),
    ) &&
    !/\b(?:remember|saved|memory|decided|previously)\b/i.test(query)
  )
    return false;
  return (
    /^(?:what|which|who|whose|when|where|how|did|do|does|can|is|are|remind|remember)\b/i.test(
      query.trim(),
    ) &&
    /\b(?:my|our|we|me|I|remember|did|was|were|said|decide|previous|last|record|saved|memory)\b/i.test(
      query,
    )
  );
}
export function selectEvidence<T extends EvidenceRecord>(
  query: string,
  records: readonly T[],
) {
  const facet = requestedFacet(query),
    terms = evidenceTerms(query);
  // Dates for exact historical values need a resolved range; do not guess it from similarity.
  const unresolvedTime =
    Boolean(facet) &&
    /\b(?:yesterday|today|last (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|quarter))\b/i.test(
      query,
    );
  const named = (query.match(/\b[A-Z][a-z]+(?:'s)?\b/g) ?? [])
    .slice(1)
    .map((s) => s.replace(/'s$/, ""));
  const items = records.filter((record) => {
    if (!record.sources.length) return false;
    if (!facet) return true;
    if (unresolvedTime) return false;
    const sentences = record.excerpt
      .replace(/\b(Dr|Mr|Ms|Mrs)\./g, "$1")
      .split(/(?<=[.!?])\s+/);
    return sentences.some((sentence) => {
      if (
        uncertain.test(sentence) ||
        /\b(?:not|never)\b/i.test(sentence) ||
        !facet.support(sentence)
      )
        return false;
      if (facet.name === "amount") {
        if (
          /sale price/i.test(query) &&
          !/sale price|sold for|final (?:sale|price)/i.test(sentence)
        )
          return false;
        if (
          /interest rate/i.test(query) &&
          !/(?:interest|loan) rate/i.test(sentence)
        )
          return false;
        if (/property taxes/i.test(query) && !/property tax/i.test(sentence))
          return false;
        if (/revenue/i.test(query) && !/revenue/i.test(sentence)) return false;
      }
      if (facet.name === "identifier") {
        const detail = query.match(/\b(serial|model|firmware)\b/i)?.[1];
        if (detail && !new RegExp(`\\b${detail}\\b`, "i").test(sentence))
          return false;
      }
      if (
        named.some(
          (name) => !record.excerpt.toLowerCase().includes(name.toLowerCase()),
        )
      )
        return false;
      const present = new Set(evidenceTerms(record.excerpt));
      return (
        terms.filter((t) => present.has(t)).length >= Math.min(2, terms.length)
      );
    });
  });
  return {
    items,
    status: items.length
      ? ("unverified_support" as const)
      : ("insufficient" as const),
    reason: items.length
      ? "source_candidates"
      : unresolvedTime
        ? "unresolved_time"
        : facet
          ? "requested_detail_missing"
          : "no_visible_evidence",
    facet: facet?.name ?? null,
    rejected: records.length - items.length,
  };
}
export const UNKNOWN_MEMORY_ANSWER =
  "I don't know from the available memory evidence. I couldn't find a source that supports that detail.";
export function memoryAbstention(
  query: string,
  status: string,
  hasAuthoritativeEvidence = false,
) {
  return status === "insufficient" &&
    !hasAuthoritativeEvidence &&
    (Boolean(requestedFacet(query)) || isMemoryQuestion(query))
    ? UNKNOWN_MEMORY_ANSWER
    : null;
}

export function hasStructuredEvidence(
  records: readonly { kind: string; data: unknown }[],
) {
  return records.some((record) => {
    if (!record.data || typeof record.data !== "object") return false;
    const data = record.data as Record<string, unknown>;
    if (record.kind === "deterministic_financial_aggregation")
      return typeof data.count === "number" && data.count > 0;
    if (record.kind === "sleep_aggregation")
      return typeof data.entries === "number" && data.entries > 0;
    if (record.kind === "saved_tasks")
      return Array.isArray(data.tasks) && data.tasks.length > 0;
    if (record.kind === "operational_observation")
      return (
        !!data.metrics &&
        typeof data.metrics === "object" &&
        Object.keys(data.metrics).length > 0
      );
    return false;
  });
}
