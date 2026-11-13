import { scopeOf } from "./rubric.mjs";
// Interview prompts the candidate can pick. Sent to Tavus as conversational_context.
export const PROMPTS = [
  {
    id: "cancel-winback",
    title: "Subscription cancel agent with 30-day win-back",
    brief:
      "Design an AI customer-service agent for a streaming service (50M subscribers, about 200k cancel attempts a day) that handles cancellations over chat and voice, makes one save offer, and runs a win-back journey for 30 days after cancel by email and SMS (at most 3 messages, respects opt-out and marketing consent). It calls a billing API and a CRM. Chat replies under 3 s, voice under 1 s.",
    spoken: "an AI customer-service agent for a streaming service that handles cancellations, makes one save offer, and runs a 30-day win-back",
    twists: ["The billing API times out 2% of the time: what does the customer see?", "A user opts out mid-journey while a message is queued.", "10x traffic on the day of a price increase."],
  },
  {
    id: "rideshare",
    title: "Ride-hailing dispatch (Uber-like)",
    brief:
      "Design the core of a ride-hailing app: riders request a ride, nearby drivers are matched within seconds, both see live location until drop-off. 10M rides a day, peaks 5x on Friday nights.",
    spoken: "the core of a ride-hailing app like Uber: matching riders to nearby drivers, with live location until drop-off",
    twists: ["Two riders get matched to the same driver.", "A whole city's location updates double.", "The payment service is down at drop-off."],
  },
  {
    id: "url-shortener",
    title: "URL shortener (warm-up)",
    brief: "Design a URL shortener like Bitly: create short links, redirect fast, show click counts. 100M new links a month, 100:1 read to write.",
    spoken: "a URL shortener like Bitly: create short links, redirect fast, and count clicks",
    twists: ["Custom aliases collide.", "One link goes viral: 1M clicks a minute.", "Analytics must not slow redirects."],
  },
];

export function contextFor(p, candidateName, maxSeconds, scope = scopeOf(process.env.INTERVIEW_SCOPE || "screen")) {
  return [
    maxSeconds ? `SESSION LENGTH: ${Math.round(maxSeconds / 60)} minutes in total.` : "",
    scope.pacing,
    `Only call rubric_mark for these items: ${scope.items.join(", ")}.`,
    `INTERVIEW PROMPT: ${p.title}.`,
    `QUESTION AS SPOKEN (if asked to repeat the question, say only this): Design ${p.spoken}.`,
    `PRIVATE BRIEF (your answer sheet: reveal a fact only when the candidate asks about it): ${p.brief}`,
    scope.id === "full" ? `Twists to use in deep dives, one at a time: ${p.twists.join(" | ")}` : "",
    candidateName ? `The candidate's name is ${candidateName}.` : "",
    "BOARD STATE: The board is EMPTY. Nothing has been drawn yet.",
  ].filter(Boolean).join("\n");
}

/** Spoken the moment the PAL joins: who it is, what this session is, how the board works, the prompt. */
export function greetingFor(p, candidateName, maxSeconds, scope = scopeOf(process.env.INTERVIEW_SCOPE || "screen")) {
  const mins = Math.max(1, Math.round(maxSeconds / 60));
  return [
    `Hi${candidateName ? ` ${candidateName}` : ""}, I'm ${process.env.INTERVIEWER_NAME || "Anna"}, and I'll be your system design interviewer today.`,
    `This is the first-round system design interview${process.env.COMPANY_NAME ? ` for ${process.env.COMPANY_NAME}` : ""}, and it runs about ${mins} minutes. You draw on the whiteboard on the left, and I read it as you go. Open the Library button at the top right of the board for ready-made pieces, like a database, a queue, a billing API and a CRM. Drag them in and rename them as you like.`,
    `You can also share your screen with the button on the right if you want to show me something else.`,
    scope.spoken,
    `Today's question: design ${p.spoken}.`,
    `What would you like to clarify first?`,
  ].filter(Boolean).join(" ");
}
