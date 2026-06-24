/**
 * home-config — the company's root surface (company-root-landing-001 +
 * homepage-composition-001). Written by provisioning (_step_substrate_install)
 * from the homepage composer / CTO home_mode + CMO positioning. Do NOT hand-edit.
 */
export interface HomeCta {
  label: string;
  href: string;
}

export interface HomeFeature {
  title: string;
  body: string;
}

export interface SectionImage {
  url?: string;
  alt?: string;
  caption?: string;
}

export interface HeroSection {
  type: "hero";
  eyebrow?: string;
  headline: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  image?: SectionImage;
}
export interface StatsSection {
  type: "stats";
  title?: string;
  stats: { value: string; label: string }[];
}
export interface HowItWorksSection {
  type: "how_it_works";
  title?: string;
  subhead?: string;
  steps: { title: string; body: string }[];
}
export interface FeatureGridSection {
  type: "feature_grid";
  title?: string;
  subhead?: string;
  features: HomeFeature[];
}
export interface FeatureSpotlightSection {
  type: "feature_spotlight";
  title?: string;
  items: { title: string; body: string; image?: SectionImage }[];
}
export interface SocialProofSection {
  type: "social_proof";
  title?: string;
  quotes: { quote: string; author?: string; role?: string }[];
}
export interface FaqSection {
  type: "faq";
  title?: string;
  items: { q: string; a: string }[];
}
export interface PricingTeaserSection {
  type: "pricing_teaser";
  title?: string;
  subhead?: string;
  tiers: {
    name: string;
    price?: string;
    period?: string;
    features: string[];
    cta?: HomeCta;
    highlighted?: boolean;
  }[];
}
export interface GallerySection {
  type: "gallery";
  title?: string;
  images: SectionImage[];
}
export interface CtaBandSection {
  type: "cta_band";
  headline: string;
  subhead?: string;
  cta?: HomeCta;
}

export type HomeSection =
  | HeroSection
  | StatsSection
  | HowItWorksSection
  | FeatureGridSection
  | FeatureSpotlightSection
  | SocialProofSection
  | FaqSection
  | PricingTeaserSection
  | GallerySection
  | CtaBandSection;

export interface HomeConfig {
  mode: "landing" | "conversation";
  sections?: HomeSection[];
  headline?: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  featuresTitle?: string;
  features?: HomeFeature[];
  closingHeadline?: string;
}

export const homeConfig: HomeConfig = {
  "mode": "landing",
  "headline": "Your $80K SDR problem, solved for $499/mo \u2014 first meeting booked or your money back.",
  "subhead": "An autonomous AI SDR agent that handles prospect sourcing, trigger-event-personalized cold email, multi-touch reply management, and calendar booking end-to-end for $499/mo \u2014 collapsing the full outbound workflow that previously required a\u2026",
  "sections": [
    {
      "type": "hero",
      "headline": "Your First SDR. No Salary, No Equity, No Drama.",
      "eyebrow": "AI-Powered Outbound for Professional Services",
      "subhead": "An autonomous AI agent sources trigger-event prospects from Apollo, LinkedIn, and company news \u2014 then writes, sends, and follows up on personalized cold emails until a meeting lands on your calendar. All for $499/mo flat.",
      "primaryCta": {
        "label": "Book a Demo",
        "href": "/demo"
      },
      "secondaryCta": {
        "label": "See How It Works",
        "href": "#how-it-works"
      },
      "image": {
        "url": "hero_image"
      }
    },
    {
      "type": "stats",
      "stats": [
        {
          "value": "$80K+",
          "label": "Median US SDR salary you're not paying"
        },
        {
          "value": "12M+",
          "label": "US SMBs in your target ICP (IRS data)"
        },
        {
          "value": "3-touch",
          "label": "Automated follow-up sequences per prospect"
        },
        {
          "value": "$499/mo",
          "label": "Flat rate \u2014 no per-seat, no per-email fees"
        }
      ],
      "title": "The Math Is Simple"
    },
    {
      "type": "how_it_works",
      "steps": [
        {
          "title": "1. Define Your ICP",
          "body": "Tell the agent your ideal client profile \u2014 industry, headcount, revenue range, geography. It cross-references Apollo, LinkedIn, and live company news to build a fresh prospect list every week."
        },
        {
          "title": "2. AI Writes Signal-Specific Emails",
          "body": "Every email references a real trigger event \u2014 a funding round, a new hire, a regulatory change \u2014 so it reads like research, not a mail merge. No templates, no generic pitches."
        },
        {
          "title": "3. Sequences Run on Autopilot",
          "body": "The agent sends an opening email plus two follow-up touches, spaced intelligently. Replies are classified automatically: interested, not now, or unsubscribe \u2014 no inbox babysitting required."
        },
        {
          "title": "4. Meetings Land on Your Calendar",
          "body": "When a prospect says yes, the agent sends a Calendly or Google Calendar link and confirms the meeting. You show up to a warm, context-rich intro call \u2014 nothing else."
        }
      ],
      "title": "From Zero to Booked Meeting \u2014 Automatically",
      "subhead": "Set your ICP once. The agent handles everything from prospecting to calendar invite."
    },
    {
      "type": "feature_spotlight",
      "items": [
        {
          "title": "Trigger-Event Prospecting That Actually Personalizes",
          "body": "Most cold email tools spray and pray. This agent scrapes LinkedIn activity, Apollo firmographics, and company news in real time \u2014 then crafts an opening line tied to something that happened in the prospect's world this week. Accounting firm just filed for a new EIN? IT consultancy just posted a DevOps job? Those are your hooks, written automatically.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/2b9bbfab-e9ed-4ac6-9fff-addaf03d4ca0",
            "alt": "Trigger-Event Prospecting That Actually Personalizes"
          }
        },
        {
          "title": "Reply Classification That Keeps You Out of the Weeds",
          "body": "Every reply is read and categorized: hot lead, nurture later, or hard no. Hot leads get a calendar link sent immediately. Nurture replies get flagged for a 30-day re-engage. You never have to triage a sales inbox again \u2014 the agent surfaces only the conversations that need a human decision.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/ad5d5508-b035-4cb2-9371-8691e749e967",
            "alt": "Reply Classification That Keeps You Out of the Weeds"
          }
        },
        {
          "title": "Flat $499/mo \u2014 No Headcount, No Commission, No Surprises",
          "body": "A junior SDR costs $60K\u2013$85K in salary alone before benefits, tools, and ramp time. At $499/mo you get the same outbound motion running 24/7, with no quota drama, no sick days, and no six-month ramp. Cancel anytime; prepay annually and save.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/2fd716cd-f8fe-4bfc-85e5-791544ce9a22",
            "alt": "Flat $499/mo \u2014 No Headcount, No Commission, No Surprises"
          }
        }
      ],
      "title": "Built for Founders Who Sell, Not Full-Time Salespeople"
    },
    {
      "type": "feature_grid",
      "features": [
        {
          "title": "Apollo + LinkedIn Sourcing",
          "body": "Pulls verified contact data and firmographics weekly so your prospect list never goes stale."
        },
        {
          "title": "Signal-Based Email Copy",
          "body": "Each email references a real, recent trigger event \u2014 not a generic value prop \u2014 to earn a reply."
        },
        {
          "title": "3-Touch Automated Sequences",
          "body": "Spaced follow-ups sent at optimal intervals; the agent stops the sequence the moment a reply comes in."
        },
        {
          "title": "Reply Classification Engine",
          "body": "AI reads every response and routes it: book now, re-engage later, or remove from list."
        },
        {
          "title": "Calendar Booking Integration",
          "body": "Connects to Google Calendar or Calendly so confirmed meetings appear in your calendar without a single manual step."
        },
        {
          "title": "Weekly Prospect Refresh",
          "body": "New ICP-matched leads are sourced every week, keeping pipeline volume consistent without any manual list-building."
        }
      ],
      "title": "Everything the Agent Handles End-to-End",
      "subhead": "No integrations to stitch together. No prompts to babysit. Just outbound on autopilot."
    },
    {
      "type": "social_proof",
      "quotes": [
        {
          "quote": "I was spending Sunday nights manually researching prospects and writing cold emails. Now I check my calendar Monday morning and there are two discovery calls already booked. It's genuinely eerie how good the personalization is.",
          "author": "Managing Partner",
          "role": "8-person IT consulting firm, Austin TX"
        },
        {
          "quote": "We tried hiring a part-time BDR. Between onboarding, tool costs, and the time I spent managing them, it was a disaster. $499 flat and the AI just runs \u2014 that's the deal I actually wanted.",
          "author": "Founder",
          "role": "Boutique accounting firm, 6 employees"
        },
        {
          "quote": "The emails don't read like AI. One prospect replied asking who wrote it because it referenced a specific press release from their site. That's the level of detail that gets responses.",
          "author": "Owner",
          "role": "Digital marketing agency, 4-person team"
        }
      ],
      "title": "What Founders Are Saying"
    },
    {
      "type": "faq",
      "items": [
        {
          "q": "Will the emails actually sound like me, or obviously like AI?",
          "a": "The agent writes in a direct, professional tone and leads with a specific trigger event tied to the prospect \u2014 not a generic pitch. You can review and adjust the tone profile during onboarding, and most founders find the output requires zero editing."
        },
        {
          "q": "What happens if a prospect replies and wants to negotiate or ask detailed questions?",
          "a": "The agent classifies any substantive reply as a 'hot lead' and immediately surfaces it to you with full context. It doesn't attempt to answer complex questions \u2014 it gets the human in the room at exactly the right moment."
        },
        {
          "q": "How is this different from tools like Instantly or Smartlead?",
          "a": "Those are email-sending infrastructure tools \u2014 you still have to source lists, write copy, and manage replies yourself. This agent does all of it: sourcing, writing, sequencing, reply handling, and calendar booking. It's the whole SDR role, not just the send button."
        },
        {
          "q": "Do I need to connect my own email domain?",
          "a": "Yes \u2014 you send from your own domain to protect deliverability and brand trust. Onboarding includes a guided warm-up process for new sending domains, typically taking 1\u20132 weeks before full volume begins."
        },
        {
          "q": "Is this available for law firms?",
          "a": "The legal vertical is currently in a gated early-access program pending review of state bar advertising rules in key markets. Join the waitlist and we'll notify you when your state is cleared."
        }
      ],
      "title": "Real Questions from Founders Like You"
    },
    {
      "type": "cta_band",
      "headline": "Your pipeline shouldn't depend on your calendar availability.",
      "subhead": "Book a 20-minute demo and see a live prospect list, a real AI-written email, and a booked meeting \u2014 built for a firm just like yours."
    }
  ]
};
