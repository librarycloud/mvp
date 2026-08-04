-- CreateTable
CREATE TABLE `cmb_fetch_configs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `config_key` VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
    `encrypted_payload` LONGTEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `cmb_fetch_configs_config_key_key`(`config_key`),
    INDEX `cmb_fetch_configs_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
