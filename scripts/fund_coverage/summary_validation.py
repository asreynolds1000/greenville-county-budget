"""Accounting identities shared by fund-summary extraction routes."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SummaryLabels:
    financial_sources_total: str = "Total Estimated Financial Sources"
    expenditures_total: str = "Total Expenditures"
    operating_result: str = "Excess(deficiency) of revenues over(under) expenditures"
    financing_total: str = "Total Other Sources (Uses)"
    beginning_position: str = "Fund Balance July 1"
    ending_position: str = "Fund Balance - June 30"
    adjustment_sign_by_source: dict[str, int] = field(default_factory=dict)
    # Exact deltas the official source prints, keyed by (source, year, identity).
    # Registering the observed delta rather than skipping the equation ensures a future
    # extraction change still fails unless it reproduces the documented source anomaly.
    source_exceptions: dict[tuple[str, int, str], int] = field(default_factory=dict)


def _one(rows: list[dict[str, object]], label: str) -> int:
    matches = [int(row["value"]) for row in rows if row["original_label"] == label]
    if len(matches) != 1:
        raise ValueError(f"expected one {label!r} row, found {len(matches)}")
    return matches[0]


def validate_summary(
    rows: list[dict[str, object]],
    sources,
    labels: SummaryLabels = SummaryLabels(),
) -> None:
    """Fail unless every source-year statement reconciles to the dollar."""
    groups: dict[tuple[str, int], list[dict[str, object]]] = {}
    for row in rows:
        groups.setdefault((str(row["source_code"]), int(row["fiscal_year"])), []).append(row)

    expected = {(source.code, year) for source in sources for year in source.years}
    if set(groups) != expected:
        raise ValueError(f"source-year coverage mismatch: {set(groups) ^ expected}")

    for (source_code, year), group in groups.items():
        def check(identity: str, delta: int, message: str) -> None:
            expected_delta = labels.source_exceptions.get((source_code, year, identity), 0)
            if delta != expected_delta:
                suffix = (
                    f" (registered source delta {expected_delta:+d}, observed {delta:+d})"
                    if expected_delta
                    else ""
                )
                raise ValueError(f"{source_code} FY{year}: {message}{suffix}")

        inflow = [row for row in group if row["statement_section"] == "inflow"]
        inflow_total = _one(group, labels.financial_sources_total)
        inflow_detail = sum(
            int(row["value"])
            for row in inflow
            if row["original_label"] != labels.financial_sources_total
        )
        check("inflow", inflow_detail - inflow_total, "financial sources do not reconcile")

        outflow = [row for row in group if row["statement_section"] == "outflow"]
        outflow_total = _one(group, labels.expenditures_total)
        outflow_detail = sum(
            int(row["value"])
            for row in outflow
            if row["original_label"] != labels.expenditures_total
        )
        check("outflow", outflow_detail - outflow_total, "expenditures do not reconcile")

        operating_result = _one(group, labels.operating_result)
        check(
            "operating_result",
            inflow_total - outflow_total - operating_result,
            "operating result does not reconcile",
        )

        financing = [row for row in group if row["statement_section"] == "financing"]
        financing_total = _one(group, labels.financing_total)
        financing_detail = sum(
            int(row["value"])
            for row in financing
            if row["original_label"] != labels.financing_total
        )
        check("financing", financing_detail - financing_total, "financing does not reconcile")

        net_change = next(
            int(row["value"])
            for row in group
            if row["statement_section"] == "net_position_change"
        )
        check(
            "net_change",
            operating_result + financing_total - net_change,
            "net change does not reconcile",
        )

        beginning = _one(group, labels.beginning_position)
        ending = _one(group, labels.ending_position)
        adjustment = sum(
            int(row["value"])
            for row in group
            if row["statement_section"] == "position_adjustment"
        )
        adjustment_sign = labels.adjustment_sign_by_source.get(source_code, 1)
        check(
            "position",
            beginning + net_change + adjustment_sign * adjustment - ending,
            "fund balance does not reconcile",
        )

        components = [row for row in group if row["statement_section"] == "position_component"]
        if components:
            check(
                "position_components",
                sum(int(row["value"]) for row in components) - ending,
                "fund balance components do not reconcile",
            )
