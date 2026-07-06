import { CategoryNode } from "./types";

// This taxonomy mirrors the structure of the individual tax return (myTax
// equivalent), not a generic income/expense split. Codes match the ATO's own
// question/label numbering so output can be mapped straight back to the
// return. This list intentionally stays close to the ATO's own structure —
// resist the urge to "simplify" it, because simplifying is exactly how
// categories get silently assumed away.
//
// requires_agent_review = true for anything where a wrong call has real
// financial/legal consequences (CGT, rental, business income, foreign income).

export const ATO_CATEGORIES: CategoryNode[] = [
  // ---- INCOME ----
  {
    code: "Q1",
    label: "Salary or wages",
    question_type: "income",
    triage_prompt: "Did you receive salary or wages from an employer this financial year?",
    requires_agent_review: false,
    parent_group: "employment"
  },
  {
    code: "Q2",
    label: "Allowances, earnings, tips, directors fees etc.",
    question_type: "income",
    triage_prompt: "Did you receive any allowances, tips, bonuses, or director's fees?",
    requires_agent_review: false,
    parent_group: "employment"
  },
  {
    code: "Q3-4",
    label: "Employer lump sum / termination payments",
    question_type: "income",
    triage_prompt: "Did you receive a lump sum payment or employment termination payment (redundancy, unused leave, etc.)?",
    requires_agent_review: true,
    parent_group: "employment"
  },
  {
    code: "Q5-6",
    label: "Government payments and allowances",
    question_type: "income",
    triage_prompt: "Did you receive any Centrelink, JobSeeker, Youth Allowance, parenting payment, or other government payment?",
    requires_agent_review: false,
    parent_group: "government"
  },
  {
    code: "WORKCOVER",
    label: "Workers compensation payments (weekly benefits or lump sum)",
    question_type: "income",
    triage_prompt:
      "Did you receive workers compensation payments this year — either weekly income-replacement benefits or a lump sum (e.g. for permanent impairment)?",
    requires_agent_review: true,
    parent_group: "employment"
  },
  {
    code: "Q7",
    label: "Australian annuities and superannuation income streams",
    question_type: "income",
    triage_prompt: "Did you receive an income stream from superannuation or an annuity?",
    requires_agent_review: false,
    parent_group: "super"
  },
  {
    code: "Q10",
    label: "Gross interest",
    question_type: "income",
    triage_prompt: "Did you earn interest from any bank accounts, term deposits, or loans to others?",
    requires_agent_review: false,
    parent_group: "investment"
  },
  {
    code: "Q11",
    label: "Dividends",
    question_type: "income",
    triage_prompt: "Did you receive dividends from shares (Australian or foreign)?",
    requires_agent_review: false,
    parent_group: "investment"
  },
  {
    code: "Q13",
    label: "Partnership and trust distributions",
    question_type: "income",
    triage_prompt: "Did you receive a distribution from a partnership, trust, or managed investment scheme?",
    requires_agent_review: true,
    parent_group: "investment"
  },
  {
    code: "Q14-15",
    label: "Personal services income / business income or loss",
    question_type: "income",
    triage_prompt: "Did you run a business, freelance, or earn personal services income (including as a sole trader)?",
    requires_agent_review: true,
    parent_group: "business"
  },
  {
    code: "Q15-SHARING",
    label: "Sharing economy income",
    question_type: "income",
    triage_prompt: "Did you earn money through a sharing economy platform (Uber, Airbnb, Airtasker, delivery apps, etc.)?",
    requires_agent_review: false,
    parent_group: "business"
  },
  {
    code: "Q18",
    label: "Capital gains — general (shares, property, other assets)",
    question_type: "income",
    triage_prompt: "Did you sell, gift, or otherwise dispose of any shares, property, or other capital assets (not including crypto, asked separately)?",
    requires_agent_review: true,
    parent_group: "capital_gains"
  },
  {
    code: "Q18-CRYPTO",
    label: "Capital gains — crypto assets",
    question_type: "income",
    triage_prompt: "Did you sell, swap, spend, or gift any cryptocurrency or other digital assets this financial year?",
    requires_agent_review: true,
    parent_group: "capital_gains"
  },
  {
    code: "Q18-CRYPTO-BIZ",
    label: "Crypto trading as a business activity",
    question_type: "income",
    triage_prompt: "Did you trade crypto in a systematic, repetitive way with a clear profit intention (e.g. using bots, frequent short-term trades)?",
    requires_agent_review: true,
    parent_group: "capital_gains"
  },
  {
    code: "Q20",
    label: "Foreign source income",
    question_type: "income",
    triage_prompt: "Did you earn any income from outside Australia (foreign employment, foreign investments, foreign pensions)?",
    requires_agent_review: true,
    parent_group: "foreign"
  },
  {
    code: "Q21",
    label: "Rent",
    question_type: "income",
    triage_prompt: "Did you earn rental income from an investment property, a room, or a holiday home this financial year?",
    requires_agent_review: true,
    parent_group: "property"
  },
  {
    code: "Q24",
    label: "Other income (incl. ATO interest, prizes, jury duty, etc.)",
    question_type: "income",
    triage_prompt: "Did you receive any other income not yet covered — prizes, jury duty payments, ATO interest, insurance payouts?",
    requires_agent_review: false,
    parent_group: "other"
  },

  // ---- ASSET OWNERSHIP / DISPOSAL (drives which income/deduction branches fire) ----
  {
    code: "ASSET-CAR",
    label: "Motor vehicle ownership or disposal",
    question_type: "structural",
    triage_prompt: "Did you own, buy, sell, or use a motor vehicle for work purposes this year?",
    requires_agent_review: false,
    parent_group: "assets"
  },
  {
    code: "ASSET-PROPERTY",
    label: "Real property ownership or disposal",
    question_type: "structural",
    triage_prompt: "Did you own, buy, sell, or inherit any real property (investment, holiday home, land) this year?",
    requires_agent_review: true,
    parent_group: "assets"
  },
  {
    code: "ASSET-SHARES",
    label: "Shares or managed funds ownership or disposal",
    question_type: "structural",
    triage_prompt: "Did you own, buy, or sell shares, ETFs, or managed funds this year?",
    requires_agent_review: false,
    parent_group: "assets"
  },
  {
    code: "ASSET-CRYPTO",
    label: "Crypto / digital asset ownership or disposal",
    question_type: "structural",
    triage_prompt: "Did you hold, acquire, or dispose of any cryptocurrency or NFTs this year?",
    requires_agent_review: false,
    parent_group: "assets"
  },
  {
    code: "ASSET-BUSINESS",
    label: "Business assets ownership or disposal",
    question_type: "structural",
    triage_prompt: "Did you own, buy, or sell any business, business assets, or equipment used to produce income?",
    requires_agent_review: true,
    parent_group: "assets"
  },
  {
    code: "ASSET-COLLECTIBLE",
    label: "Collectables and personal use assets",
    question_type: "structural",
    triage_prompt: "Did you sell any collectables (art, jewellery, coins) or personal use assets worth over $10,000?",
    requires_agent_review: false,
    parent_group: "assets"
  },

  // ---- DEDUCTIONS ----
  {
    code: "D1",
    label: "Work-related car expenses",
    question_type: "deduction",
    triage_prompt: "Did you use your own car for work-related travel (not including home-to-work commuting)?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D2",
    label: "Work-related travel expenses",
    question_type: "deduction",
    triage_prompt: "Did you travel for work (flights, accommodation, meals while travelling for work)?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D3",
    label: "Work-related clothing, laundry and dry-cleaning expenses",
    question_type: "deduction",
    triage_prompt: "Did you buy or clean occupation-specific or protective clothing/uniforms for work?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D4",
    label: "Work-related self-education expenses",
    question_type: "deduction",
    triage_prompt: "Did you undertake study or training connected to your current job?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D5",
    label: "Other work-related expenses",
    question_type: "deduction",
    triage_prompt: "Did you buy tools, equipment, subscriptions, phone/internet for work, or a home office for work purposes?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D6",
    label: "Low value pool deduction",
    question_type: "deduction",
    triage_prompt: "Do you have a low-value pool of depreciating work assets from a prior year?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D7",
    label: "Interest deductions",
    question_type: "deduction",
    triage_prompt: "Did you pay interest on money borrowed to earn interest or dividend income?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D8",
    label: "Dividend deductions",
    question_type: "deduction",
    triage_prompt: "Did you incur expenses (advice fees, borrowing costs) to earn dividend income?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D9",
    label: "Gifts or donations",
    question_type: "deduction",
    triage_prompt: "Did you donate to a registered deductible gift recipient (charity)?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D10",
    label: "Cost of managing tax affairs",
    question_type: "deduction",
    triage_prompt: "Did you pay a tax agent, accountant, or for tax-related software/subscriptions?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D11",
    label: "Personal superannuation contributions",
    question_type: "deduction",
    triage_prompt: "Did you make a personal (after-tax) contribution to your super fund that you intend to claim as a deduction?",
    requires_agent_review: false,
    parent_group: "deductions"
  },
  {
    code: "D-RENTAL",
    label: "Rental property expenses",
    question_type: "deduction",
    triage_prompt: "Did you incur expenses on a rental property — interest, repairs, agent fees, insurance, depreciation?",
    requires_agent_review: true,
    parent_group: "property"
  },

  // ---- OFFSETS & STRUCTURAL ----
  {
    code: "T1",
    label: "Spouse details",
    question_type: "structural",
    triage_prompt: "Did you have a spouse or de facto partner at any point this financial year?",
    requires_agent_review: false,
    parent_group: "offsets"
  },
  {
    code: "PHI",
    label: "Private health insurance",
    question_type: "structural",
    triage_prompt: "Did you (and your dependants) hold private patient hospital cover this financial year?",
    requires_agent_review: false,
    parent_group: "offsets"
  },
  {
    code: "HECS",
    label: "HECS-HELP / study and training loans",
    question_type: "structural",
    triage_prompt: "Do you have an outstanding HECS-HELP, HELP, or other study/training support loan?",
    requires_agent_review: false,
    parent_group: "offsets"
  },
  {
    code: "SUPER-CO",
    label: "Super co-contribution eligibility",
    question_type: "offset",
    triage_prompt: "Was your income under the super co-contribution threshold this year, with personal (non-employer) super contributions made?",
    requires_agent_review: false,
    parent_group: "offsets"
  }
];

export function getCategoryByCode(code: string): CategoryNode | undefined {
  return ATO_CATEGORIES.find((c) => c.code === code);
}

export function groupedCategories(): Record<string, CategoryNode[]> {
  return ATO_CATEGORIES.reduce((acc, node) => {
    acc[node.parent_group] = acc[node.parent_group] || [];
    acc[node.parent_group].push(node);
    return acc;
  }, {} as Record<string, CategoryNode[]>);
}
