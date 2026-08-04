ALTER TABLE `reimbursements`
    ADD COLUMN `evidence_type` TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `description`,
    ADD COLUMN `evidence_description` VARCHAR(500) NULL AFTER `evidence_type`,
    ADD CONSTRAINT `reimbursements_evidence_type_chk` CHECK (`evidence_type` BETWEEN 0 AND 2);
