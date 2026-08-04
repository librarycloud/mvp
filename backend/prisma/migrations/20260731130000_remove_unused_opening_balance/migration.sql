-- The standalone opening-balance setup is not used by this product.
-- Remove its persisted data and schema instead of carrying an unused JSON field.
DROP TABLE IF EXISTS `opening_balances`;
DROP TABLE IF EXISTS `opening_balance_batches`;

DELETE ar
FROM `attachment_relations` ar
JOIN `accounting_events` ae ON ar.`source_type` = 'AccountingEvent' AND ar.`source_id` = ae.`id`
WHERE ae.`event_type` = 'OPENING_BALANCE'
  AND ae.`source_type` = 'OpeningBalance';

DELETE FROM `accounting_events`
WHERE `event_type` = 'OPENING_BALANCE'
  AND `source_type` = 'OpeningBalance';

DELETE di
FROM `dictionary_items` di
JOIN `dictionary_categories` dc ON dc.`id` = di.`category_id`
WHERE dc.`code` = 'event_type'
  AND di.`code` = 'OPENING_BALANCE';
