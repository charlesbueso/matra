-- Add ex_spouse to relationship_type enum
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'ex_spouse' AFTER 'spouse';
