import unittest

from scripts.blind_extract.table_numbers import (
    raw_tokens,
    tokens,
    value,
    year_tokens,
    year_values,
    zero_printed_form,
)


class TableNumberTests(unittest.TestCase):
    def test_label_hyphen_is_not_a_zero_cell(self):
        line = "TRANSFERS - CAPITAL PROJECTS       -       1,189,077"
        found = tokens(line)
        self.assertEqual([item[2] for item in found], [0, 1189077])
        self.assertEqual(line[: found[0][0]].strip(), "TRANSFERS - CAPITAL PROJECTS")

    def test_engineering_bureau_label_stays_intact(self):
        line = "ENGINEERING - NORTHERN BUREAU    2,372,149   2,480,983   108,834"
        found = tokens(line)
        self.assertEqual([item[2] for item in found], [2372149, 2480983, 108834])
        self.assertEqual(line[: found[0][0]].strip(), "ENGINEERING - NORTHERN BUREAU")

    def test_parenthetical_and_double_dash_values(self):
        self.assertEqual(value("($ 2,500)"), -2500)
        self.assertEqual(value("--"), 0)

    def test_raw_tokens_preserve_dash_zero_and_parenthetical_zero(self):
        line = "ROW       -       --       $0       ( 0 )"
        self.assertEqual(
            [(raw.strip(), amount) for _start, _end, raw, amount in raw_tokens(line)],
            [("-", 0), ("--", 0), ("$0", 0), ("( 0 )", 0)],
        )
        self.assertEqual([zero_printed_form(raw) for raw in ["-", "--", "$0", "( 0 )"]], [
            "-", "--", "0", "(0)",
        ])

    def test_printed_form_rejects_nonzero_tokens(self):
        with self.assertRaisesRegex(ValueError, "not a zero-valued"):
            zero_printed_form("$1")

    def test_year_columns_do_not_shift_when_first_value_is_a_dash(self):
        positions = [44, 64, 83, 137]
        line = "PUBLIC DEFENDER" + " " * 37 + "-              433,922            433,922                                                 433,922"
        self.assertEqual(
            year_values(line, positions, [0, 1, 2, 4], 6),
            [0, 433922, 433922, 433922],
        )
        selected = year_tokens(line, positions, [0, 1, 2, 4], 6)
        self.assertEqual([token[2].strip() if token else None for token in selected], [
            "-", "433,922", "433,922", "433,922",
        ])

    def test_change_column_is_not_selected_as_a_year(self):
        positions = [44, 64, 83, 137]
        line = "ANIMAL CARE SERVICES" + " " * 48 + "678,049          1,053,547 $           375,498           55.38% $       1,067,057"
        self.assertEqual(
            year_values(line, positions, [0, 1, 2, 4], 6),
            [None, 678049, 1053547, 1067057],
        )

    def test_complete_row_uses_column_sequence(self):
        positions = [51, 68, 87, 137]
        line = "TOTAL COMMUNITY DEVELOPMENT & PLNG $ 17,958,096 $ 18,696,945 $                         20,411,544   $    1,714,599          9.17% $   20,619,770   $   208,226"
        self.assertEqual(
            year_values(line, positions, [0, 1, 2, 4], 6),
            [17958096, 18696945, 20411544, 20619770],
        )


if __name__ == "__main__":
    unittest.main()
