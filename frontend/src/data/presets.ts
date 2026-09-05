import type { Asset, AssetType, CaseInput, Member, Personality, Relation } from '../types'

export const ASSET_TYPES: { value: AssetType; label: string; emoji: string; divisible: boolean }[] = [
  { value: 'house', label: '房产', emoji: '🏠', divisible: false },
  { value: 'car', label: '汽车', emoji: '🚗', divisible: false },
  { value: 'cash', label: '存款', emoji: '💰', divisible: true },
  { value: 'crypto', label: '加密货币', emoji: '🪙', divisible: true },
  { value: 'stock', label: '股票基金', emoji: '📈', divisible: true },
  { value: 'equity', label: '公司股权', emoji: '🏢', divisible: true },
  { value: 'nft', label: 'NFT', emoji: '🖼️', divisible: false },
  { value: 'pet', label: '宠物', emoji: '🐾', divisible: false },
  { value: 'collectible', label: '收藏 / 纪念物', emoji: '🏺', divisible: false },
  { value: 'other', label: '其他', emoji: '📦', divisible: true },
]

export const ASSET_EMOJI: Record<AssetType, string> = Object.fromEntries(
  ASSET_TYPES.map((t) => [t.value, t.emoji]),
) as Record<AssetType, string>

export const RELATIONS: { value: Relation; label: string; hint: string; group: 'heir' | 'maybe' | 'outsider' }[] = [
  { value: 'spouse', label: '配偶', hint: '第一顺序', group: 'heir' },
  { value: 'son', label: '儿子', hint: '第一顺序', group: 'heir' },
  { value: 'daughter', label: '女儿', hint: '第一顺序', group: 'heir' },
  { value: 'father', label: '父亲', hint: '第一顺序', group: 'heir' },
  { value: 'mother', label: '母亲', hint: '第一顺序', group: 'heir' },
  { value: 'stepchild', label: '继子女', hint: '有扶养关系才算', group: 'maybe' },
  { value: 'grandchild', label: '孙子女', hint: '父/母先亡时代位', group: 'maybe' },
  { value: 'daughter_in_law', label: '儿媳', hint: '丧偶+主要赡养', group: 'maybe' },
  { value: 'son_in_law', label: '女婿', hint: '丧偶+主要赡养', group: 'maybe' },
  { value: 'sibling', label: '兄弟姐妹', hint: '第二顺序', group: 'maybe' },
  { value: 'grandparent', label: '祖父母', hint: '第二顺序', group: 'maybe' },
  { value: 'dependent', label: '被扶养人/保姆', hint: '可酌情分给', group: 'outsider' },
  { value: 'ex_spouse', label: '前任', hint: '无继承权但会闹', group: 'outsider' },
  { value: 'pet', label: '宠物', hint: '它有话要说', group: 'outsider' },
  { value: 'ai_twin', label: 'AI 数字分身', hint: '替你说话或捣乱', group: 'outsider' },
  { value: 'friend', label: '老友', hint: '吃瓜 / 作证', group: 'outsider' },
]

export const RELATION_LABEL: Record<string, string> = Object.fromEntries(RELATIONS.map((r) => [r.value, r.label]))

export const PERSONALITIES: { value: Personality; label: string; emoji: string; color: string; desc: string }[] = [
  { value: 'greedy', label: '贪婪', emoji: '🤑', color: '#f5b942', desc: '盯着房子和比特币，嘴上亲情眼里估值' },
  { value: 'filial', label: '孝顺', emoji: '🥹', color: '#f472b6', desc: '只想留下老照片、宠物和回忆' },
  { value: 'chill', label: '佛系', emoji: '🍵', color: '#2dd4bf', desc: '都行，但吃相太难看会补刀' },
  { value: 'calculating', label: '精算师', emoji: '🧮', color: '#818cf8', desc: '满嘴百分比，方案看似公平' },
  { value: 'drama', label: '戏精', emoji: '🎭', color: '#e879f9', desc: '"我不活了"是口头禅' },
  { value: 'lawyer', label: '律师型', emoji: '⚖️', color: '#60a5fa', desc: '冷静引条文，抓话里的漏洞' },
  { value: 'loyal', label: '忠诚', emoji: '🐶', color: '#fb923c', desc: '认准一个人死心眼支持' },
  { value: 'mischief', label: '捣蛋', emoji: '😈', color: '#a3e635', desc: '冷不丁爆料，让全场尴尬' },
]

export const PERSONALITY_MAP = Object.fromEntries(PERSONALITIES.map((p) => [p.value, p])) as Record<Personality, (typeof PERSONALITIES)[number]>

let seq = 0
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`

export function newAsset(partial: Partial<Asset> = {}): Asset {
  return { id: uid('a'), name: '', type: 'cash', value: 10, joint: false, sentimental: false, note: '', ...partial }
}

export function newMember(partial: Partial<Member> = {}): Member {
  return {
    id: uid('m'), name: '', relation: 'son', personality: 'chill', deceased: false, parent_id: null,
    main_support: false, hardship: false, neglect: false, cohabit: false, dependency: false, disqualified: false,
    wish: '', model: null, ...partial,
  }
}

export interface Preset {
  id: string
  title: string
  tagline: string
  emoji: string
  build: () => CaseInput
}

export const PRESETS: Preset[] = [
  {
    id: 'cat',
    title: '猫比儿子亲',
    tagline: '不孝儿子 vs 孝顺女儿 vs 一只坚持要沙发的橘猫，前妻突然闯入',
    emoji: '🐱',
    build: () => ({
      decedent_name: '老王',
      story: '儿子王大宝五年没回家，只在借钱时打电话；女儿王小美辞职照顾我三年；我最爱的是橘猫大橘，它每天六点叫我起床。前妻当年离婚时说房子首付有她一半。',
      assets: [
        { id: 'house', name: '学区房', type: 'house', value: 600, joint: true, sentimental: false, note: '和李阿姨的婚房' },
        { id: 'btc', name: '比特币 2.3 枚', type: 'crypto', value: 120, joint: false, sentimental: false, note: '' },
        { id: 'cash', name: '银行存款', type: 'cash', value: 80, joint: false, sentimental: false, note: '' },
        { id: 'cat', name: '橘猫大橘', type: 'pet', value: 1, joint: false, sentimental: true, note: '8 岁，胖' },
        { id: 'album', name: '老相册与家书', type: 'collectible', value: 0.5, joint: false, sentimental: true, note: '' },
      ],
      members: [
        newMember({ id: 'wife', name: '李阿姨', relation: 'spouse', personality: 'drama', cohabit: true, wish: '房子我得住着' }),
        newMember({ id: 'son', name: '王大宝', relation: 'son', personality: 'greedy', neglect: true, wish: '房子和比特币' }),
        newMember({ id: 'daughter', name: '王小美', relation: 'daughter', personality: 'filial', main_support: true, wish: '相册和大橘' }),
        newMember({ id: 'ex', name: '前妻张姐', relation: 'ex_spouse', personality: 'lawyer', wish: '当年的首付' }),
        newMember({ id: 'cat_agent', name: '大橘', relation: 'pet', personality: 'loyal' }),
        newMember({ id: 'ai', name: '老王 2.0', relation: 'ai_twin', personality: 'mischief' }),
      ],
      rounds: 2,
      speed: 1,
      default_model: null,
      executor_model: null,
      seat: null,
    }),
  },
  {
    id: 'remarriage',
    title: '二婚家庭大战',
    tagline: '继子女有没有扶养关系？丧偶儿媳能不能算第一顺序？老母亲只想养老',
    emoji: '💍',
    build: () => ({
      decedent_name: '陈叔',
      story: '我二婚十二年，继女小雨从八岁跟我长大；亲儿子阿强早年去世，儿媳小芳一直照顾我；老母亲八十多了，跟我一起住。',
      assets: [
        { id: 'house', name: '滨江公寓', type: 'house', value: 450, joint: true, sentimental: false, note: '' },
        { id: 'car', name: '特斯拉 Model Y', type: 'car', value: 22, joint: false, sentimental: false, note: '' },
        { id: 'stock', name: '股票基金', type: 'stock', value: 90, joint: false, sentimental: false, note: '' },
        { id: 'cash', name: '存款', type: 'cash', value: 60, joint: false, sentimental: false, note: '' },
        { id: 'watch', name: '父亲留下的老手表', type: 'collectible', value: 3, joint: false, sentimental: true, note: '' },
      ],
      members: [
        newMember({ id: 'wife2', name: '周姨（现任）', relation: 'spouse', personality: 'calculating', cohabit: true }),
        newMember({ id: 'stepd', name: '小雨（继女）', relation: 'stepchild', personality: 'filial', dependency: true, wish: '老手表' }),
        newMember({ id: 'son', name: '阿强（已故）', relation: 'son', personality: 'chill', deceased: true }),
        newMember({ id: 'gs', name: '小强（孙子）', relation: 'grandchild', personality: 'mischief', parent_id: 'son', wish: '车' }),
        newMember({ id: 'dil', name: '小芳（儿媳）', relation: 'daughter_in_law', personality: 'lawyer', main_support: true }),
        newMember({ id: 'mom', name: '陈老太', relation: 'mother', personality: 'drama', cohabit: true, wish: '养老钱' }),
        newMember({ id: 'ai', name: '陈叔·数字版', relation: 'ai_twin', personality: 'loyal' }),
      ],
      rounds: 2,
      speed: 1,
      default_model: null,
      executor_model: null,
      seat: null,
    }),
  },
  {
    id: 'only-child',
    title: '独生子走后：代位继承',
    tagline: '独生子先走一步，孙女代位；小叔子跳出来说第二顺序也有份；保姆照顾十年',
    emoji: '🌳',
    build: () => ({
      decedent_name: '刘奶奶',
      story: '独生子刘军三年前病故，孙女刘一一由我带大；保姆王姐照顾我十年没涨过工资；小叔子觊觎老宅很久了。',
      assets: [
        { id: 'house', name: '胡同老宅', type: 'house', value: 800, joint: false, sentimental: true, note: '祖传' },
        { id: 'cash', name: '存款', type: 'cash', value: 40, joint: false, sentimental: false, note: '' },
        { id: 'dog', name: '柴犬旺财', type: 'pet', value: 0.8, joint: false, sentimental: true, note: '' },
        { id: 'tea', name: '紫砂壶收藏', type: 'collectible', value: 15, joint: false, sentimental: true, note: '' },
      ],
      members: [
        newMember({ id: 'son', name: '刘军（已故）', relation: 'son', personality: 'chill', deceased: true }),
        newMember({ id: 'gd', name: '刘一一', relation: 'grandchild', personality: 'filial', parent_id: 'son', cohabit: true, wish: '老宅和旺财' }),
        newMember({ id: 'bro', name: '刘二叔', relation: 'sibling', personality: 'greedy', wish: '老宅' }),
        newMember({ id: 'nanny', name: '保姆王姐', relation: 'dependent', personality: 'lawyer', main_support: true }),
        newMember({ id: 'dog_agent', name: '旺财', relation: 'pet', personality: 'loyal' }),
      ],
      rounds: 2,
      speed: 1,
      default_model: null,
      executor_model: null,
      seat: null,
    }),
  },
  {
    id: 'crypto',
    title: '币圈遗产：NFT 与前任',
    tagline: '90 后程序员的遗产：以太坊、无聊猿、一只机械键盘和一个不肯下线的 AI 分身',
    emoji: '🪙',
    build: () => ({
      decedent_name: '阿凯',
      story: '我 32 岁，未婚，父母健在；前女友说我的 NFT 是她帮我抢的；我训练了一个自己的 AI 分身，它比我更懂我；我妹妹一直帮我打理钱。',
      assets: [
        { id: 'eth', name: '以太坊 40 枚', type: 'crypto', value: 110, joint: false, sentimental: false, note: '' },
        { id: 'ape', name: '无聊猿 NFT', type: 'nft', value: 35, joint: false, sentimental: true, note: '' },
        { id: 'cash', name: '存款', type: 'cash', value: 30, joint: false, sentimental: false, note: '' },
        { id: 'kb', name: '客制化机械键盘', type: 'collectible', value: 1, joint: false, sentimental: true, note: '' },
        { id: 'car', name: '二手小电车', type: 'car', value: 8, joint: false, sentimental: false, note: '' },
      ],
      members: [
        newMember({ id: 'dad', name: '凯爸', relation: 'father', personality: 'chill' }),
        newMember({ id: 'mom', name: '凯妈', relation: 'mother', personality: 'drama', wish: '不要那些虚拟的东西' }),
        newMember({ id: 'sis', name: '妹妹阿琳', relation: 'sibling', personality: 'calculating', main_support: true, wish: '以太坊' }),
        newMember({ id: 'ex', name: '前女友 Lena', relation: 'ex_spouse', personality: 'drama', wish: '无聊猿' }),
        newMember({ id: 'ai', name: 'Kai.exe', relation: 'ai_twin', personality: 'mischief' }),
      ],
      rounds: 2,
      speed: 1,
      default_model: null,
      executor_model: null,
      seat: null,
    }),
  },
]
