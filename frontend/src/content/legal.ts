import type { Block } from "./types.ts";

// ---------------------------------------------------------------------------------------------
// Fill these in before going live. Everything below reads from here.
// Have both documents reviewed by someone qualified in your jurisdiction.
// ---------------------------------------------------------------------------------------------
export const LEGAL = {
    /** The person or company that runs Formularium (the "data controller"). */
    operator: "Lampros Polyzos",
    /** Postal address of the operator. Required for EU/UK users. */
    address: "Katerou 8, 47132, Arta",
    /** Where users send privacy requests, account deletion requests and questions. */
    contactEmail: "l.polyzos.dev@gmail.com",
    /** Country whose law governs the Terms, e.g. "Greece" or "England and Wales". */
    governingLaw: "Greece",
    /** Where the app and its API are hosted, e.g. "Vercel (USA)" or "Hetzner (Germany)". */
    hosting: "Vercel (USA)",
    /** Region of your Supabase project, shown in the Supabase dashboard. */
    supabaseRegion: "us-east-1",
    /** Minimum age to create an account. 16 is the safe default across the EU. */
    minimumAge: 16,
    lastUpdated: "2026-11-08",
} as const;

export interface LegalDocument {
    slug: "privacy" | "terms";
    title: string;
    summary: string[];
    body: Block[];
}

const mail = `[${LEGAL.contactEmail}](mailto:${LEGAL.contactEmail})`;

export const PRIVACY_POLICY: LegalDocument = {
    slug: "privacy",
    title: "Privacy Policy",
    summary: [
        "We collect only what we need to run your account and the app: your email, display name and the formulas, stash and community content you create.",
        "We don't use advertising or analytics trackers, and we never sell your data.",
        "Your community posts, comments and ratings are visible to other members with your display name.",
        `You can download a copy of your data or delete your account yourself in Settings at any time, or ask us by emailing ${mail}.`,
    ],
    body: [
        { type: "h2", text: "Who we are" },
        {
            type: "p",
            text:
                `Formularium is operated by **${LEGAL.operator}**, ${LEGAL.address} ("we", "us"). We are the data controller for the personal data described here. Contact us about anything in this policy at ${mail}.`,
        },

        { type: "h2", text: "What we collect" },
        { type: "h3", text: "Account information" },
        {
            type: "ul",
            items: [
                "**Email address and password.** Your password is stored only as a secure hash by our authentication provider; we never see it.",
                '**Google sign-in.** If you choose "Continue with Google", Google shares your name, email address and profile picture link with us.',
                "**Display name** that you choose in Settings and that appears next to your community activity.",
            ],
        },
        { type: "h3", text: "Content you create" },
        {
            type: "ul",
            items: [
                "Formulas, phases, percentages, batch sizes, target pH and marketing claims you save in the Studio.",
                "Your stash (ingredients you own, amounts, prices), containers, favorites and starred ingredients.",
                "Batch records: lot numbers, the ingredients and weights of batches you make, your notes, and stability check-ins.",
                "Community posts, recipe versions, comments, ratings and reviews (including skin type, if you choose to give it) and notifications, plus reports you send about other members' content and the members you mute.",
                "Reports are visible to you and to community moderators. The person you report is not told who reported them.",
            ],
        },
        { type: "h3", text: "Technical information" },
        {
            type: "ul",
            items: [
                "When you use the app, our providers process your **IP address and basic device and browser information** to deliver the service, keep it secure and prevent abuse.",
                "When you sign in, **Cloudflare Turnstile** checks that you are not a bot using signals from your browser.",
                "When you print a PDF (batch ticket, shopping list, product information file, sourcing guide), your formula is sent to our server to build the document. It is **not stored** after the PDF is returned.",
            ],
        },
        { type: "h3", text: "Storage in your browser" },
        {
            type: "p",
            text:
                "We don't use advertising or analytics cookies. We store only what the app needs to work, in your browser's local storage:",
        },
        {
            type: "table",
            headers: ["What", "Why", "How long"],
            rows: [
                [
                    "Sign-in session",
                    "Keeps you logged in",
                    "Until you sign out",
                ],
                [
                    "Preferences (currency, date format, stash low-stock warning)",
                    "Remembers your settings",
                    "Until you clear them",
                ],
                [
                    "Editor choices (tour seen, auto-balance, stash check hidden)",
                    "Avoids asking again",
                    "Until you clear them",
                ],
                [
                    "Page to return to after sign-in",
                    "Brings you back where you were",
                    "Removed after use",
                ],
            ],
        },
        {
            type: "p",
            text:
                "These are strictly necessary for the service, so no consent banner is required for them. If we ever add optional cookies or analytics, we will ask first.",
        },

        { type: "h2", text: "How we use it, and why" },
        {
            type: "table",
            headers: ["Purpose", "Legal basis (GDPR)"],
            rows: [
                [
                    "Create and run your account, save your formulas and stash, generate PDFs",
                    "Performing our contract with you",
                ],
                [
                    "Show your community posts, comments and ratings to other members",
                    "Performing our contract with you",
                ],
                [
                    "Send notifications about activity on your posts",
                    "Performing our contract with you",
                ],
                [
                    "Keep the service secure, prevent spam and abuse (e.g. bot checks)",
                    "Our legitimate interest in a safe service",
                ],
                [
                    "Answer your messages and requests",
                    "Performing our contract / legitimate interest",
                ],
                ["Meet legal obligations", "Legal obligation"],
            ],
        },
        {
            type: "p",
            text:
                "We don't use your data for advertising, we don't sell it, and we don't make automated decisions that have legal or similarly significant effects on you. The health checks, substitutions and suggestions in the app are tools for your formulas, not decisions about you.",
        },

        { type: "h2", text: "Who can see your content" },
        {
            type: "ul",
            items: [
                "**Private by default:** your formulas, stash, containers and favorites are visible only to you.",
                "**Visible to members:** community posts, recipe versions, comments, ratings and reviews are shown to other signed-in members with your display name.",
                "**Visible to everyone:** formula posts you share may appear as a preview (title, a short excerpt and tags) on the public home page. The blog contains only articles we write; nothing members post is published there.",
            ],
        },

        { type: "h2", text: "Service providers we share data with" },
        {
            type: "p",
            text:
                "We use a small number of providers who process data on our behalf under data processing agreements:",
        },
        {
            type: "table",
            headers: ["Provider", "What for", "Data"],
            rows: [
                [
                    `Supabase (${LEGAL.supabaseRegion})`,
                    "Database, authentication and file storage",
                    "Account data and everything you create",
                ],
                [
                    LEGAL.hosting,
                    "Hosting the website and the PDF/validation server",
                    "Request data, formulas sent for PDFs and checks",
                ],
                [
                    "Cloudflare (Turnstile)",
                    "Bot protection at sign-in",
                    "IP address and browser signals",
                ],
                [
                    "Google",
                    'Optional "Continue with Google" sign-in',
                    "Your Google name, email and profile picture link",
                ],
            ],
        },
        {
            type: "p",
            text:
                "Some providers may process data outside the EU/UK. Where they do, the transfer is covered by the European Commission's Standard Contractual Clauses or an adequacy decision.",
        },
        {
            type: "p",
            text:
                "We may also disclose data if the law requires it, or to protect the rights and safety of our users or others.",
        },

        { type: "h2", text: "How long we keep it" },
        {
            type: "ul",
            items: [
                "Account data and your content: for as long as you have an account.",
                "When you delete your account in Settings (or ask us to), your data is removed from our database straight away. Copies in backups are overwritten on a rolling basis, within **30 days**.",
                "Community posts and comments are deleted with your account. Where deleting a comment would break a discussion, we may instead remove your name and keep the text anonymously.",
                "Our sign-in security log (when you sign in, reset your password or confirm your email, with the time, your IP address and browser, never your password): **90 days**, to spot and stop attacks. It is included in the copy of your data you can download.",
                "Security logs kept by our providers: for the short period they need them.",
            ],
        },

        { type: "h2", text: "Your rights" },
        {
            type: "p",
            text:
                "Depending on where you live (including under the EU and UK GDPR), you have the right to:",
        },
        {
            type: "ul",
            items: [
                "access the personal data we hold about you and get a copy;",
                "correct inaccurate data (you can change most of it yourself in the app);",
                "have your data deleted;",
                "receive your data in a portable format;",
                "object to, or ask us to restrict, certain processing;",
                "withdraw consent at any time, where we rely on consent;",
                "complain to your local data protection authority.",
            ],
        },
        {
            type: "p",
            text:
                `You can download a copy of your data and delete your account yourself: open Global Settings from your profile menu and look under "Your data". For any other right, or if you prefer, email ${mail} from the address linked to your account. We reply within one month.`,
        },

        { type: "h2", text: "Children" },
        {
            type: "p",
            text:
                `Formularium is not intended for anyone under ${LEGAL.minimumAge}. We don't knowingly collect data from children; if you believe a child has created an account, contact us and we will delete it.`,
        },

        { type: "h2", text: "Security" },
        {
            type: "p",
            text:
                "Data is encrypted in transit (HTTPS), passwords are hashed, and access to your private data is restricted by database access rules so other users can't read it. No system is perfectly secure, so please use a strong, unique password.",
        },

        { type: "h2", text: "Changes to this policy" },
        {
            type: "p",
            text:
                'We will update this page when our practices change and change the "last updated" date. If a change is significant, we will tell you in the app or by email before it takes effect.',
        },

        { type: "h2", text: "Contact" },
        {
            type: "p",
            text: `${LEGAL.operator}, ${LEGAL.address}. Email: ${mail}.`,
        },
    ],
};

export const TERMS_OF_USE: LegalDocument = {
    slug: "terms",
    title: "Terms of Use",
    summary: [
        "Formularium is a tool to help you design, calculate and document formulas. It does not replace testing, a safety assessment or professional advice.",
        "You are responsible for the safety, testing and legal compliance of anything you make, especially if you give it away or sell it.",
        "You own what you post in the community; you give us permission to show it in the app. Be respectful and don't post anything unsafe or illegal.",
    ],
    body: [
        { type: "h2", text: "About these terms" },
        {
            type: "p",
            text:
                `These terms are an agreement between you and **${LEGAL.operator}** ("we", "us") for your use of Formularium. By creating an account or using the service, you accept them. If you don't agree, please don't use Formularium. Our [Privacy Policy](/privacy) explains how we handle your data.`,
        },

        { type: "h2", text: "Who can use Formularium" },
        {
            type: "p",
            text:
                `You must be at least ${LEGAL.minimumAge} years old. You are responsible for keeping your login details safe and for activity on your account. Tell us at ${mail} if you think someone else has access to it.`,
        },

        { type: "h2", text: "What Formularium is, and what it isn't" },
        {
            type: "callout",
            tone: "warning",
            title: "Important: not a safety assessment",
            text:
                "Formularium's calculations, health checks, ingredient insights, substitution suggestions, automatic balancing, articles and printed documents (including the Product Information File) are **educational aids and starting points**. They are not a cosmetic safety assessment (CPSR), not medical or dermatological advice, and not legal or regulatory advice.",
        },
        { type: "p", text: "In particular:" },
        {
            type: "ul",
            items: [
                "**Ingredient data** (usage rates, pH ranges, temperatures, compliance flags) comes from typical supplier information and may be incomplete or differ from the product you buy. Always follow your supplier's datasheet.",
                "**A formula that passes every check can still be unsafe or unstable.** Preservation, stability and skin tolerance can only be confirmed by testing.",
                "**Sunscreen protection (SPF)** cannot be calculated; it must be tested in a laboratory.",
                "**Make products with care:** use good hygiene, protective equipment, accurate scales, and patch test before use.",
                "**Selling or giving away products** may require a safety assessment, registration, testing and specific labelling in your country. That is your responsibility.",
            ],
        },

        { type: "h2", text: "Your content" },
        {
            type: "p",
            text:
                'You keep ownership of the formulas, posts, comments, reviews and other content you create ("your content").',
        },
        {
            type: "p",
            text:
                "When you publish content to the community, you give us a non-exclusive, worldwide, royalty-free licence to host, store, display and adapt it (for example, resizing or formatting it) for as long as it is on Formularium, so other members can view it, clone recipes to their own Studio and rate them. Content that other members have already cloned into their own private Studio stays there.",
        },
        {
            type: "p",
            text:
                "You confirm that you have the right to share your content and that it doesn't infringe anyone else's rights.",
        },

        { type: "h2", text: "Community rules" },
        {
            type: "p",
            text:
                "Please keep the community helpful and safe. Don't post content that:",
        },
        {
            type: "ul",
            items: [
                "promotes recipes or practices that are clearly dangerous (for example unpreserved water-based products presented as safe, or ingredients far above safe limits);",
                "makes medical claims, such as that a recipe treats or cures a disease;",
                "is illegal, harassing, hateful, sexually explicit or misleading;",
                "copies someone else's recipe, text or images without permission;",
                "is spam, advertising or contains links to malware;",
                "includes other people's personal data.",
            ],
        },
        {
            type: "p",
            text:
                "Ratings and reviews must reflect your honest experience. Don't rate your own recipes or coordinate fake ratings.",
        },
        {
            type: "p",
            text:
                `We may remove content or suspend accounts that break these rules. If you see something that breaks them, use the Report button on the post or comment, or write to ${mail}. Moderators review reports and may remove content. You can mute a member to stop seeing their posts and comments. To keep the community usable, there are limits on how often you can post, comment and report.`,
        },

        { type: "h2", text: "Acceptable use" },
        {
            type: "p",
            text:
                "Don't misuse the service. That includes trying to access other users' data or our systems without permission, getting around security measures, overloading the service, or collecting data from it with automated tools.",
        },

        { type: "h2", text: "Our content" },
        {
            type: "p",
            text:
                "The Formularium software, design, ingredient library and editorial content (such as blog articles and the Learn hub) belong to us or our licensors. You may use them for your own formulating and share links to them; please don't copy them wholesale or republish them without permission.",
        },

        { type: "h2", text: "Availability and changes to the service" },
        {
            type: "p",
            text:
                "We work to keep Formularium available and your data safe, but we can't promise the service will always be uninterrupted or error-free. We may add, change or remove features. Keep your own copies of formulas that matter to you; the PDF exports are an easy way to do that.",
        },
        {
            type: "p",
            text:
                "If we introduce paid features, their price and terms will be shown clearly before you buy anything.",
        },

        { type: "h2", text: "Disclaimer and limitation of liability" },
        {
            type: "p",
            text:
                'The service is provided "as is". To the extent the law allows, we make no warranties about the accuracy, completeness or fitness for a particular purpose of the information and tools in Formularium.',
        },
        {
            type: "p",
            text:
                "To the extent the law allows, we are not liable for any loss or harm arising from products you make, use, give away or sell, or from your reliance on calculations, checks, suggestions or documents produced by Formularium. Nothing in these terms limits liability that cannot be limited by law, such as for death or personal injury caused by our negligence, or for fraud, and nothing affects your statutory rights as a consumer.",
        },

        { type: "h2", text: "Ending your account" },
        {
            type: "p",
            text:
                `You can stop using Formularium at any time and delete your account yourself in Settings, or ask us at ${mail}. We may suspend or close accounts that seriously or repeatedly break these terms; where reasonable, we will tell you why first.`,
        },

        { type: "h2", text: "Changes to these terms" },
        {
            type: "p",
            text:
                "We may update these terms. If a change is significant, we will tell you in the app or by email before it takes effect. If you keep using Formularium after that, the new terms apply.",
        },

        { type: "h2", text: "Governing law" },
        {
            type: "p",
            text:
                `These terms are governed by the law of ${LEGAL.governingLaw}. If you are a consumer living in the EU or UK, you also keep the protection of the mandatory laws of your country of residence and can bring claims in your local courts.`,
        },

        { type: "h2", text: "Contact" },
        {
            type: "p",
            text: `${LEGAL.operator}, ${LEGAL.address}. Email: ${mail}.`,
        },
    ],
};
