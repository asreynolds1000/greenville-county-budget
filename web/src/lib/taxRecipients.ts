import type { TaxAllocation } from "./propertyTax";

export type TaxRecipientInfo = {
  summary: string;
  levyNote?: string;
  sources: { label: string; url: string }[];
};

export const OTHER_GOVERNMENT_SOURCES = {
  schoolsBudget: { label: "School operating budget and funding", url: "https://www.greenville.k12.sc.us/news/main.asp?titleid=2506budget" },
  schoolsDebt: { label: "Greenville County Schools: debt and capital projects", url: "https://www.greenville.k12.sc.us/Departments/main.asp?titleid=fin_account" },
  cityBudget: { label: "City of Greenville: operating budgets", url: "https://www.greenvillesc.gov/2463/Annual-Operating-Budget" },
  sanitation: { label: "Greater Greenville Sanitation: residential services", url: "https://ggsc.gov/residential/" },
};

// Service descriptions checked against official sources on 2026-09-07.
// These explain the recipient's purpose; the separate millage citation supports
// the rate. They do not assign a resident's dollars to individual projects.
const RECIPIENTS: Record<string, TaxRecipientInfo> = {
  "county-operations": {
    summary: "Supports county services such as law enforcement, ambulance response, courts, and road maintenance.",
    levyNote: "Property taxes help fund these services alongside fees, state aid, and other county revenue.",
    sources: [{ label: "County budget: services and funding", url: "https://www.greenvillecounty.org/ManagementandBudget/Budget26.aspx" }],
  },
  "county-debt": {
    summary: "Helps repay Greenville County's borrowing, including interest. Borrowing lets the county pay for long-lived public facilities and improvements over time.",
    sources: [{ label: "County budget: debt payments", url: "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf#page=180" }],
  },
  library: {
    summary: "Supports the Greenville County Library System: branch libraries, books and digital materials, public computers, programs, and the bookmobile.",
    sources: [
      { label: "Library locations and services", url: "https://www.greenvillelibrary.org/about-us" },
      { label: "What a library card provides", url: "https://www.greenvillelibrary.org/get-a-card" },
    ],
  },
  "technical-college": {
    summary: "Supports Greenville Technical College, which provides career training, degree programs, courses that transfer to four-year colleges, and workforce education.",
    sources: [{ label: "Greenville Tech: educational opportunities", url: "https://catalog.gvltec.edu/student-handbook/educational-opportunities/" }],
  },
  "museum-operations": {
    summary: "Helps keep the Greenville County Museum of Art open and operating. The museum presents American art and offers public exhibitions and educational programs.",
    sources: [{ label: "County Museum Commission: purpose", url: "https://www.greenvillecounty.org/apps/countycouncilboard/BoardDetails.aspx?id=69" }],
  },
  "museum-debt": {
    summary: "Helps repay borrowing for museum building improvements. The county's museum bond project included heating and cooling systems, roof repairs, and work on the building's exterior.",
    sources: [{ label: "Museum building improvements: bond ordinance", url: "https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202019/County%20Council/2019.05.21/Museum%20GO%20Bond%20Ordinance.pdf" }],
  },
  "greenville-school-debt": {
    summary: "Helps repay school borrowing for projects such as school sites, construction, renovations, and major equipment.",
    levyNote: "School operating taxes are already removed in this 4% legal-residence estimate. The school debt levy still applies.",
    sources: [OTHER_GOVERNMENT_SOURCES.schoolsDebt],
  },
  arena: {
    summary: "Supports the Greenville Arena District, the public district that operates, maintains, and equips Bon Secours Wellness Arena.",
    sources: [{ label: "Greenville Arena District: purpose", url: "https://www.greenvillecounty.org/apps/countycouncilboard/BoardDetails.aspx?id=57" }],
  },
};

/** District-dependent lines must match their actual recipient, not just their category. */
export function getTaxRecipientInfo(line: TaxAllocation): TaxRecipientInfo {
  if (RECIPIENTS[line.id]) return RECIPIENTS[line.id];
  if (line.id === "fire" && /^Taylors\b/i.test(line.label)) {
    return {
      summary: "Supports Taylors Fire Rescue's 24-hour fire protection and first-response help during medical emergencies in its service area.",
      levyNote: "This is the fire levy. Sewer service transferred to MetroConnects in July 2022.",
      sources: [{ label: "Taylors Fire Rescue: services and district history", url: "https://taylorsfirerescue.org/wp/" }],
    };
  }
  if (line.id === "school" && /^Greenville\b/i.test(line.label)) {
    return {
      summary: "Supports Greenville County Schools' regular operations, including teachers and classroom services, plus repayment of school borrowing. This combined school line applies in the 6% estimate.",
      sources: [
        OTHER_GOVERNMENT_SOURCES.schoolsBudget,
        OTHER_GOVERNMENT_SOURCES.schoolsDebt,
      ],
    };
  }
  if (line.id === "sanitation" && /^GGSD\b/i.test(line.label)) {
    return {
      summary: "Supports Greater Greenville Sanitation's household garbage and yard-waste collection within its service district.",
      sources: [OTHER_GOVERNMENT_SOURCES.sanitation],
    };
  }
  if (line.id === "fire") {
    return {
      summary: "Pays for fire protection in the fire-service district listed on this tax record. Fire districts serve defined areas and have their own funding.",
      sources: [{ label: "Greenville County Special Purpose Districts: fire services", url: "https://www.gcspd.net/" }],
    };
  }
  if (line.id === "city") {
    if (line.label === "City of Greenville") {
      return {
        summary: "Supports the City of Greenville's municipal services, including police, fire protection, parks, and upkeep of city infrastructure.",
        levyNote: "This levy goes to city government. The county-government levies are shown separately.",
        sources: [
          { label: "City of Greenville: departments and services", url: "https://www.greenvillesc.gov/departments" },
          OTHER_GOVERNMENT_SOURCES.cityBudget,
        ],
      };
    }
    return {
      summary: "Funds the city or town's own budget for properties inside its municipal taxing boundary. This is a separate levy from county government.",
      sources: [],
    };
  }
  if (line.id === "school") {
    return {
      summary: "Supports public education in the school district identified on this tax record. The rate sheet publishes this as one combined school levy.",
      sources: [],
    };
  }
  return { summary: line.description, sources: [] };
}
