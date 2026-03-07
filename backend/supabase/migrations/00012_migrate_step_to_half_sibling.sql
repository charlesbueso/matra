-- Migrate existing step_sibling records to half_sibling
-- (the system was incorrectly using step_sibling for half-siblings)
UPDATE relationships SET relationship_type = 'half_sibling' WHERE relationship_type = 'step_sibling';
