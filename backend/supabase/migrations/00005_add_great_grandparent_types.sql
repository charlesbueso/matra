-- Add great-grandparent/grandchild relationship types for multi-generational families.
-- When interviewing grandparents they may reference their own parents/grandparents,
-- which are great-grandparents (or great-great-grandparents) of the user.
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'great_grandparent' AFTER 'grandchild';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'great_grandchild' AFTER 'great_grandparent';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'great_great_grandparent' AFTER 'great_grandchild';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'great_great_grandchild' AFTER 'great_great_grandparent';
