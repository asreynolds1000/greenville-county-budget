import unittest

from scripts.fetch_sources import (
    discover_budget_pdfs,
    is_official_budget_pdf,
    normalize_url,
    safe_filename,
)


class FetchSourcesTests(unittest.TestCase):
    def test_official_budget_pdf_filter(self):
        self.assertTrue(
            is_official_budget_pdf(
                "https://www.greenvillecounty.org/ManagementandBudget/pdf/2012/book.pdf"
            )
        )
        self.assertFalse(is_official_budget_pdf("https://example.com/book.pdf"))
        self.assertFalse(
            is_official_budget_pdf("https://www.greenvillecounty.org/pdf/FOIAfees.pdf")
        )

    def test_discovery_resolves_relative_links_and_removes_duplicates(self):
        html = b"""
        <a href="pdf/2008/BudgetinBrief.pdf">Brief</a>
        <a href="pdf/2008/BudgetinBrief.pdf">Duplicate</a>
        <a href="https://example.com/other.pdf">External</a>
        """
        urls = discover_budget_pdfs(
            "https://www.greenvillecounty.org/ManagementandBudget/Budget08-09.aspx",
            html,
        )
        self.assertEqual(
            urls,
            [
                "https://www.greenvillecounty.org/ManagementandBudget/"
                "pdf/2008/BudgetinBrief.pdf"
            ],
        )

    def test_filename_removes_spaces_and_unsafe_characters(self):
        self.assertEqual(
            safe_filename("https://example.com/FY%202027%20Budget%20(final).pdf"),
            "FY-2027-Budget-final-.pdf",
        )

    def test_normalize_url_quotes_a_space_in_an_official_filename(self):
        self.assertEqual(
            normalize_url(
                "https://www.greenvillecounty.org/ManagementandBudget/pdf/2008/appendix .pdf"
            ),
            "https://www.greenvillecounty.org/ManagementandBudget/pdf/2008/appendix%20.pdf",
        )


if __name__ == "__main__":
    unittest.main()
