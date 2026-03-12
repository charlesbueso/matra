-- Add half_sibling, parent_in_law, and child_in_law to relationship_type enum
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'half_sibling';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'parent_in_law';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'child_in_law';
