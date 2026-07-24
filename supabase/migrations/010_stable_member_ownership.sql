-- Add stable member ownership without removing the existing display-name
-- columns. Old rows continue to render; every new live assignment can now be
-- compared by app_users.id, including when two teammates share a name.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS owner_user_id UUID
    REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_workspace_owner_user
  ON customers (workspace_id, owner_user_id);

ALTER TABLE offering_categories
  ADD COLUMN IF NOT EXISTS owner_user_id UUID
    REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offering_categories_workspace_owner_user
  ON offering_categories (workspace_id, owner_user_id);

-- Backfill only an unambiguous active teammate in the same workspace. Duplicate
-- display names deliberately remain unresolved and must be assigned by id/email.
UPDATE customers AS customer
SET owner_user_id = matched.member_id
FROM (
  SELECT
    customer_row.id AS customer_id,
    (ARRAY_AGG(member.id ORDER BY member.id))[1] AS member_id
  FROM customers AS customer_row
  JOIN app_users AS member
    ON member.workspace_id = customer_row.workspace_id
   AND member.active = TRUE
   AND LOWER(BTRIM(member.display_name)) = LOWER(BTRIM(customer_row.owner))
  WHERE customer_row.owner_user_id IS NULL
    AND customer_row.owner IS NOT NULL
    AND BTRIM(customer_row.owner) <> ''
  GROUP BY customer_row.id
  HAVING COUNT(*) = 1
) AS matched
WHERE customer.id = matched.customer_id;

UPDATE offering_categories AS category
SET owner_user_id = matched.member_id
FROM (
  SELECT
    category_row.id AS category_id,
    (ARRAY_AGG(member.id ORDER BY member.id))[1] AS member_id
  FROM offering_categories AS category_row
  JOIN app_users AS member
    ON member.workspace_id = category_row.workspace_id
   AND member.active = TRUE
   AND LOWER(BTRIM(member.display_name)) = LOWER(BTRIM(category_row.owner))
  WHERE category_row.owner_user_id IS NULL
    AND category_row.owner IS NOT NULL
    AND BTRIM(category_row.owner) <> ''
  GROUP BY category_row.id
  HAVING COUNT(*) = 1
) AS matched
WHERE category.id = matched.category_id;
