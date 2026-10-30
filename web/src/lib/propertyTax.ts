/**
 * A source-backed 2025 property-tax estimate.
 *
 * This deliberately calculates only published millage. It does not attempt to
 * recreate a tax bill: parcel-specific fees, penalties, exemptions, and
 * credits are outside this data source.
 */
import { z } from "zod";

import propertyTaxDataJson from "../../data/property-tax/2025.json";

const millSchema = z.number().finite().nonnegative();
const sourcePageSchema = z.number().int().positive();

const countyComponentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  mills: millSchema,
}).strict();

const districtSchema = z.object({
  code: z.string().regex(/^\d{3}$/),
  countyMills: millSchema,
  schoolName: z.enum(["Greenville", "Anderson", "Spartanburg"]),
  schoolMills: millSchema,
  fireName: z.string(),
  fireMills: millSchema,
  otherName: z.string(),
  otherMills: millSchema,
  cityName: z.string(),
  cityMills: millSchema,
  sanitationName: z.string(),
  sanitationMills: millSchema,
  arenaMills: millSchema,
  totalMills: millSchema,
  sourcePage: sourcePageSchema,
}).strict();

const REQUIRED_COUNTY_COMPONENT_IDS = [
  "county-operations",
  "county-debt",
  "library",
  "technical-college",
  "museum-operations",
  "museum-debt",
] as const;

const MILL_TOLERANCE = 0.000_001;
const MAX_TAXABLE_MARKET_VALUE = 1_000_000_000_000;

/**
 * Contract for the generated county millage dataset.  The refinements make a
 * changed export fail before it can silently misallocate a district's levy.
 */
export const propertyTaxDataSchema = z.object({
  taxYear: z.number().int().positive(),
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrl: z.url(),
  sourceTitle: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  indexUrl: z.url(),
  expectedDistricts: z.number().int().positive(),
  componentSourcePage: sourcePageSchema,
  countyComponents: z.array(countyComponentSchema).min(REQUIRED_COUNTY_COMPONENT_IDS.length),
  greenvilleSchoolOperationsMills: millSchema,
  greenvilleSchoolDebtMills: millSchema,
  homesteadMarketValueDeduction: z.number().finite().nonnegative(),
  version: z.string().min(1),
  districts: z.array(districtSchema).min(1),
}).strict().superRefine((data, ctx) => {
  if (data.districts.length !== data.expectedDistricts) {
    ctx.addIssue({ code: "custom", path: ["districts"], message: "district count must match expectedDistricts" });
  }

  const componentIds = new Set<string>();
  for (const [index, component] of data.countyComponents.entries()) {
    if (componentIds.has(component.id)) {
      ctx.addIssue({ code: "custom", path: ["countyComponents", index, "id"], message: "county component IDs must be unique" });
    }
    componentIds.add(component.id);
  }
  for (const id of REQUIRED_COUNTY_COMPONENT_IDS) {
    if (!componentIds.has(id)) {
      ctx.addIssue({ code: "custom", path: ["countyComponents"], message: `missing required county component: ${id}` });
    }
  }

  const componentMills = data.countyComponents.reduce((sum, component) => sum + component.mills, 0);
  const codes = new Set<string>();
  for (const [index, district] of data.districts.entries()) {
    if (codes.has(district.code)) {
      ctx.addIssue({ code: "custom", path: ["districts", index, "code"], message: "district codes must be unique" });
    }
    codes.add(district.code);

    if (Math.abs(district.countyMills - componentMills) > MILL_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["districts", index, "countyMills"],
        message: "countyMills must equal the sum of countyComponents",
      });
    }

    const rowMills = district.countyMills
      + district.schoolMills
      + district.fireMills
      + district.otherMills
      + district.cityMills
      + district.sanitationMills
      + district.arenaMills;
    if (Math.abs(district.totalMills - rowMills) > MILL_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        path: ["districts", index, "totalMills"],
        message: "totalMills must equal its published component mills",
      });
    }

    if (district.schoolName === "Greenville") {
      const greenvilleSchoolMills = data.greenvilleSchoolOperationsMills + data.greenvilleSchoolDebtMills;
      if (Math.abs(district.schoolMills - greenvilleSchoolMills) > MILL_TOLERANCE) {
        ctx.addIssue({
          code: "custom",
          path: ["districts", index, "schoolMills"],
          message: "Greenville school mills must equal its published operations and debt components",
        });
      }
    }
  }
});

export type PropertyTaxData = z.infer<typeof propertyTaxDataSchema>;
export const taxData: PropertyTaxData = propertyTaxDataSchema.parse(propertyTaxDataJson);

export type PropertyTaxInput = {
  districtCode: string;
  taxableMarketValue: number;
  assessmentRatio: 4 | 6;
  homestead: boolean;
};

export type TaxAllocation = {
  id: string;
  label: string;
  group: "county" | "other";
  mills: number;
  amount: number;
  description: string;
  sourcePage: number;
};

export type CalculatedPropertyTax = {
  kind: "calculated";
  taxYear: number;
  /** Market value remaining after the explicit Homestead deduction. */
  taxableValueAfterHomestead: number;
  /** Assessment used for this estimate's payable allocation lines. */
  assessedValue: number;
  /** School-operations relief already applied by omitting that 4% line. */
  schoolRelief: number;
  lines: TaxAllocation[];
  total: number;
  countyTotal: number;
  otherTotal: number;
};

export type UnsupportedPropertyTax = { kind: "unsupported"; reason: string };
export type PropertyTaxResult = CalculatedPropertyTax | UnsupportedPropertyTax;

const COUNTY_COMPONENT_IDS = new Set<string>(["county-operations", "county-debt"]);
const COUNTY_COMPONENT_DESCRIPTIONS: Record<string, string> = {
  "county-operations": "A Greenville County government levy for county services.",
  "county-debt": "A Greenville County government levy for county debt.",
  library: "A separate levy for the Greenville County Library System.",
  "technical-college": "A separate levy for Greenville Technical College.",
  "museum-operations": "A separate levy for art museum operations.",
  "museum-debt": "A separate levy for art museum debt.",
};

function roundedDollars(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unsupported(reason: string): UnsupportedPropertyTax {
  return { kind: "unsupported", reason };
}

function allocation(
  id: string,
  label: string,
  group: TaxAllocation["group"],
  mills: number,
  assessedValue: number,
  description: string,
  sourcePage: number,
): TaxAllocation {
  return { id, label, group, mills, amount: roundedDollars((assessedValue * mills) / 1_000), description, sourcePage };
}

function addPublishedDistrictLine(
  lines: TaxAllocation[],
  id: string,
  label: string,
  mills: number,
  assessedValue: number,
  description: string,
  sourcePage: number,
): void {
  if (mills === 0) return;
  lines.push(allocation(id, label, "other", mills, assessedValue, description, sourcePage));
}

/**
 * Calculate a net ad-valorem allocation from the published 2025 millage only.
 * The caller must deliberately select every input; this function supplies no
 * defaults from a parcel lookup or a presumed residence classification.
 */
export function calculatePropertyTax(input: PropertyTaxInput): PropertyTaxResult {
  if (!input || typeof input.districtCode !== "string" || !input.districtCode.trim()) {
    return unsupported("Choose a published tax district before calculating.");
  }
  if (!Number.isFinite(input.taxableMarketValue) || input.taxableMarketValue < 0 || input.taxableMarketValue > MAX_TAXABLE_MARKET_VALUE) {
    return unsupported("Enter a taxable market value from $0 to $1 trillion.");
  }
  if (input.assessmentRatio !== 4 && input.assessmentRatio !== 6) {
    return unsupported("Choose either the 4% or 6% assessment ratio.");
  }
  if (typeof input.homestead !== "boolean") {
    return unsupported("Choose whether the property qualifies for Homestead exemption.");
  }
  if (input.assessmentRatio === 6 && input.homestead) {
    return unsupported("Homestead exemption can only be estimated with the 4% legal-residence ratio.");
  }

  const district = taxData.districts.find((entry) => entry.code === input.districtCode.trim());
  if (!district) return unsupported("That tax district is not in the verified 2025 millage data.");

  if (input.assessmentRatio === 4 && district.schoolName !== "Greenville") {
    return unsupported(
      "A 4% estimate is not available for this district because the current source does not separate its school operating and debt mills.",
    );
  }

  const taxableValueAfterHomestead = input.homestead
    ? Math.max(0, input.taxableMarketValue - taxData.homesteadMarketValueDeduction)
    : input.taxableMarketValue;
  const assessedValue = (taxableValueAfterHomestead * input.assessmentRatio) / 100;
  const lines: TaxAllocation[] = [];

  for (const component of taxData.countyComponents) {
    lines.push(allocation(
      component.id,
      component.label,
      COUNTY_COMPONENT_IDS.has(component.id) ? "county" : "other",
      component.mills,
      assessedValue,
      COUNTY_COMPONENT_DESCRIPTIONS[component.id],
      taxData.componentSourcePage,
    ));
  }

  if (input.assessmentRatio === 6) {
    addPublishedDistrictLine(
      lines,
      "school",
      `${district.schoolName} schools`,
      district.schoolMills,
      assessedValue,
      "The published school levy for this district.",
      district.sourcePage,
    );
  } else {
    addPublishedDistrictLine(
      lines,
      "greenville-school-debt",
      "Greenville County Schools debt",
      taxData.greenvilleSchoolDebtMills,
      assessedValue,
      "The published Greenville County Schools debt levy. School operating mills are already relieved for a 4% legal residence and are not included in this payable estimate.",
      taxData.componentSourcePage,
    );
  }

  addPublishedDistrictLine(lines, "fire", district.fireName ? `${district.fireName} fire district` : "Fire district", district.fireMills, assessedValue, "The published fire-district levy for this tax district.", district.sourcePage);
  addPublishedDistrictLine(lines, "other", district.otherName || "Other special district", district.otherMills, assessedValue, "The published other special-district levy for this tax district.", district.sourcePage);
  addPublishedDistrictLine(lines, "city", district.cityName ? `City of ${district.cityName}` : "City or town", district.cityMills, assessedValue, "The published city or town levy for this tax district.", district.sourcePage);
  addPublishedDistrictLine(lines, "sanitation", district.sanitationName ? `${district.sanitationName} sanitation` : "Sanitation district", district.sanitationMills, assessedValue, "The published sanitation-district levy for this tax district.", district.sourcePage);
  addPublishedDistrictLine(lines, "arena", "Arena district", district.arenaMills, assessedValue, "The published arena-district levy for this tax district.", district.sourcePage);

  const total = roundedDollars(lines.reduce((sum, line) => sum + line.amount, 0));
  const countyTotal = roundedDollars(lines.filter((line) => line.group === "county").reduce((sum, line) => sum + line.amount, 0));
  const otherTotal = roundedDollars(total - countyTotal);
  const preHomesteadAssessment = (input.taxableMarketValue * input.assessmentRatio) / 100;
  const schoolRelief = input.assessmentRatio === 4
    ? roundedDollars((preHomesteadAssessment * taxData.greenvilleSchoolOperationsMills) / 1_000)
    : 0;

  return {
    kind: "calculated",
    taxYear: taxData.taxYear,
    taxableValueAfterHomestead,
    assessedValue,
    schoolRelief,
    lines,
    total,
    countyTotal,
    otherTotal,
  };
}
