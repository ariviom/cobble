-- Add manual approval tracking to minifig mappings
ALTER TABLE bricklink_minifig_mappings
ADD COLUMN IF NOT EXISTS manually_approved BOOLEAN DEFAULT FALSE;

-- Create index for filtering manually approved mappings
CREATE INDEX IF NOT EXISTS idx_bricklink_minifig_mappings_manually_approved 
ON bricklink_minifig_mappings(manually_approved) 
WHERE manually_approved = TRUE;

-- Add comment
COMMENT ON COLUMN bricklink_minifig_mappings.manually_approved IS 
'Set to true when a human has reviewed and approved this mapping. Overrides automatic confidence scoring.';

