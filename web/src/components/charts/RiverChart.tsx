"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { RiverModel, RiverNode } from "@/lib/river";
import { formatAmount } from "@/lib/format";
import { isPrintedDash } from "@/components/PrintedFormNote";

import styles from "./RiverChart.module.css";

const VIEW_WIDTH = 1040;
const SIDE_WIDTH = 212;
const CENTER_X = 438;
const CENTER_WIDTH = 164;
const NODE_TOP = 108;
const NODE_MIN_HEIGHT = 70;
const NODE_GAP = 10;
// The flow band is constant. Node hit areas can grow around it, but never change
// a ribbon's visual proportion.
const FLOW_HEIGHT = 360;

type Slot = {
  node: RiverNode;
  y: number;
  height: number;
  bandHeight: number;
};

type Band = {
  node: RiverNode;
  center: number;
  thickness: number;
};

function share(value: number, authority: number): number {
  if (!Number.isFinite(authority) || authority <= 0) return 0;
  return Math.abs(value) / authority;
}

function rowLayout(nodes: RiverNode[], authority: number) {
  const bandHeights = nodes.map((node) => share(node.value, authority) * FLOW_HEIGHT);
  const rowHeights = bandHeights.map((height) => Math.max(NODE_MIN_HEIGHT, height));
  const rowsHeight = rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, nodes.length - 1) * NODE_GAP;
  const height = Math.max(FLOW_HEIGHT, rowsHeight);
  let y = NODE_TOP + (height - rowsHeight) / 2;
  const slots = nodes.map((node, index) => {
    const slot = { node, y, height: rowHeights[index], bandHeight: bandHeights[index] };
    y += rowHeights[index] + NODE_GAP;
    return slot;
  });
  return { height, slots };
}

function centerBands(nodes: RiverNode[], authority: number, flowTop: number): Band[] {
  let cursor = flowTop;
  return nodes.map((node) => {
    const thickness = share(node.value, authority) * FLOW_HEIGHT;
    const band = { node, center: cursor + thickness / 2, thickness };
    cursor += thickness;
    return band;
  });
}

function wrapLabel(label: string, maxCharacters = 23, maxLines = 3): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (lines.length === maxLines - 1) {
      lines.push(`${word.slice(0, maxCharacters - 1)}${word.length >= maxCharacters ? "…" : ""}`);
      return lines;
    }
    line = word.length > maxCharacters ? `${word.slice(0, maxCharacters - 1)}…` : word;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [label];
}

function mobilePrintableAmount(node: RiverNode) {
  return (
    <>
      {formatAmount(node.value)}
      {isPrintedDash(node.printedForm) ? <sup>†</sup> : null}
    </>
  );
}

function onNodeKeyDown(event: KeyboardEvent<SVGGElement>, node: RiverNode, onSelect: (node: RiverNode) => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelect(node);
}

function Ribbon({
  node,
  path,
  reserve = false,
  reserveFill,
  active,
  onSelect,
  onHover,
}: {
  node: RiverNode;
  path: string;
  reserve?: boolean;
  reserveFill?: string;
  active: boolean;
  onSelect: (node: RiverNode) => void;
  onHover: (id: string | null) => void;
}) {
  if (node.value === 0) return null;
  return (
    <path
      aria-hidden="true"
      className={`${reserve ? styles.reserveRibbon : styles.ribbon} ${active ? styles.activeRibbon : ""}`}
      d={path}
      fill={reserve ? reserveFill : node.color}
      onClick={() => onSelect(node)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    />
  );
}

function SvgNode({
  slot,
  side,
  selected,
  onSelect,
  onHover,
  reserveFill,
}: {
  slot: Slot;
  side: "left" | "right";
  selected: boolean;
  onSelect: (node: RiverNode) => void;
  onHover: (id: string | null) => void;
  reserveFill: string;
}) {
  const { node } = slot;
  const x = side === "left" ? 0 : VIEW_WIDTH - SIDE_WIDTH;
  const textX = side === "left" ? x + SIDE_WIDTH - 12 : x + 12;
  const anchor = side === "left" ? "end" : "start";
  const edgeX = side === "left" ? x + SIDE_WIDTH - 5 : x;
  const edgeY = slot.y + (slot.height - slot.bandHeight) / 2;
  const edgeHeight = Math.max(0, slot.bandHeight);
  const labelLines = wrapLabel(node.label);
  const textBlockHeight = labelLines.length * 16 + 18;
  const labelY = slot.y + (slot.height - textBlockHeight) / 2 + 12;
  const amountY = labelY + labelLines.length * 16 + 2;

  return (
    <g
      className={`${styles.svgNode} ${selected ? styles.selected : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Select ${node.label}${node.officialLabel && node.officialLabel !== node.label ? `. County budget category: ${node.officialLabel}` : ""}: ${formatAmount(node.value)}. Opens details dialog.`}
      aria-haspopup="dialog"
      onClick={() => onSelect(node)}
      onKeyDown={(event) => onNodeKeyDown(event, node, onSelect)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <rect className={styles.hitRect} x={x} y={slot.y} width={SIDE_WIDTH} height={slot.height} rx="7" />
      {edgeHeight > 0 ? (
        <rect
          className={styles.nodeEdge}
          x={edgeX}
          y={edgeY}
          width="5"
          height={edgeHeight}
          fill={node.kind === "reserve" ? reserveFill : node.color}
          rx="2.5"
        />
      ) : null}
      <text className={styles.nodeLabel} x={textX} y={labelY} textAnchor={anchor}>
        {labelLines.map((line, index) => (
          <tspan key={`${node.id}-${index}`} x={textX} dy={index === 0 ? 0 : 16}>{line}</tspan>
        ))}
      </text>
      <text className={styles.nodeAmount} x={textX} y={amountY} textAnchor={anchor}>
        {formatAmount(node.value)}
        {isPrintedDash(node.printedForm) ? <tspan baselineShift="super" fontSize="10">†</tspan> : null}
      </text>
    </g>
  );
}

function MobileNode({
  node,
  authority,
  selected,
  guided,
  onSelect,
}: {
  node: RiverNode;
  authority: number;
  selected: boolean;
  guided: boolean;
  onSelect: (node: RiverNode) => void;
}) {
  const width = Math.min(100, share(node.value, authority) * 100);
  return (
    <button
      type="button"
      className={`${styles.mobileNode} ${selected ? styles.selected : ""} ${guided ? styles.guided : ""}`}
      data-kind={node.kind}
      style={{ "--river-color": node.color, "--river-width": `${width}%` } as CSSProperties}
      onClick={() => onSelect(node)}
      aria-pressed={selected}
      aria-label={`Select ${node.label}${node.officialLabel && node.officialLabel !== node.label ? `. County budget category: ${node.officialLabel}` : ""}: ${formatAmount(node.value)}. Opens details dialog.`}
      aria-haspopup="dialog"
    >
      <span className={styles.mobileNodeLabel}>{node.label}</span>
      <span className={styles.mobileNodeAmount}>
        <strong>{mobilePrintableAmount(node)}</strong>
        <small aria-hidden="true">Details →</small>
      </span>
    </button>
  );
}

export function RiverChart({
  model,
  onSelect,
  selectedId,
  guidedNodeIds = [],
}: {
  model: RiverModel;
  onSelect: (node: RiverNode) => void;
  selectedId?: string;
  guidedNodeIds?: string[];
}) {
  const patternId = useId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const leftNodes = model.reserve ? [...model.sources, model.reserve] : model.sources;
  const left = rowLayout(leftNodes, model.authority);
  const right = rowLayout(model.uses, model.authority);
  const outerHeight = Math.max(left.height, right.height, FLOW_HEIGHT);
  const leftSlots = left.slots.map((slot) => ({ ...slot, y: slot.y + (outerHeight - left.height) / 2 }));
  const rightSlots = right.slots.map((slot) => ({ ...slot, y: slot.y + (outerHeight - right.height) / 2 }));
  const flowTop = NODE_TOP + (outerHeight - FLOW_HEIGHT) / 2;
  const flowBottom = flowTop + FLOW_HEIGHT;
  const sourceBands = centerBands(model.sources, model.authority, flowTop);
  const useBands = centerBands(model.uses, model.authority, flowTop);
  const reserveBand = model.reserve
    ? { node: model.reserve, center: flowBottom - (share(model.reserve.value, model.authority) * FLOW_HEIGHT) / 2, thickness: share(model.reserve.value, model.authority) * FLOW_HEIGHT }
    : null;
  const viewHeight = NODE_TOP + outerHeight + 84;
  const centerHeading = model.id === "general" ? "GENERAL FUND" : "COUNTY BUDGET";
  const centerDetail = model.id === "general" ? "spending plan" : "four-fund authority";
  const hasFundingInputs = model.sources.length > 0 || Boolean(model.reserve);
  const active = (id: string) => selectedId === id || hoveredId === id || guidedNodeIds.includes(id);
  const guided = (id: string) => guidedNodeIds.includes(id);

  return (
    <div className={styles.river}>
      <div className={styles.desktop}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
          role="group"
          aria-label={`${model.title}, fiscal year ${model.fiscalYear}. Select a source, fund, or spending area for details.`}
        >
          <defs>
            <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#d7d2c7" />
              <line x1="0" y1="0" x2="0" y2="8" stroke="#878175" strokeWidth="2" />
            </pattern>
          </defs>
          {model.sources.length ? <text className={styles.columnLabel} x="0" y="32">SOURCES</text> : null}
          {!model.sources.length ? (
            <g className={styles.scopeNote} aria-label="This county view includes four separate accounts. Each fund has its own sources and rules. Open the General Fund to explore its funding.">
              <text x="35" y="230" className={styles.scopeNoteHeading}>Four separate accounts</text>
              <text x="35" y="256">
                <tspan x="35" dy="0">Each fund has its own sources</tspan>
                <tspan x="35" dy="20">and rules. Open the General Fund</tspan>
                <tspan x="35" dy="20">to explore its funding.</tspan>
              </text>
            </g>
          ) : null}
          <text className={styles.columnLabel} x={CENTER_X + CENTER_WIDTH / 2} y="32" textAnchor="middle">{centerHeading}</text>
          <text className={styles.columnLabel} x={VIEW_WIDTH} y="32" textAnchor="end">SPENDING</text>

          <rect className={styles.spine} x={CENTER_X} y={NODE_TOP - 16} width={CENTER_WIDTH} height={outerHeight + 32} rx="16" />
          <text className={styles.spineLabel} x={CENTER_X + CENTER_WIDTH / 2} y={flowTop + 32} textAnchor="middle">{model.id === "general" ? "General Fund" : "County budget"}</text>
          <text className={styles.spineAmount} x={CENTER_X + CENTER_WIDTH / 2} y={flowTop + 56} textAnchor="middle">{formatAmount(model.authority)}</text>
          <text className={styles.spineDetail} x={CENTER_X + CENTER_WIDTH / 2} y={flowTop + 77} textAnchor="middle">{centerDetail}</text>

          {leftSlots.map((slot) => {
            const band = sourceBands.find((candidate) => candidate.node.id === slot.node.id);
            if (!band) return null;
            const x1 = SIDE_WIDTH;
            const x2 = CENTER_X;
            const y1 = slot.y + slot.height / 2;
            const y2 = band.center;
            const thickness = band.thickness;
            return <Ribbon key={`source-${slot.node.id}`} node={slot.node} active={active(slot.node.id)} onSelect={onSelect} onHover={setHoveredId} path={`M ${x1} ${y1 - thickness / 2} C ${x1 + 92} ${y1 - thickness / 2}, ${x2 - 92} ${y2 - thickness / 2}, ${x2} ${y2 - thickness / 2} L ${x2} ${y2 + thickness / 2} C ${x2 - 92} ${y2 + thickness / 2}, ${x1 + 92} ${y1 + thickness / 2}, ${x1} ${y1 + thickness / 2} Z`} />;
          })}
          {reserveBand && model.reserve ? (() => {
            const slot = leftSlots.find((candidate) => candidate.node.id === model.reserve?.id);
            if (!slot) return null;
            const x1 = SIDE_WIDTH;
            const x2 = CENTER_X;
            const y1 = slot.y + slot.height / 2;
            const y2 = reserveBand.center;
            const thickness = reserveBand.thickness;
            return <Ribbon node={model.reserve} reserve reserveFill={`url(#${patternId})`} active={active(model.reserve.id)} onSelect={onSelect} onHover={setHoveredId} path={`M ${x1} ${y1 - thickness / 2} C ${x1 + 92} ${y1 - thickness / 2}, ${x2 - 92} ${y2 - thickness / 2}, ${x2} ${y2 - thickness / 2} L ${x2} ${y2 + thickness / 2} C ${x2 - 92} ${y2 + thickness / 2}, ${x1 + 92} ${y1 + thickness / 2}, ${x1} ${y1 + thickness / 2} Z`} />;
          })() : null}
          {rightSlots.map((slot) => {
            const band = useBands.find((candidate) => candidate.node.id === slot.node.id);
            if (!band) return null;
            const x1 = CENTER_X + CENTER_WIDTH;
            const x2 = VIEW_WIDTH - SIDE_WIDTH;
            const y1 = band.center;
            const y2 = slot.y + slot.height / 2;
            const thickness = band.thickness;
            return <Ribbon key={`use-${slot.node.id}`} node={slot.node} active={active(slot.node.id)} onSelect={onSelect} onHover={setHoveredId} path={`M ${x1} ${y1 - thickness / 2} C ${x1 + 92} ${y1 - thickness / 2}, ${x2 - 92} ${y2 - thickness / 2}, ${x2} ${y2 - thickness / 2} L ${x2} ${y2 + thickness / 2} C ${x2 - 92} ${y2 + thickness / 2}, ${x1 + 92} ${y1 + thickness / 2}, ${x1} ${y1 + thickness / 2} Z`} />;
          })}

          {leftSlots.map((slot) => <SvgNode key={slot.node.id} slot={slot} side="left" selected={active(slot.node.id)} onSelect={onSelect} onHover={setHoveredId} reserveFill={`url(#${patternId})`} />)}
          {rightSlots.map((slot) => <SvgNode key={slot.node.id} slot={slot} side="right" selected={active(slot.node.id)} onSelect={onSelect} onHover={setHoveredId} reserveFill={`url(#${patternId})`} />)}
        </svg>
      </div>

      <div className={styles.mobile}>
        <p className={styles.mobileIntro}>
          {model.sources.length
            ? "Read from top to bottom: funding and any use of fund balance make up the fund total, which is then budgeted for spending. Tap a row for details and its source."
            : "The county total is followed by four separate spending plans. Tap a fund for details and its source. Countywide revenue is not combined here."
          }
        </p>
        {model.sources.length ? (
          <section aria-label="Funding">
            <h3>Funding for this fund</h3>
            {model.sources.map((node) => <MobileNode key={node.id} node={node} authority={model.authority} selected={selectedId === node.id} guided={guided(node.id)} onSelect={onSelect} />)}
          </section>
        ) : null}
        {model.reserve ? (
          <section aria-label="Fund balance used">
            <h3>Fund balance used</h3>
            <p className={styles.mobileSectionNote}>A planned use of fund balance, separate from money coming in.</p>
            <MobileNode node={model.reserve} authority={model.authority} selected={selectedId === model.reserve.id} guided={guided(model.reserve.id)} onSelect={onSelect} />
          </section>
        ) : null}
        {hasFundingInputs ? <div className={styles.mobileConnector} aria-hidden="true">↓</div> : null}
        <section className={styles.mobileSpine} aria-label={`${model.centerLabel}: ${formatAmount(model.authority)}`}>
          <span>{model.sources.length ? "General Fund total" : "Four fund groups"}</span>
          <strong>{formatAmount(model.authority)}</strong>
          <small>{model.centerLabel}</small>
        </section>
        <div className={styles.mobileConnector} aria-hidden="true">↓</div>
        <section aria-label="Spending">
          <h3>{model.sources.length ? "Budgeted spending" : "Spending plans by fund"}</h3>
          {model.uses.map((node) => <MobileNode key={node.id} node={node} authority={model.authority} selected={selectedId === node.id} guided={guided(node.id)} onSelect={onSelect} />)}
        </section>
      </div>
    </div>
  );
}
