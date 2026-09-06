/**
 * 提取中文字符串的首字母拼音简码（用于会计科目拼音首字母快速检索）
 * 支持中文、字母、数字
 */

// 常见汉字首字母 Unicode 区间及特殊字映射表
const PINYIN_TABLE: Record<string, string> = {
  a: "阿啊吖嗄腌锕",
  b: "八把白百半包报保被本必币边变标别并病不部步办备保报版",
  c: "才采裁产场长常厂朝超车成持出处初除除传创存存材财成承重",
  d: "大带单待但到道德得地第点电调定定动都度段对代当党达单位",
  e: "额额外恶饿二儿",
  f: "发法反方放非费分份风服副付复负房防非辅付复费",
  g: "该干感高告各给公工构共古关管广归国果过股规挂公",
  h: "还海含好和合合同核很后互化话划会活或汇货和行户",
  j: "机基积及级极几集计记加家价假间建交接结解界金进近京经精九就举具据局件借集价计交减监",
  k: "开看可客克空库口快款科开客款扩扣",
  l: "来老利立两联量流路录律率利料领累计类历",
  m: "买卖满毛每门们面名明目模末母免名民买",
  n: "那南难内能你年代年念农能内",
  o: "偶欧",
  p: "派判旁跑配票品平评普凭评批平品",
  q: "七其期齐其奇起器千前强切清请求区全确权取清欠企迁",
  r: "然让热人认日如入认任软融",
  s: "三色山商上少设社身深什生省失实实使市示事收手受数双水水说司思死四所算素税损商收失审",
  t: "台太特提体天条通同统投头退拓托提调摊提统退",
  w: "完万为位文问我务物无五午武未外完无微网委维往未",
  x: "西息希析下先显现线相想小校效些信星行业修虚需许序续宣选学销项详薪消现行新",
  y: "一已以仪意因引银英应用友右有预元原员月越运在业益印营用优有预预阅由研月应营银预",
  z: "在再早造则责增展张章账照者这真正证整支只直指制中重主住专转资子自总综租组织增直资产",
};

// 预热反向查找表
const CHAR_TO_INITIAL: Record<string, string> = {};
for (const [initial, chars] of Object.entries(PINYIN_TABLE)) {
  for (const char of chars) {
    CHAR_TO_INITIAL[char] = initial;
  }
}

/**
 * 获取单个字符的首字母
 */
export function getCharInitial(char: string): string {
  if (!char) return "";
  if (/[a-zA-Z0-9]/.test(char)) return char.toLowerCase();
  
  if (CHAR_TO_INITIAL[char]) {
    return CHAR_TO_INITIAL[char];
  }

  // 使用 Intl 拼音排序匹配首字母
  const pinyinBoundaries = [
    { initial: "a", char: "\u554a" },
    { initial: "b", char: "\u767e" },
    { initial: "c", char: "\u643e" },
    { initial: "d", char: "\u8fbe" },
    { initial: "e", char: "\u9e45" },
    { initial: "f", char: "\u53d1" },
    { initial: "g", char: "\u95ee" },
    { initial: "h", char: "\u54c8" },
    { initial: "j", char: "\u57fa" },
    { initial: "k", char: "\u5580" },
    { initial: "l", char: "\u5783" },
    { initial: "m", char: "\u5988" },
    { initial: "n", char: "\u62ff" },
    { initial: "o", char: "\u5594" },
    { initial: "p", char: "\u556a" },
    { initial: "q", char: "\u671f" },
    { initial: "r", char: "\u7136" },
    { initial: "s", char: "\u6492" },
    { initial: "t", char: "\u584c" },
    { initial: "w", char: "\u6316" },
    { initial: "x", char: "\u6614" },
    { initial: "y", char: "\u538b" },
    { initial: "z", char: "\u531e" },
  ];

  for (let i = pinyinBoundaries.length - 1; i >= 0; i--) {
    const item = pinyinBoundaries[i]!;
    if (char.localeCompare(item.char, "zh-CN-u-co-pinyin") >= 0) {
      CHAR_TO_INITIAL[char] = item.initial;
      return item.initial;
    }
  }

  return char.toLowerCase();
}

/**
 * 转换字符串为拼音首字母简码
 * 例如："银行存款" -> "yhck"，"1002 银行存款" -> "1002yhck"
 */
export function getPinyinInitials(str: string): string {
  if (!str) return "";
  let result = "";
  for (const char of str) {
    if (/\s/.test(char)) continue;
    result += getCharInitial(char);
  }
  return result;
}

/**
 * 拼音简码模糊匹配
 * @param text 目标文本，如 "1002 银行存款"
 * @param query 查询关键词，如 "yhck" 或 "1002" 或 "银行"
 */
export function matchPinyin(text: string, query: string): boolean {
  if (!text || !query) return true;
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  
  // 1. 包含原始文本
  if (t.includes(q)) return true;
  
  // 2. 包含拼音首字母
  const initials = getPinyinInitials(text);
  if (initials.includes(q)) return true;

  return false;
}
