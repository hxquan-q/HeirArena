export type ActorId = 'judge' | 'son' | 'daughter' | 'wife' | 'cat' | 'ghost'
export interface Actor {
  id: ActorId; name: string; role: string; color: string; bg: string;
  personality: string; goal: string; emoji: string; model: string
}
export interface Heir {
  id: string; name: string; relation: 'spouse' | 'child' | 'parent' | 'sibling' | 'grandparent' | 'other' | 'pet';
  eligible: boolean; actorId?: ActorId
}
export interface Asset { id: string; name: string; category: 'property' | 'cash' | 'collection' | 'other'; value: number; joint: boolean }
export interface Evidence { id: string; title: string; type: string; description: string; verified: boolean }
export interface CourtCase {
  id: string; title: string; subtitle: string; decedent: string; story: string;
  assets: Asset[]; debts: number; heirs: Heir[]; evidence: Evidence[];
  wishes: string; tags: string[]
}
export interface DebateMessage {
  id: string; actorId: ActorId; content: string;
  type: 'statement' | 'objection' | 'evidence' | 'ruling' | 'system';
  phase: number; evidenceIds?: string[]; timestamp?: string
}
export interface AllocationShare { heirId: string; name: string; relation: string; amount: number; percentage: number; color: string; reason: string }
export interface AllocationResult {
  grossAssets: number; spousalProperty: number; debts: number; netEstate: number;
  shares: AllocationShare[]; excluded: { name: string; reason: string }[];
  notes: string[]; basis: { article: string; text: string }[]
}
