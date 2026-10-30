/**
 * Source-cited resident context that supplements, but never replaces, the generated budget data.
 *
 * These records deliberately stay small and year-scoped. They describe source pages the current
 * export does not model; they do not create new entities, amounts, or historical series.
 */
export type ServiceContextRecord = {
  entityId: string;
  fiscalYear: number;
  /** A resident-facing label. The formal county label stays in generated data. */
  shortLabel?: string;
  /** A concise, source-grounded explanation shown only on a matching search result year. */
  searchSummary?: string;
  title: string;
  summary: string;
  /** Present only when a source explains a change, or explicitly does not. */
  changeNote?: string;
  source: {
    label: string;
    href: string;
  };
  additionalSource?: {
    label: string;
    href: string;
  };
  guide?: {
    label: string;
    href: string;
  };
};

const FY2026_BUDGET_URL = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf";

const CONTEXT: readonly ServiceContextRecord[] = [
  {
    entityId: "dept.sheriff",
    fiscalYear: 2026,
    shortLabel: "Law enforcement services",
    searchSummary: "FY2026 law-enforcement services, from emergency calls through investigations and court security.",
    title: "What the FY2026 Sheriff budget covers",
    summary: "The FY2026 budget describes direct law-enforcement services: emergency-call dispatch and response, court security, prisoner transport, criminal and civil process, environmental enforcement, investigations, and E911 coordination. It lists personnel, operating, contractual, and capital cost types. This description applies to FY2026 only; it does not establish the same scope for earlier years.",
    source: {
      label: "FY2026 county budget, printed p.123",
      href: `${FY2026_BUDGET_URL}#page=124`,
    },
  },
  {
    entityId: "dept.outsideagencies",
    fiscalYear: 2026,
    shortLabel: "Community organizations and transit",
    searchSummary: "FY2026 support for listed outside agencies, including GreenLink; it is not a transit-only amount.",
    title: "Public transit and GreenLink",
    summary: "The FY2026 county budget identifies GreenLink as the Greenville Transit Authority and lists it within Outside Agencies. Recipient-level amounts are not yet extracted into this explorer, so the amount on the Outside Agencies page is support for all listed recipients, not transit alone.",
    source: {
      label: "FY2026 county budget: GTA allocation, printed p.130",
      href: `${FY2026_BUDGET_URL}#page=131`,
    },
    additionalSource: {
      label: "GreenLink identity, printed p.192",
      href: `${FY2026_BUDGET_URL}#page=193`,
    },
  },
  {
    entityId: "opcat.department-of-administration",
    fiscalYear: 2026,
    shortLabel: "EMS and county support",
    searchSummary: "An FY2026 category that includes EMS alongside emergency management, GIS, information systems, and human resources.",
    title: "What the FY2026 Administration category covers",
    summary: "The FY2026 Department of Administration category combines Emergency Medical Services, Emergency Management, GIS, Information Systems, and Human Resources. The county's division table lists $32,783,093 for EMS within the category's $44,035,256 FY2026 budget. The official category name therefore includes ambulance services as well as county support functions.",
    source: {
      label: "FY2026 county budget, printed p.65",
      href: `${FY2026_BUDGET_URL}#page=66`,
    },
  },
  {
    entityId: "dept.emergencymedicalservices",
    fiscalYear: 2026,
    shortLabel: "Ambulance services",
    searchSummary: "FY2026 emergency treatment, ambulance transport, dispatch, and specialist rescue services.",
    title: "What the FY2026 EMS budget covers",
    summary: "The FY2026 EMS budget covers emergency treatment and ambulance transport to hospital emergency rooms, emergency communications and dispatch, and specialist rescue services such as vehicle extrication and hazardous-materials response. This description applies to FY2026 only.",
    changeNote: "The FY2026 budget says the increase in full-time positions comes from five added paramedic positions. It does not give a separate causal explanation for the full dollar change shown in this explorer.",
    source: {
      label: "FY2026 county budget, printed p.71",
      href: `${FY2026_BUDGET_URL}#page=72`,
    },
  },
  {
    entityId: "dept.humanresources",
    fiscalYear: 2026,
    shortLabel: "County workforce support",
    searchSummary: "FY2026 recruiting, training, benefits, safety, and other county workforce services.",
    title: "What the FY2026 Human Resources budget covers",
    summary: "The FY2026 Human Resources budget supports recruiting and onboarding, employee records, training, employee relations, compensation and benefits administration, workplace safety, and related workforce services. This description applies to FY2026 only.",
    source: {
      label: "FY2026 county budget, printed p.66",
      href: `${FY2026_BUDGET_URL}#page=67`,
    },
  },
  {
    entityId: "dept.informationsytems",
    fiscalYear: 2026,
    shortLabel: "County technology services",
    searchSummary: "FY2026 county information resources, network and workstation access, and technical solutions.",
    title: "What the FY2026 Information Systems budget covers",
    summary: "The FY2026 Information Systems budget supports county information resources, network and workstation access, and technical solutions for county departments and public-facing needs. This description applies to FY2026 only.",
    source: {
      label: "FY2026 county budget, printed p.68",
      href: `${FY2026_BUDGET_URL}#page=69`,
    },
  },
  {
    entityId: "dept.emergencymanagement",
    fiscalYear: 2026,
    shortLabel: "Disaster preparedness and response",
    searchSummary: "FY2026 planning, coordination, and Emergency Operations Center support for major emergencies and disasters.",
    title: "What the FY2026 Emergency Management budget covers",
    summary: "The FY2026 Emergency Management budget supports planning and coordinating the county's preparation for, response to, and recovery from large-scale emergencies and disasters, including Emergency Operations Center coordination. This description applies to FY2026 only.",
    source: {
      label: "FY2026 county budget, printed p.70",
      href: `${FY2026_BUDGET_URL}#page=71`,
    },
  },
  {
    entityId: "dept.animalcareservices",
    fiscalYear: 2026,
    shortLabel: "Animal shelter and care",
    searchSummary: "FY2026 open-admission shelter, animal care, adoption, rescue, and spay/neuter services.",
    title: "What the FY2026 Animal Care Services budget covers",
    summary: "The FY2026 Animal Care Services budget supports the county's open-admission shelter, including impoundment and quarantine of dogs and cats, humane care, reclamation assistance, adoption, animal rescue, and spay/neuter services. This description applies to FY2026 only.",
    source: {
      label: "FY2026 county budget, printed p.82",
      href: `${FY2026_BUDGET_URL}#page=83`,
    },
  },
  {
    entityId: "dept.propertymanagement",
    fiscalYear: 2026,
    shortLabel: "County buildings and facilities",
    searchSummary: "FY2026 operation and maintenance of county facilities for their tenants and public agencies.",
    title: "What the FY2026 Property Management budget covers",
    summary: "The FY2026 Property Management budget supports operating and maintaining county facilities so they can provide services, safety, and comfort to their tenants and public agencies. This description applies to FY2026 only.",
    source: {
      label: "FY2026 county budget, printed p.87",
      href: `${FY2026_BUDGET_URL}#page=88`,
    },
  },
  {
    entityId: "dept.engineeringandroadbureaus",
    fiscalYear: 2026,
    shortLabel: "County road maintenance",
    searchSummary: "FY2026 General Fund road, bridge, and sign maintenance and related engineering work.",
    title: "What the FY2026 Engineering and Road Bureaus budget covers",
    summary: "The FY2026 Engineering and Road Bureaus division within Public Works covers road, bridge, and sign maintenance; capital improvements; pavement management; and subdivision-construction activity. The budget identifies Engineering and three road bureaus as its sections. It is a General Fund division budget for those services, rather than the Road Program special-revenue fund.",
    source: {
      label: "FY2026 county budget, printed p.84",
      href: `${FY2026_BUDGET_URL}#page=85`,
    },
    additionalSource: {
      label: "County Engineering & Maintenance responsibilities",
      href: "https://www.greenvillecounty.org/PublicWorks/eng.aspx",
    },
    guide: {
      label: "How the separate road budgets relate",
      href: "/services/roads/",
    },
  },
  {
    entityId: "fund.sr.road-program",
    fiscalYear: 2026,
    shortLabel: "Paving, sidewalks and road projects",
    searchSummary: "The FY2026 Special Revenue Road Program for paving, sidewalks, bridge replacement, improvements, and traffic calming.",
    title: "What the FY2026 Road Program budget covers",
    summary: "The Road Program is a named Special Revenue fund. The FY2026 budget describes $33.1 million for road paving, sidewalks, bridge replacement, road improvements, and traffic calming. It also includes transfers for road-maintenance bond debt service and public-works equipment replacement.",
    changeNote: "The program description identifies funding and uses but does not explain the full year-over-year increase shown in this explorer. A larger budget amount alone does not show how many additional miles or projects will result.",
    source: {
      label: "FY2026 county budget, printed p.150",
      href: `${FY2026_BUDGET_URL}#page=151`,
    },
    guide: {
      label: "How the separate road budgets relate",
      href: "/services/roads/",
    },
  },
  {
    entityId: "fund.sr.road-paving",
    fiscalYear: 2015,
    shortLabel: "Historical Road Paving fund",
    searchSummary: "A historical Special Revenue Road Paving fund; FY2015 is its latest published year here.",
    title: "What the FY2015 Road Paving amount means",
    summary: "Road Paving is a historical named Special Revenue fund in this explorer; FY2015 is its latest published year here. The reviewed county sources do not verify that it was renamed, replaced, or otherwise reconciles to the current Road Program. It must not be added to FY2026 road figures.",
    source: {
      label: "FY2016–17 county budget, printed p.37",
      href: "https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf#page=37",
    },
    guide: {
      label: "How the separate road budgets relate",
      href: "/services/roads/",
    },
  },
  {
    entityId: "fund.sr.parks-recreation-tourism",
    fiscalYear: 2026,
    shortLabel: "Parks, trails, and recreation",
    searchSummary: "FY2026 support for county parks, trails, recreation facilities, and programs; the whole fund includes spending and transfers.",
    title: "How the FY2026 parks figures fit together",
    summary: "The FY2026 Parks, Recreation, and Tourism Special Revenue fund totals $22,510,172: $17,475,148 in expenditures and $5,035,024 in transfers out. The county lists personnel, operating, contractual, and capital costs; its transfers include $4,550,000 for capital projects, $460,024 for recreation revenue-bond debt, and $25,000 for matching grants.",
    source: {
      label: "FY2026 county budget, printed p.145",
      href: `${FY2026_BUDGET_URL}#page=146`,
    },
    additionalSource: {
      label: "Parks fund transfers, printed p.47",
      href: `${FY2026_BUDGET_URL}#page=48`,
    },
    guide: {
      label: "How the parks figures fit together",
      href: "/services/parks/",
    },
  },
  {
    entityId: "use.sr.parks-recreation-tourism",
    fiscalYear: 2026,
    shortLabel: "Parks services and equipment",
    searchSummary: "Staff, daily operations, contracted work, and equipment. Already included in the whole parks fund.",
    title: "How the FY2026 parks spending line fits",
    summary: "This is the FY2026 expenditure line within the Parks, Recreation, and Tourism Special Revenue fund. The county lists $17,475,148 in expenditures, distinct from the fund's $5,035,024 in transfers out.",
    source: {
      label: "FY2026 county budget, printed p.145",
      href: `${FY2026_BUDGET_URL}#page=146`,
    },
    guide: {
      label: "How the parks figures fit together",
      href: "/services/parks/",
    },
  },
  {
    entityId: "use.debt.parks-recreation-tourism",
    fiscalYear: 2026,
    shortLabel: "Parks category in the debt summary",
    searchSummary: "A parks category in the FY2026 debt-service summary; its printed dash does not establish that parks has no debt elsewhere.",
    title: "What the FY2026 parks debt-summary line means",
    summary: "The FY2026 Debt Service summary prints a dash for Parks, Recreation, and Tourism. That summary category does not establish that the county has no parks-related debt elsewhere; the Special Revenue fund separately transfers $460,024 for recreation revenue-bond debt.",
    source: {
      label: "FY2026 county budget, printed p.48",
      href: `${FY2026_BUDGET_URL}#page=49`,
    },
    additionalSource: {
      label: "Parks fund transfers, printed p.47",
      href: `${FY2026_BUDGET_URL}#page=48`,
    },
    guide: {
      label: "How the parks figures fit together",
      href: "/services/parks/",
    },
  },
];

export function getServiceContext(entityId: string, fiscalYear: number): ServiceContextRecord | undefined {
  return CONTEXT.find((context) => context.entityId === entityId && context.fiscalYear === fiscalYear);
}

export type SearchGuide = {
  title: string;
  summary: string;
  href: string;
  actionLabel: string;
  source: ServiceContextRecord["source"];
  additionalSource?: ServiceContextRecord["additionalSource"];
};

const TRANSIT_QUERIES = new Set(["transit", "public transit", "greenlink", "gta", "bus"]);
const ROAD_QUERIES = new Set(["road", "roads", "paving", "road paving", "road program", "road maintenance"]);
const PARKS_QUERIES = new Set(["parks", "recreation", "trails", "parks and recreation"]);

function normaliseQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** A labeled guide is safer than attaching transit aliases to the all-recipients total. */
export function getSearchGuide(query: string): SearchGuide | undefined {
  const normalised = normaliseQuery(query);
  if (TRANSIT_QUERIES.has(normalised)) {
    const context = getServiceContext("dept.outsideagencies", 2026);
    if (!context) return undefined;
    return {
      title: context.title,
      summary: context.summary,
      href: "/e/dept.outsideagencies/",
      actionLabel: "Open Outside Agencies",
      source: context.source,
      additionalSource: context.additionalSource,
    };
  }
  if (ROAD_QUERIES.has(normalised)) {
    const context = getServiceContext("fund.sr.road-program", 2026);
    if (!context) return undefined;
    return {
      title: "How the separate road budgets relate",
      summary: "Road search results identify separate General Fund and Special Revenue budgets. The FY2026 sources describe their roles but do not provide a reconciliation that would support adding them together. Road Paving is historical here; its latest published year is FY2015.",
      href: "/services/roads/",
      actionLabel: "Open the roads explainer",
      source: context.source,
    };
  }
  if (PARKS_QUERIES.has(normalised)) {
    const context = getServiceContext("fund.sr.parks-recreation-tourism", 2026);
    if (!context) return undefined;
    return {
      title: "How the parks figures fit together",
      summary: "The FY2026 $22,510,172 fund already includes $17,475,148 in expenditures; the remaining $5,035,024 is transfers for capital projects, recreation revenue-bond debt, and matching grants.",
      href: "/services/parks/",
      actionLabel: "Open the parks explainer",
      source: context.source,
      additionalSource: context.additionalSource,
    };
  }
  return undefined;
}
