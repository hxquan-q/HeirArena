import type { Personality, Relation } from '../types'

interface WishMember {
  relation: Relation | string
  personality: Personality | string
}

export function assetsHint(assets: { name: string; value: number }[]): string {
  return [...assets].sort((a, b) => b.value - a.value).slice(0, 2).map((a) => a.name).join('、') || '遗产'
}

export function defaultWish(member: WishMember, hint: string): string {
  if (member.relation === 'pet') return '继承猫粮/狗粮基金、那张沙发，以及每天的抚摸配额。'
  if (member.relation === 'ai_twin') return '替本尊把想说而没说的话说出来。'
  if (member.relation === 'ex_spouse') return '当年的共同财产没分清，现在要算总账。'
  const table: Record<string, string> = {
    greedy: `把${hint}都收入囊中，越值钱越好。`,
    filial: '留住有纪念意义的东西，让家不散。',
    chill: '随缘，但别欺负人。',
    calculating: '按\'贡献\'重新计算份额，当然算法是自己定的。',
    drama: '所有人都得承认我付出最多。',
    lawyer: '严格依法，一分都不能少。',
    loyal: '陪在真正对主人好的人身边。',
    mischief: '让大家都尴尬一下。',
  }
  return table[member.personality] ?? '希望分得公平。'
}
