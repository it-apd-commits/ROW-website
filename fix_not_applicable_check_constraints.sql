-- Allows the new 'Not Applicable' option in Side of Limb Affected and Joint Involved.
-- The assessment tables have CHECK constraints listing the allowed dropdown values;
-- this drops any existing check on those two columns and recreates it with
-- 'Not Applicable' included. Safe to re-run.
--
-- Run this in the Supabase SQL editor.

DO $$
DECLARE
    tbl TEXT;
    col TEXT;
    con RECORD;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['initial_assessment', 'clinical_assessment', 'follow_up_assessment'] LOOP
        -- Skip tables that don't exist
        IF to_regclass('public.' || tbl) IS NULL THEN
            RAISE NOTICE 'Table % not found - skipped', tbl;
            CONTINUE;
        END IF;

        FOREACH col IN ARRAY ARRAY['side_of_limb_affected', 'joint_involved'] LOOP
            -- Skip columns that don't exist on this table
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
            ) THEN
                CONTINUE;
            END IF;

            -- Drop every existing CHECK constraint that references this column
            FOR con IN
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                WHERE c.conrelid = to_regclass('public.' || tbl)
                  AND c.contype = 'c'
                  AND a.attname = col
            LOOP
                EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, con.conname);
                RAISE NOTICE 'Dropped % on %', con.conname, tbl;
            END LOOP;

            -- Recreate with 'Not Applicable' included (NULL still allowed for optional columns)
            IF col = 'side_of_limb_affected' THEN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IN (''Left'', ''Right'', ''Bilateral'', ''Not Applicable''))',
                    tbl, tbl || '_' || col || '_check', col
                );
            ELSE
                EXECUTE format(
                    'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IN (''Shoulder'', ''Elbow'', ''Wrist'', ''Hip'', ''Knee'', ''Ankle'', ''Spine'', ''Multiple'', ''Not Applicable''))',
                    tbl, tbl || '_' || col || '_check', col
                );
            END IF;
            RAISE NOTICE 'Recreated check on %.% with Not Applicable', tbl, col;
        END LOOP;
    END LOOP;
END $$;
