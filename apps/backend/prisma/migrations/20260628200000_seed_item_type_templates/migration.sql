-- Seed built-in item type templates (idempotent: skip if already present).
INSERT INTO "ItemTypeTemplate" ("itemType", "label", "fieldSchema", "defaultFees", "defaultCurrencies")
VALUES
  (
    'wantoff.other',
    'Something else',
    '[]'::jsonb,
    '[{"kind":"currency","scope":"user","currency":"CRC","required":true}]'::jsonb,
    '[{"currency":"CRC","preferred":true}]'::jsonb
  ),
  (
    'wantoff.items',
    'Physical item',
    '[{"name":"title","label":"Title","type":"string","required":true},{"name":"description","label":"Description","type":"text","required":false}]'::jsonb,
    '[{"kind":"donation","scope":"user","currency":"CRC","required":false}]'::jsonb,
    '[{"currency":"CRC","preferred":true}]'::jsonb
  ),
  (
    'wantoff.skills',
    'Skill or service',
    '[{"name":"title","label":"Title","type":"string","required":true},{"name":"description","label":"Description","type":"text","required":false},{"name":"duration","label":"Duration (minutes)","type":"number","required":false}]'::jsonb,
    '[{"kind":"donation","scope":"user","currency":"CRC","required":false}]'::jsonb,
    '[{"currency":"CRC","preferred":true}]'::jsonb
  ),
  (
    'wantoff.digital',
    'Digital resource',
    '[{"name":"title","label":"Title","type":"string","required":true},{"name":"description","label":"Description","type":"text","required":false}]'::jsonb,
    '[{"kind":"donation","scope":"user","currency":"CRC","required":false}]'::jsonb,
    '[{"currency":"CRC","preferred":true}]'::jsonb
  ),
  (
    'mealmate.meal',
    'Spare seats at a meal',
    '[{"name":"title","label":"Title","type":"string","required":true},{"name":"description","label":"Description","type":"text","required":false},{"name":"location","label":"Location","type":"location","required":true},{"name":"mealTime","label":"Meal time","type":"date","required":true},{"name":"capacity","label":"Capacity","type":"number","required":true},{"name":"dietaryInfo","label":"Dietary info","type":"string[]","required":false}]'::jsonb,
    '[{"kind":"credit","scope":"user","creditType":"mealmate.meal-credit","amount":1,"required":true},{"kind":"donation","scope":"user","currency":"CRC","required":false}]'::jsonb,
    '[{"currency":"mealmate.meal-credit","preferred":true}]'::jsonb
  )
ON CONFLICT ("itemType") DO NOTHING;
