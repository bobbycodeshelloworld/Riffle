-- ============================================================
-- sample.sql — a quick tour of what SQL Viewer highlights
-- ============================================================

-- A plain table with a few column types and constraints
CREATE TABLE IF NOT EXISTS widgets (
    id          bigserial PRIMARY KEY,
    name        text NOT NULL,
    sku         varchar(32) UNIQUE,
    price_cents integer DEFAULT 0 CHECK (price_cents >= 0),
    tags        jsonb DEFAULT '[]'::jsonb,
    note        text DEFAULT E'line one\nline two',   -- E'' escape string
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_widgets_sku ON widgets (sku);

-- ===== A dollar-quoted function body (note the inner semicolons) =====
CREATE OR REPLACE FUNCTION public.bump_price(p_id bigint, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    new_price integer;
BEGIN
    UPDATE widgets
       SET price_cents = price_cents + p_delta
     WHERE id = p_id
    RETURNING price_cents INTO new_price;

    IF new_price < 0 THEN
        RAISE EXCEPTION 'price for widget % went negative: %', p_id, new_price;
    END IF;

    RETURN new_price;
END;
$$;

-- A couple of writes with strings, numbers, and an '' escape
INSERT INTO widgets (name, sku, price_cents, tags)
VALUES ('Gadget ''A''', 'SKU-001', 1999, '["new","featured"]'::jsonb),
       ('Gizmo B',      'SKU-002',  499, '[]'::jsonb);

UPDATE widgets SET price_cents = price_cents * 2 WHERE tags ? 'featured';

SELECT id, name, price_cents
  FROM widgets
 WHERE price_cents BETWEEN 100 AND 5000
 ORDER BY price_cents DESC
 LIMIT 10;
