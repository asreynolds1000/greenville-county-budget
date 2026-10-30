import unittest

from scripts.audit_existing import (
    balance_continuity_findings,
    budget_total_findings,
    component_sum_findings,
    duplicate_key_findings,
)


class AuditExistingTests(unittest.TestCase):
    def test_duplicate_natural_key_is_reported(self):
        rows = [
            {"fiscal_year": "2022", "source": "Property Taxes", "data_type": "actual"},
            {"fiscal_year": "2022", "source": "Property Taxes", "data_type": "actual"},
        ]
        findings = duplicate_key_findings(
            "general_fund_revenue", rows, ("fiscal_year", "source", "data_type")
        )
        self.assertEqual([finding.code for finding in findings], ["duplicate_natural_key"])

    def test_budget_equations_detect_both_parent_failures(self):
        row = {
            "fiscal_year": "2025",
            "general_fund_operating": "100",
            "general_fund_transfers": "20",
            "general_fund_total": "119",
            "special_revenue": "30",
            "debt_service": "10",
            "enterprise": "5",
            "total_budget": "165",
            "internal_service": "40",
        }
        findings = budget_total_findings([row])
        self.assertEqual(
            {finding.code for finding in findings},
            {"general_fund_total_mismatch", "whole_budget_total_mismatch"},
        )

    def test_component_sum_compares_to_parent(self):
        totals = [{"fiscal_year": "2024", "general_fund_operating": "100"}]
        components = [
            {"fiscal_year": "2024", "amount": "60"},
            {"fiscal_year": "2024", "amount": "50"},
        ]
        findings = component_sum_findings(
            totals,
            components,
            total_field="general_fund_operating",
            dataset="general_fund_departments",
            code="general_fund_component_mismatch",
        )
        self.assertEqual(findings[0].delta, 10)

    def test_balance_discontinuity_is_a_warning(self):
        rows = [
            {
                "fiscal_year": "2023",
                "beginning_balance": "80",
                "ending_balance": "90",
            },
            {
                "fiscal_year": "2024",
                "beginning_balance": "100",
                "ending_balance": "110",
            },
        ]
        findings = balance_continuity_findings(rows)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].severity, "warning")
        self.assertEqual(findings[0].delta, 10)


if __name__ == "__main__":
    unittest.main()
