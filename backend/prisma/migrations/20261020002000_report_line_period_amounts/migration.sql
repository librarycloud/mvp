ALTER TABLE `report_lines`
  ADD COLUMN `year_to_date_amount` DECIMAL(19, 4) NULL AFTER `current_amount`,
  ADD COLUMN `prior_year_to_date_amount` DECIMAL(19, 4) NULL AFTER `year_to_date_amount`;
