"use client";

import Link from "@/components/AppLink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { TaxingEntityOverview } from "@/components/TaxingEntityOverview";
import type { OrientationStep, ResidentOrientationProps } from "./types";
import styles from "./ResidentOrientation.module.css";

function orientationFundingLabel(id: string, label: string) {
  if (id === "rev.intergovernmental") return "Money from other governments";
  if (id === "rev.county-offices") return "Fees collected by county offices";
  return label;
}

export function ResidentOrientation({
  year,
  actualYears,
  general,
  onYearChange,
  onGuidanceChange,
  onFinish,
  onStart,
  onNodeSelect,
  startOnMount = false,
  startRequest = 0,
}: ResidentOrientationProps) {
  const [step, setStep] = useState<OrientationStep | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const reserve = general?.reserve ?? null;
  const fundingNodes = [...(general?.sources ?? []), ...(reserve ? [reserve] : [])];
  const services = useMemo(() => {
    const allServices = (general?.uses ?? []).filter((category) => category.kind === "use").flatMap((category) => category.serviceExamples?.length
    ? category.serviceExamples.map((node) => ({ category, node }))
    : [{ category, node: category }]);
    const priorityIds = ["dept.emergencymedicalservices", "dept.sheriff", "dept.engineeringandroadbureaus"];
    const priority = priorityIds.map((id) => allServices.find((service) => service.node.id === id)).filter((service): service is NonNullable<typeof service> => Boolean(service));
    return [...priority, ...allServices.filter((service) => !priority.includes(service))].slice(0, 4);
  }, [general]);
  const hasActual = actualYears.includes(year);
  const latestActualYear = Math.max(...actualYears);

  useEffect(() => {
    if (startOnMount && startRequest > 0) start();
  // This responds to a deep link after hydration, including a return to #orientation from another homepage state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOnMount, startRequest]);

  useEffect(() => {
    if (step !== null) heading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === null) {
      onGuidanceChange(null);
      return;
    }
    const nodeIds = step === 2
      ? [...(general?.sources ?? []).map((node) => node.id), ...(reserve ? [reserve.id] : [])]
      : step === 3 ? [...new Set(services.map((service) => service.category.id))] : [];
    onGuidanceChange({ step, nodeIds });
  }, [general, onGuidanceChange, reserve, services, step]);

  function start() {
    onStart();
    setHasStarted(true);
    setStep(1);
  }

  function goTo(next: OrientationStep) {
    setStep(next);
  }

  function finish() {
    setStep(null);
    onGuidanceChange(null);
    onFinish();
  }

  if (step === null) {
    return (
      <section className={styles.orientation} id="orientation" aria-labelledby="orientation-title" data-testid="resident-orientation">
        <div className={styles.choice}>
          <div>
            <p className={styles.eyebrow}>A short way in</p>
            <h2 id="orientation-title">Start with the question you brought.</h2>
            <p className={styles.copy}>Follow the path from a property-tax bill to the county&apos;s published spending plan, or explore the budget now.</p>
          </div>
          <div className={styles.choices}>
            <button type="button" onClick={start}>{hasStarted ? "Restart the guide" : "Follow a tax dollar"}</button>
            <button type="button" onClick={finish}>Explore the budget</button>
          </div>
        </div>
      </section>
    );
  }

  const stepCopy: Record<OrientationStep, { title: string; copy: ReactNode }> = {
    1: {
      title: "Your bill supports several governments and agencies.",
      copy: <>A property-tax bill may include county government, a school district, a city or town, and special districts. The boxes show possible recipients, not shares of a bill. <Link href="/property-tax/" className={styles.actualLink}>Show my property →</Link></>,
    },
    2: {
      title: "The General Fund is the county’s main account for everyday services.",
      copy: <>Property taxes join fees, money from other governments, other published revenue, and transfers in one spending plan. A planned use of fund balance is shown separately from money in. Fund balance is not a bank balance or automatically spare money.</>,
    },
    3: {
      title: "County money supports everyday services.",
      copy: <>Open a service to see what its budget covers. These examples are part of the fund&apos;s spending plan, not a receipt for one resident&apos;s payment.</>,
    },
    4: {
      title: "A budget is a plan for one fiscal year.",
      copy: <>Choose a budget year to compare spending plans. For years with audited results, you can also compare the plan with what was actually spent.</>,
    },
  };
  const content = stepCopy[step];

  return (
    <section className={styles.orientation} id="orientation" aria-labelledby="orientation-step-title" data-testid="resident-orientation">
      <div className={styles.progress} role="progressbar" aria-label="Guide progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-valuetext={`Step ${step} of 4`}>
        {[1, 2, 3, 4].map((index) => <span key={index} data-current={index <= step} />)}
      </div>
      <div className={styles.step}>
        <div>
          <p className={styles.stepLabel}>Step {step} of 4</p>
          <h2 id="orientation-step-title" ref={heading} tabIndex={-1}>{content.title}</h2>
          <div className={styles.copy}>{content.copy}</div>
          {step === 4 && <div className={styles.yearExample}>
            {!hasActual && <button type="button" onClick={() => onYearChange(latestActualYear)}>Show FY{latestActualYear}</button>}
            <Link href={`/e/fund.general/?fy=${hasActual ? year : latestActualYear}`} className={styles.actualLink}>See FY{hasActual ? year : latestActualYear} planned and audited actual →</Link>
          </div>}
          <div className={styles.actions}>
            <div className={styles.secondaryActions}>
              {step > 1 && <button type="button" onClick={() => goTo((step - 1) as OrientationStep)} className={styles.back}>Back</button>}
              {step !== 4 && <button type="button" onClick={finish} className={styles.skip}>Skip guide</button>}
            </div>
            <button type="button" onClick={() => step === 4 ? finish() : goTo((step + 1) as OrientationStep)} className={styles.next}>{step === 4 ? "Explore the budget" : "Next"}</button>
          </div>
        </div>
        <div className={styles.diagram}>
          {step === 1 && <TaxingEntityOverview />}
          {step === 2 && general && <>
            <p className={styles.diagramTitle}>FY{year} General Fund, published inputs</p>
            <div className={styles.fundDiagram} role="group" aria-label="Published General Fund inputs join one fund. Each input opens its amount, explanation, and source.">
              <div className={styles.fundInputs}>
                {fundingNodes.map((node) => <button type="button" className={styles.branch} data-kind={node.kind} key={node.id} onClick={() => onNodeSelect(node)}><span>Open {orientationFundingLabel(node.id, node.label)}</span><span className={styles.branchArrow} aria-hidden="true">→</span></button>)}
              </div>
              <span className={styles.arrow} aria-hidden="true">→</span>
              <span className={styles.fund}>General Fund<small>One fund with one spending plan</small></span>
            </div>
          </>}
          {step === 3 && general && <>
            <p className={styles.diagramTitle}>FY{year} service examples</p>
            <div className={styles.fundDiagram} role="group" aria-label="Service examples within the General Fund. Each opens that service's amount, explanation, and source.">
              <span className={styles.fund}>General Fund<small>The county&apos;s pooled plan</small></span>
              <span className={styles.arrow} aria-hidden="true">→</span>
              <div className={styles.serviceOutputs}>{services.map((service) => <button type="button" className={styles.branch} key={service.node.id} onClick={() => onNodeSelect(service.node)}><span>Open {service.node.label}</span><span className={styles.branchArrow} aria-hidden="true">→</span></button>)}</div>
            </div>
          </>}
          {step === 4 && <>
            <p className={styles.diagramTitle}>Keep the time labels straight</p>
            <div className={styles.fundDiagram} role="group" aria-label={hasActual ? `The FY${year} adopted plan can be compared with its audited actual result.` : `FY${year} is an adopted plan; an audited actual result is not yet published here.`}>
              <span className={styles.fund}>FY{year}<small>Adopted spending plan</small></span>
              <span className={styles.arrow} aria-hidden="true">→</span>
              <span className={styles.fund}>{hasActual ? `FY${year} audited actual` : "Not yet available"}<small>{hasActual ? "Plan and audited actual on the fund page" : `Actual results are not yet published here for FY${year}`}</small></span>
            </div>
          </>}
          {!general && step > 1 && <p className={styles.noModel}>A complete General Fund funding and spending breakdown is not available for this year. The explorer keeps the available budget detail below.</p>}
        </div>
      </div>
    </section>
  );
}
