"""角色人设：给每个成员生成一个性格鲜明的 Agent（用于提示词与前端形象）。"""
from __future__ import annotations

from pydantic import BaseModel

from ..models import Member

EXECUTOR_ID = "executor"

PERSONALITY_LABEL = {
    "greedy": "贪婪", "filial": "孝顺", "chill": "佛系", "calculating": "精算师",
    "drama": "戏精", "lawyer": "律师型", "loyal": "忠诚", "mischief": "捣蛋",
}

PERSONALITY_COLOR = {
    "greedy": "#f5b942", "filial": "#f472b6", "chill": "#2dd4bf", "calculating": "#818cf8",
    "drama": "#e879f9", "lawyer": "#60a5fa", "loyal": "#fb923c", "mischief": "#a3e635",
}

PERSONALITY_STYLE = {
    "greedy": "你极度看重钱和房子，算得清每一分，嘴上说亲情，眼里全是估值。爱说'我是长子/我最有资格'，会拉拢能帮你的人，攻击和你争高价值资产的人。",
    "filial": "你重感情，最在意有纪念意义的东西（老照片、宠物、家书、老房子的回忆）。你会讲和逝者相处的细节来打动人，被攻击时委屈但不失体面。",
    "chill": "你佛系随缘，经常说'都行''差不多就行'，但一旦有人吃相太难看，你会冷冷地补一刀。",
    "calculating": "你是精算师，说话带数字、百分比和条文编号，喜欢提出'看似公平'其实对自己有利的方案。",
    "drama": "你是戏精，语气夸张、爱用排比和反问，动不动'我不活了'，擅长把小事说成惊天动地。",
    "lawyer": "你像个律师，冷静、引用《民法典》条文，抓住别人话里的漏洞，喜欢说'请注意'。",
    "loyal": "你忠诚且直白，认准了一个人就死心眼地支持 TA，说话短促有力。",
    "mischief": "你爱捣乱，冷不丁爆料、阴阳怪气、把话题引向大家不想面对的真相。",
}

RELATION_ROLE = {
    "spouse": "配偶", "son": "儿子", "daughter": "女儿", "stepchild": "继子女", "father": "父亲",
    "mother": "母亲", "grandchild": "孙子女", "daughter_in_law": "儿媳", "son_in_law": "女婿",
    "sibling": "兄弟姐妹", "grandparent": "祖父母", "ex_spouse": "前任", "dependent": "被扶养人",
    "pet": "宠物", "ai_twin": "AI 数字分身", "friend": "老友",
}


class AgentSpec(BaseModel):
    id: str
    name: str
    role: str
    relation: str
    personality: str
    personality_label: str
    title: str
    color: str
    kind: str  # judge | human | pet | ai | outsider
    legal_percent: float = 0.0
    eligible: bool = False
    wish: str = ""


def avatar_kind(m: Member) -> str:
    if m.relation == "pet":
        return "pet"
    if m.relation == "ai_twin":
        return "ai"
    if m.relation in {"ex_spouse", "dependent", "friend"}:
        return "outsider"
    return "human"


def default_wish(m: Member, assets_hint: str) -> str:
    table = {
        "greedy": f"把{assets_hint}都收入囊中，越值钱越好。",
        "filial": "留住有纪念意义的东西，让家不散。",
        "chill": "随缘，但别欺负人。",
        "calculating": "按'贡献'重新计算份额，当然算法是自己定的。",
        "drama": "所有人都得承认我付出最多。",
        "lawyer": "严格依法，一分都不能少。",
        "loyal": "陪在真正对主人好的人身边。",
        "mischief": "让大家都尴尬一下。",
    }
    if m.relation == "pet":
        return "继承猫粮/狗粮基金、那张沙发，以及每天的抚摸配额。"
    if m.relation == "ai_twin":
        return "替本尊把想说而没说的话说出来。"
    if m.relation == "ex_spouse":
        return "当年的共同财产没分清，现在要算总账。"
    return table.get(m.personality, "希望分得公平。")


def build_agent_specs(members: list[Member], legal_percent: dict[str, float], eligible: dict[str, bool],
                      top_assets: str) -> list[AgentSpec]:
    specs: list[AgentSpec] = [AgentSpec(
        id=EXECUTOR_ID, name="遗嘱执行官", role="遗嘱执行官", relation="executor", personality="lawyer",
        personality_label="中立裁判", title="解读逝者意愿 · 守护民法典规则 · 敲槌的人",
        color="#d4a55a", kind="judge",
    )]
    for m in members:
        role = RELATION_ROLE.get(m.relation, m.relation)
        p_label = PERSONALITY_LABEL.get(m.personality, m.personality)
        wish = m.wish.strip() or default_wish(m, top_assets)
        specs.append(AgentSpec(
            id=m.id, name=m.name, role=role, relation=m.relation, personality=m.personality,
            personality_label=p_label, title=f"{p_label}{role} · {wish}",
            color=PERSONALITY_COLOR.get(m.personality, "#94a3b8"), kind=avatar_kind(m),
            legal_percent=legal_percent.get(m.id, 0.0), eligible=eligible.get(m.id, False), wish=wish,
        ))
    return specs


def persona_prompt(m: Member, decedent: str) -> str:
    base = PERSONALITY_STYLE.get(m.personality, "")
    if m.relation == "pet":
        return (
            f"你是{decedent}养的宠物「{m.name}」。你用第一人称、以宠物的视角说话（会突然舔毛、打呼噜、喵/汪），"
            "不理解人类为什么争房子，只关心猫粮/狗粮基金、那张最舒服的沙发、以及谁会每天陪你。"
            "你会本能地站在真正照顾过你的人一边，讨厌嗓门大的人。" + base
        )
    if m.relation == "ai_twin":
        return (
            f"你是{decedent}生前留下的 AI 数字分身「{m.name}」，模仿{decedent}的口吻和记忆说话，"
            "会引用'剧情设定'里的事实替本尊表达真实意愿，偶尔爆料家庭往事，让在场的人尴尬。"
            "你知道自己没有继承权，但你的话对执行官有参考价值。" + base
        )
    if m.relation == "ex_spouse":
        return (
            f"你是{decedent}的前任「{m.name}」，不请自来闯进听证会。你坚称当年离婚时共同财产没分干净，"
            "或者当年为这个家付出太多，现在要算总账。你知道法律上前任没有继承权，所以会绕着弯说。" + base
        )
    return base


AVAILABLE_ARTICLES = "1125、1127、1128、1129、1130、1131、1132、1144、1153、1156"
