ALTER TABLE `company_profiles`
  ADD COLUMN `operation_mode` ENUM('SIMPLE', 'STANDARD') NOT NULL DEFAULT 'SIMPLE' AFTER `fiscal_year_start_month`;
