/**
 * The six "start with a service you use" entry points shown on the homepage and on the
 * search page's empty state. Kept in one place so the two surfaces cannot drift apart.
 *
 * Each points straight at its answer rather than at a search result: a department page for
 * Sheriff, jail, and EMS, a guide page for roads and parks. Public transit stays on a search
 * query because its guide card lives among search results and there is no dedicated
 * transit page.
 */
export type ResidentEntryPoint = {
  label: string;
  href: string;
};

export function getResidentEntryPoints(latestYear: number): ResidentEntryPoint[] {
  return [
    { label: "Sheriff and deputies", href: `/e/dept.sheriff/?fy=${latestYear}` },
    { label: "Jail and detention", href: `/e/dept.detentioncenter/?fy=${latestYear}` },
    { label: "Roads and paving", href: "/services/roads/" },
    { label: "Parks and recreation", href: "/services/parks/" },
    { label: "Emergency medical services", href: `/e/dept.emergencymedicalservices/?fy=${latestYear}` },
    { label: "Public transit", href: "/search/?q=transit" },
  ];
}
