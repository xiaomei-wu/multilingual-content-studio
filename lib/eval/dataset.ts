// lib/eval/dataset.ts
// The 10 fixed eval inputs. Deliberately VARIED across the three axes the harness
// is meant to stress: source length (one-liner → long article), topic (tech,
// food, travel, finance, health, books…), and target language (en / de / zh),
// crossed with every platform and a spread of tones.
//
// Each case carries `keyPoints`: the facts a faithful post must preserve. The LLM
// judge uses them to score "captures source key points" and to catch fabrication.
// Keeping the dataset fixed is the point — it's the ruler we measure prompt
// versions against.

import type { Platform, Language, Tone } from "../prompts";

export interface EvalCase {
  id: string;
  /** Short note on what makes this case interesting (length/topic). */
  note: string;
  source: string;
  platform: Platform;
  language: Language;
  tone: Tone;
  /** Key facts a faithful generation must preserve (judge reference). */
  keyPoints: string[];
}

export const DATASET: EvalCase[] = [
  {
    id: "01-launch-en-linkedin",
    note: "medium · product launch · English",
    platform: "linkedin",
    language: "en",
    tone: "professional",
    source:
      "Today we're launching Lumen, an AI writing assistant for customer support teams. " +
      "It drafts replies in your brand voice, suggests help-center articles to link, and " +
      "flags angry messages for a human. Early customers cut first-response time by 40%. " +
      "Lumen is free for teams under five seats and integrates with Zendesk and Intercom.",
    keyPoints: [
      "Product is called Lumen, an AI writing assistant for customer support",
      "Drafts replies in brand voice and suggests help-center articles",
      "Cut first-response time by 40%",
      "Free under five seats; integrates with Zendesk and Intercom",
    ],
  },
  {
    id: "02-tip-en-x-punchy",
    note: "short · startup advice · English",
    platform: "x",
    language: "en",
    tone: "punchy",
    source:
      "Hot take: your startup doesn't have a marketing problem, it has a positioning problem. " +
      "Nail who it's for and the marketing writes itself.",
    keyPoints: [
      "Many startups mistake a positioning problem for a marketing problem",
      "Clear positioning makes marketing easier",
    ],
  },
  {
    id: "03-milestone-de-linkedin",
    note: "medium · company milestone · German",
    platform: "linkedin",
    language: "de",
    tone: "professional",
    source:
      "We just crossed 10,000 paying customers across 40 countries, three years after launch. " +
      "Huge thanks to our 60-person team and the community that shaped the roadmap. " +
      "Next up: a self-serve onboarding flow and SOC 2 Type II certification this quarter.",
    keyPoints: [
      "Reached 10,000 paying customers in 40 countries",
      "Three years after launch; team of 60",
      "Next: self-serve onboarding and SOC 2 Type II this quarter",
    ],
  },
  {
    id: "04-skincare-zh-xhs",
    note: "medium · skincare review · Chinese",
    platform: "xiaohongshu",
    language: "zh",
    tone: "casual",
    source:
      "I tried the Hada Labo hyaluronic acid lotion for a month. Texture is watery, absorbs fast, " +
      "no sticky feeling. My dry winter skin felt plumper within a week. One bottle is about $15 and " +
      "lasts two months. Tip: pat it in on damp skin, then seal with a moisturizer.",
    keyPoints: [
      "Hada Labo hyaluronic acid lotion, used for a month",
      "Watery texture, absorbs fast, not sticky",
      "Helped dry skin feel plumper; ~$15, lasts two months",
      "Tip: apply on damp skin then seal with moisturizer",
    ],
  },
  {
    id: "05-cafe-en-xhs",
    note: "short · cafe recommendation · English",
    platform: "xiaohongshu",
    language: "en",
    tone: "casual",
    source:
      "Found a tiny café on Bergmannstrasse that roasts its own beans. The cortado is incredible, " +
      "the banana bread sells out by noon, and there's a quiet back room perfect for working.",
    keyPoints: [
      "A small café on Bergmannstrasse that roasts its own beans",
      "Great cortado; banana bread sells out by noon",
      "Quiet back room good for working",
    ],
  },
  {
    id: "06-devtip-de-x-punchy",
    note: "short · developer tip · German",
    platform: "x",
    language: "de",
    tone: "punchy",
    source:
      "Stop writing comments that say what the code does. Write comments that say WHY it does it. " +
      "The 'what' is in the code; the 'why' lives only in your head.",
    keyPoints: [
      "Comments should explain WHY, not WHAT",
      "The 'what' is already visible in the code",
    ],
  },
  {
    id: "07-remote-en-linkedin-long",
    note: "long · remote-work reflection · English",
    platform: "linkedin",
    language: "en",
    tone: "casual",
    source:
      "After five years of running a fully remote company, here's what I got wrong. I thought remote " +
      "meant more freedom, but without structure it just meant more meetings. I thought async would " +
      "happen naturally, but it had to be taught. I thought culture lived in offsites, but it actually " +
      "lives in how you write your daily updates. The biggest shift was realizing that clarity is a " +
      "kindness: a well-written doc saves ten people an hour each. We cut standups, wrote more, and " +
      "measured outcomes instead of hours. Two years in, retention is up and people say they finally " +
      "have time to think. Remote isn't about location. It's about writing things down.",
    keyPoints: [
      "Five years running a fully remote company; reflecting on mistakes",
      "Remote without structure meant more meetings, not freedom",
      "Async and culture must be deliberately taught/written, not assumed",
      "Cut standups, wrote more, measured outcomes; retention improved",
      "Core lesson: remote is about writing things down, not location",
    ],
  },
  {
    id: "08-news-zh-x-punchy",
    note: "short · tech news · Chinese",
    platform: "x",
    language: "zh",
    tone: "punchy",
    source:
      "A new open-source model matches GPT-4 on coding benchmarks but runs on a single consumer GPU. " +
      "Weights are released under a permissive license. This changes who gets to build.",
    keyPoints: [
      "New open-source model matches GPT-4 on coding benchmarks",
      "Runs on a single consumer GPU; permissive license",
    ],
  },
  {
    id: "09-book-en-x-casual",
    note: "short · book recommendation · English",
    platform: "x",
    language: "en",
    tone: "casual",
    source:
      "Just finished 'The Mom Test' by Rob Fitzpatrick. It's a short book about how to talk to " +
      "customers without lying to yourself. Best $10 I've spent on my startup this year.",
    keyPoints: [
      "Book: 'The Mom Test' by Rob Fitzpatrick",
      "About talking to customers honestly without self-deception",
      "Recommended; cost about $10",
    ],
  },
  {
    id: "10-recipe-de-xhs",
    note: "medium · recipe · German",
    platform: "xiaohongshu",
    language: "de",
    tone: "casual",
    source:
      "My 15-minute weeknight pasta: brown garlic in olive oil, add a tin of cherry tomatoes, " +
      "simmer five minutes, toss with spaghetti and a handful of torn basil. Finish with parmesan " +
      "and a splash of the pasta water to make it silky. Serves two, costs about three euros.",
    keyPoints: [
      "15-minute weeknight pasta recipe",
      "Garlic in olive oil, tin of cherry tomatoes, simmer, toss with spaghetti and basil",
      "Finish with parmesan and pasta water; serves two for ~3 euros",
    ],
  },
];
