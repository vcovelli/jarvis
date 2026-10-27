// Separate pre-scoring acceptance set: paired supported / absent facts plus adversarial negatives.
// These records are never used to tune ranking or field thresholds on the frozen 312-query set.
export const answerabilityCases = [
  {
    id: "device",
    domain: "server",
    query: "What is my Birch router's serial number?",
    content:
      "The Birch router serial number is BR-742Q. I copied it from the device label.",
    negative:
      "The Birch router was restarted yesterday. Its serial number is unknown.",
  },
  {
    id: "firmware",
    domain: "server",
    query: "What firmware version is on my Spruce switch?",
    content:
      "The Spruce switch firmware version is 3.14.7 after the maintenance check.",
    negative: "The Spruce switch firmware version has not been confirmed.",
  },
  {
    id: "phone",
    domain: "general",
    query: "What is my plumber's phone number?",
    content:
      "My plumber's phone number is 202-555-0147, copied from the service card.",
    negative: "I need to call the plumber. The phone number is not recorded.",
  },
  {
    id: "address",
    domain: "general",
    query: "What is the street address of my Finch workshop?",
    content: "My Finch workshop street address is 42 Westbrook Road.",
    negative: "The Finch workshop street address is still unknown.",
  },
  {
    id: "birth",
    domain: "general",
    query: "What is Rowan's birth date?",
    content: "Rowan's birth date is 1991-04-17.",
    negative: "Rowan's birth date has not been recorded.",
  },
  {
    id: "appointment",
    domain: "general",
    query: "What is my dentist appointment date?",
    content: "My dentist appointment is booked for 2026-11-09.",
    negative:
      "My dentist appointment is unscheduled; I only discussed booking it.",
  },
  {
    id: "weight",
    domain: "sleep",
    query: "How many kilograms did I weigh at my recorded check?",
    content: "At my recorded weight check I weighed 74 kilograms.",
    negative: "My weight check was discussed but there is no measured weight.",
  },
  {
    id: "doctor",
    domain: "sleep",
    query: "What is the name of my sleep specialist?",
    content:
      "My sleep specialist is Dr Elena Marsh. This is the clinician listed on the appointment card.",
    negative:
      "My sleep specialist has not been selected and the name is unknown.",
  },
  {
    id: "author",
    domain: "general",
    query: "Who is the author of my recommended book?",
    content: "My recommended book's author is Nora Ellison.",
    negative: "My mentor recommended a book; its author is not recorded.",
  },
  {
    id: "employer",
    domain: "career",
    query: "Which company employs Taylor?",
    content:
      "Taylor works at KestrelWorks. That is the company listed as Taylor's employer.",
    negative:
      "Taylor's employer is unknown; KestrelWorks was only a company mentioned in a news article.",
  },
  {
    id: "leave",
    domain: "career",
    query: "How many sick days do I have left?",
    content: "My sick leave balance is seven days remaining.",
    negative:
      "The sick leave balance was requested; no final count is recorded.",
  },
  {
    id: "tax",
    domain: "real-estate",
    query: "What were the exact annual property taxes on my Alder property?",
    content:
      "Annual property taxes on my Alder property were 4200 dollars, according to my saved tax statement.",
    negative:
      "The Alder brochure mentioned property taxes but provided no exact amount.",
  },
] as const;
