-- General-taxpayer VAT subsidiary accounts under 2221 应交税费.
INSERT IGNORE INTO `accounts`
  (`code`, `name`, `category`, `normal_direction`, `parent_id`, `level`, `is_leaf`, `is_enabled`, `is_system`, `sort_order`, `updated_at`)
VALUES
  ('2221', '应交税费', 'LIABILITY', 'CREDIT', NULL, 1, false, true, true, 580, CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `accounts`
  (`code`, `name`, `category`, `normal_direction`, `parent_id`, `level`, `is_leaf`, `is_enabled`, `is_system`, `sort_order`, `updated_at`)
SELECT v.code, v.name, 'LIABILITY', 'CREDIT', p.id, 2, true, true, true, v.sort_order, CURRENT_TIMESTAMP(3)
FROM `accounts` p
JOIN (
  SELECT '222101' code, '应交增值税' name, 10 sort_order UNION ALL
  SELECT '222102', '未交增值税', 20 UNION ALL
  SELECT '222103', '预交增值税', 30 UNION ALL
  SELECT '222104', '待抵扣进项税额', 40 UNION ALL
  SELECT '222105', '待认证进项税额', 50 UNION ALL
  SELECT '222106', '待转销项税额', 60 UNION ALL
  SELECT '222107', '增值税留抵税额', 70 UNION ALL
  SELECT '222108', '简易计税', 80 UNION ALL
  SELECT '222109', '转让金融商品应交增值税', 90 UNION ALL
  SELECT '222110', '代扣代交增值税', 100 UNION ALL
  SELECT '222111', '应交消费税', 110 UNION ALL
  SELECT '222112', '应交城市维护建设税', 120 UNION ALL
  SELECT '222113', '应交教育费附加', 130 UNION ALL
  SELECT '222114', '应交地方教育附加', 140 UNION ALL
  SELECT '222115', '应交企业所得税', 150 UNION ALL
  SELECT '222116', '应交个人所得税', 160 UNION ALL
  SELECT '222117', '应交房产税', 170 UNION ALL
  SELECT '222118', '应交城镇土地使用税', 180 UNION ALL
  SELECT '222119', '应交车船税', 190 UNION ALL
  SELECT '222120', '应交印花税', 200 UNION ALL
  SELECT '222121', '应交土地增值税', 210 UNION ALL
  SELECT '222122', '应交资源税', 220 UNION ALL
  SELECT '222123', '应交环境保护税', 230 UNION ALL
  SELECT '222124', '应交关税', 240 UNION ALL
  SELECT '222125', '应交契税', 250 UNION ALL
  SELECT '222126', '应交耕地占用税', 260 UNION ALL
  SELECT '222199', '其他应交税费', 990
) v
WHERE p.code = '2221';

UPDATE `accounts` child
JOIN `accounts` parent ON parent.code = '2221'
SET child.parent_id = parent.id,
    child.level = 2,
    child.is_enabled = true,
    child.is_system = true,
    child.deleted_at = NULL
WHERE child.code IN (
  '222101', '222102', '222103', '222104', '222105', '222106', '222107', '222108', '222109', '222110',
  '222111', '222112', '222113', '222114', '222115', '222116', '222117', '222118', '222119', '222120',
  '222121', '222122', '222123', '222124', '222125', '222126', '222199'
);

INSERT IGNORE INTO `accounts`
  (`code`, `name`, `category`, `normal_direction`, `parent_id`, `level`, `is_leaf`, `is_enabled`, `is_system`, `sort_order`, `updated_at`)
SELECT v.code, v.name, 'LIABILITY', 'CREDIT', p.id, 3, true, true, true, v.sort_order, CURRENT_TIMESTAMP(3)
FROM `accounts` p
JOIN (
  SELECT '22210101' code, '进项税额' name, 10 sort_order UNION ALL
  SELECT '22210102', '销项税额抵减', 20 UNION ALL
  SELECT '22210103', '已交税金', 30 UNION ALL
  SELECT '22210104', '转出未交增值税', 40 UNION ALL
  SELECT '22210105', '减免税款', 50 UNION ALL
  SELECT '22210106', '出口抵减内销产品应纳税额', 60 UNION ALL
  SELECT '22210107', '销项税额', 70 UNION ALL
  SELECT '22210108', '出口退税', 80 UNION ALL
  SELECT '22210109', '进项税额转出', 90 UNION ALL
  SELECT '22210110', '转出多交增值税', 100
) v
WHERE p.code = '222101';

UPDATE `accounts` child
JOIN `accounts` parent ON parent.code = '222101'
SET child.parent_id = parent.id,
    child.level = 3,
    child.is_enabled = true,
    child.is_system = true,
    child.deleted_at = NULL
WHERE child.code IN ('22210101', '22210102', '22210103', '22210104', '22210105', '22210106', '22210107', '22210108', '22210109', '22210110');

UPDATE `accounts`
SET `is_leaf` = false, `is_enabled` = true, `is_system` = true, `deleted_at` = NULL
WHERE `code` IN ('2221', '222101');
