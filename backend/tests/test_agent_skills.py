import unittest

from app.agent_skills.practical_support import PRACTICAL_SUPPORT_SKILL
from app.intake_models import NeedCategory


class PracticalSupportSkillTest(unittest.TestCase):
    def test_service_options_feed_agent_prompt_language(self):
        text = PRACTICAL_SUPPORT_SKILL.service_options_text()

        self.assertIn("groceries", text)
        self.assertIn("medication pickup", text)
        self.assertIn("another practical service", text)

    def test_catalog_keeps_extraction_keywords_with_skill_definition(self):
        self.assertIn("milk", PRACTICAL_SUPPORT_SKILL.grocery_item_aliases)
        self.assertIn("groceries", PRACTICAL_SUPPORT_SKILL.grocery_category_keywords)
        self.assertIn(NeedCategory.CLEANING, PRACTICAL_SUPPORT_SKILL.service_keywords)
        self.assertIn("cleaning", PRACTICAL_SUPPORT_SKILL.service_keywords[NeedCategory.CLEANING])

    def test_skill_contract_prevents_example_menu_orders_and_preserves_quantities(self):
        explicit_rules = PRACTICAL_SUPPORT_SKILL.explicit_need_rules_text()
        quantity_rules = PRACTICAL_SUPPORT_SKILL.quantity_capture_rules_text()

        self.assertIn("Never order menu examples", explicit_rules)
        self.assertIn("declined", explicit_rules)
        self.assertIn("1-litre bottle of milk", quantity_rules)
        self.assertIn("spoken quantities", quantity_rules)


if __name__ == "__main__":
    unittest.main()
