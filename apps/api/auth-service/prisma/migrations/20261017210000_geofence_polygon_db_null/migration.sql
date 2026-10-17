-- A cleared site boundary was stored as the JSON value null instead of a database NULL
-- (the service wrote a plain `null` into a nullable Json column). Both read back as no
-- boundary, but "IS NULL" counted the JSON null as drawn. Data only, idempotent.
UPDATE "company_locations" SET "geofencePolygon" = NULL WHERE "geofencePolygon" = 'null'::jsonb;
