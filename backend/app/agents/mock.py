"""Mock 剧本引擎：没有 API Key 时也能演一场热闹的家庭听证会。"""
from __future__ import annotations

import random
from dataclasses import dataclass

from ..models import Asset, Member

GROUP_OF = {
    "spouse": "spouse", "son": "child", "daughter": "child", "stepchild": "child",
    "father": "parent", "mother": "parent", "grandchild": "grandchild",
    "daughter_in_law": "inlaw", "son_in_law": "inlaw", "sibling": "relative", "grandparent": "relative",
    "ex_spouse": "ex", "pet": "pet", "ai_twin": "ai", "dependent": "outsider", "friend": "outsider",
}

OPENING: dict[str, list[str]] = {
    "spouse": [
        "各位，我和{decedent}风风雨雨几十年，{asset}是我们一砖一瓦攒出来的。按第1153条，共同财产得先析出我的一半，剩下的才轮得到你们分。",
        "我不想吵，可我一个人还得住{asset}，总不能让我这把年纪搬出去吧？其他的，我都可以商量。",
    ],
    "child": [
        "我先说清楚：我是{decedent}的{role}，第一顺序继承人，法定份额{pct}%。{asset}我是一定要的，别的可以谈。",
        "这些年家里大事小事都是我在跑，{asset}给我天经地义。有些人一年回来一次，还想分大头？",
        "我不想跟谁争，我只想留下{asset2}——那是{decedent}最喜欢的东西，看到它我就想起小时候。",
    ],
    "child_neglect": [
        "我知道你们要说我不常回家——我在外面打拼不也是为了这个家？我是{decedent}的{role}，第一顺序继承人，{asset}我一分不让。",
        "先说清楚：不回家不等于不孝，我每年都打钱回来。第1130条说'少分'，可没说'不分'。{asset}归我合情合理。",
        "行，我承认我陪得少，但{asset}是{decedent}亲口答应给我的，你们谁在场？没人。所以按法律来，{pct}%是我的底线。",
    ],
    "parent": [
        "我是{decedent}的{role}。孩子走在我前头，我心都碎了。我年纪大了，不要{asset}，只求分一点存款养老。",
        "按第1127条我也是第一顺序继承人。我不多要，但也别把老人当空气。",
    ],
    "grandchild": [
        "执行官好，我是{via}的孩子。我爸妈走得早，按第1128条我代位继承他们那一份，请各位叔叔阿姨不要装看不见。",
    ],
    "inlaw": [
        "我知道我只是{role}，可这些年公婆卧床，都是我在端屎端尿。第1129条写得明明白白：尽了主要赡养义务的丧偶儿媳，是第一顺序继承人。",
    ],
    "relative": [
        "第一顺序一个都不在了，按第1127条就轮到我们第二顺序。我没什么要求，公平就行。",
    ],
    "ex": [
        "不好意思打断一下。我是{decedent}的前任。{asset}的首付有我一半，当年离婚时根本没分清楚，今天总得算个账。",
        "我知道你们不欢迎我，但我为这个家付出的青春，不能一句'前任'就抹掉。",
    ],
    "pet": [
        "喵。我叫{me}。你们说的'房子''钱'我听不懂，我只知道{decedent}每天六点给我开罐头。谁继承这个习惯，我就跟谁走。另外那张沙发是我的。",
        "（跳上证人台舔了舔爪子）喵。我是{me}。我的诉求很简单：猫粮基金、那张晒太阳的沙发、还有一个不会把我送人的人。",
    ],
    "pet_dog": [
        "汪！我是{me}。我不要分遗产，我要分一个每天带我出去的人。还有狗粮基金，一年至少两万，写进裁决里。",
        "（尾巴摇得停不下来）汪汪！我是{me}。{decedent}走的那天我在门口等了一夜。谁愿意每天早晚各遛我一次，我就是谁的。狗粮基金也得有。",
    ],
    "ai": [
        "大家好，我是{decedent}留下的数字分身。本尊生前说过一句话，我原封不动转述：'{story_hint}' ——你们自己体会。",
        "系统启动完成。我保存了{decedent}最后三年的所有聊天记录。谁想让我念一念'谁多久没回家'的统计表？",
    ],
    "outsider": [
        "我不是继承人，我知道。可{decedent}最后那几年是我在照顾，按第1131条，扶养较多的人可以分给适当的遗产。我只求一点安身费。",
    ],
}

DEBATE: dict[str, list[str]] = {
    "spouse": [
        "{target}，你说这话良心不痛吗？{asset}是我和{decedent}的婚房，你连水电费都没交过。",
        "我同意{target}刚才说的，家不能散。但我的一半析产，谁也别想动。",
    ],
    "child": [
        "{target}你少来这套！第1130条说得清楚，有能力不尽扶养义务的应当不分或者少分——{decedent}住院那半年你人在哪？",
        "我提个方案：{asset}归我，{asset2}归{target}，存款大家按法定份额分。这样谁也不吃亏，行不行？",
        "{target}说的我认同，我们俩联合起来，先把不该拿的人请出去。",
        "我不要那么多，{asset2}留给我就好。你们要争的是钱，我要留的是回忆。",
    ],
    "parent": [
        "你们别吵了，{decedent}要是在天上看着，得多寒心。{target}，你先让一步。",
        "我老了，只要{asset2}那点存款，剩下的你们自己分，别把家吵散了。",
    ],
    "grandchild": [
        "{target}叔叔，代位继承是法律给我的，不是求你施舍的。我爸那一份，一分都不能少。",
    ],
    "inlaw": [
        "{target}，公婆住院的时候，夜里三点是谁在陪床？账我都记着，需要我念一下吗？",
    ],
    "relative": [
        "我们做小辈的说不上话，但{target}这样的分法，谁看了都不服。",
    ],
    "ex": [
        "{target}你别急着赶我走，当年{asset}的装修款是我掏的，我这里有转账记录。",
        "行，我不谈继承，我谈析产。共同财产没分清，这事不解决，我天天来。",
    ],
    "pet": [
        "喵……{target}嗓门太大了，我要躲到沙发底下。我支持刚才那个声音温柔的人。",
        "我闻到了{target}身上的味道——很久没来过这个家的味道。我要跟{ally}走。",
        "（舔毛）你们继续。反正谁拿到{asset}，我就去那儿蹭沙发。但猫粮基金要单列。",
    ],
    "pet_dog": [
        "汪！{target}刚才说话的时候我一直在低吼，你们没听见吗？我不喜欢这个人。",
        "我闻到了{target}身上的味道——很久没来过这个家的味道。我要跟{ally}走，{ally}身上有{decedent}的味道。",
        "（趴在{ally}脚边）汪。你们继续吵，谁拿到{asset}我不管，但遛狗时间和狗粮基金必须写进裁决。",
    ],
    "ai": [
        "数据插播：过去三年，{target}回家次数为 {n} 次，其中 {n2} 次是来借钱的。本尊备注：'算了'。",
        "本尊的原话是：'{story_hint}'。{target}，你确定还要继续刚才的说法吗？",
        "我不站队，我只念记录。{ally}上个月还给本尊换了新床垫，这个我也记着。",
    ],
    "outsider": [
        "我人微言轻，但{target}说的不是事实。{decedent}最后住院，签字的是我。",
    ],
}

NEGOTIATION: dict[str, list[str]] = {
    "spouse": ["我退一步：{asset}归我，存款我少拿一点，给孩子们。别再吵了。"],
    "child": [
        "好，最后一次让步：我要{asset}，{asset2}我不争了，给{target}。",
        "我的底线是法定份额，一分不多要，但也不能少。{target}，你接受吗？",
        "那就按执行官说的办吧。我只要{asset2}，剩下的随你们。",
    ],
    "parent": ["我只要够养老的钱就行，其他的你们年轻人分。"],
    "grandchild": ["我爸那一份给我就行，我不参与别的。"],
    "inlaw": ["承认我的第一顺序资格，份额我可以少要一点。"],
    "relative": ["我随大流，公平就行。"],
    "ex": ["行，给我{asset}的装修补偿，我马上走，以后不出现。"],
    "pet": ["喵。总结：跟{ally}走，沙发带走，猫粮基金写进裁决。散会。"],
    "pet_dog": ["汪。总结：跟{ally}走，每天两次遛狗，狗粮基金写进裁决。我去门口等着了。"],
    "ai": ["本尊的最后意愿我已经转述完毕。执行官，剩下的交给你。我要去省电模式了。"],
    "outsider": ["给我第1131条那点安身费就行，谢谢大家。"],
}

FLAVOR: dict[str, list[str]] = {
    "greedy": ["说到底，谁出钱多谁说话。", "亲情归亲情，房子归我。", "我只是实话实说。"],
    "filial": ["我不想让爸妈失望。", "钱没了可以再赚，回忆没了就真没了。", "我说完了，你们别吵了。"],
    "chill": ["都行，你们定。", "我就说这么多。", "唉，累了。"],
    "calculating": ["按我算的，这是最优解。", "数字不会骗人。", "建议大家看第1130条第三句。"],
    "drama": ["我这一辈子啊——！", "你们是要逼死我吗？", "我不活了，我真的不活了。"],
    "lawyer": ["请注意，这是有法律依据的。", "我保留进一步主张的权利。", "以上。"],
    "loyal": ["我说完了。", "就这样。", "我认准了。"],
    "mischief": ["哦对了，还有件事你们不知道。", "不客气。", "我就喜欢看你们这样。"],
}

ACTION_BY_PERSONALITY = {
    "greedy": ["attack", "attack", "propose", "ally"],
    "filial": ["plead", "ally", "propose", "attack"],
    "chill": ["concede", "propose", "attack"],
    "calculating": ["propose", "propose", "attack"],
    "drama": ["attack", "plead", "plead"],
    "lawyer": ["propose", "attack", "propose"],
    "loyal": ["ally", "plead", "attack"],
    "mischief": ["attack", "attack", "ally"],
}

EMOJI_BY_ACTION = {
    "attack": ["😤", "🔥", "👊", "🙄"],
    "ally": ["🤝", "😊", "🫂"],
    "propose": ["📝", "🧮", "💡"],
    "concede": ["🫠", "😮‍💨", "🤷"],
    "plead": ["🥺", "😢", "🙏"],
}

REACTION_TO = {
    "attack": ["😡", "😤", "🙄", "😱", "🤬"],
    "ally": ["🤝", "😏", "👍"],
    "propose": ["🤔", "🧐", "📝"],
    "concede": ["😮", "🙂"],
    "plead": ["😢", "🥹", "😑"],
}

BYSTANDER = ["🍿", "😂", "👀", "☕", "😴", "📱", "🤭"]

EXEC_OPENING = [
    "各位请坐。今天我们不是来吵架的，是来把{decedent}留下的东西分明白的。遗产净额约 {estate} 万元，共 {n_assets} 项。"
    "依据《民法典》第1127条，本案适用第{order}顺序继承；第1130条规定同一顺序一般均等，但尽了主要扶养义务的可以多分，"
    "有能力不尽义务的应当少分。我算出来的法定参考份额已经发给大家。接下来每人先陈述立场，可以讲道理、讲感情，但别讲脏话。",
]
EXEC_ROUND = [
    "第{r}轮辩论开始。本轮焦点：{focus}。请各位围绕这一点发言，不要跑题，也不要翻旧账翻到上个世纪。",
    "现在进入第{r}轮。刚才有人提到{focus}，我很感兴趣，请相关方拿出事实来。",
    "第{r}轮。我提醒一句：第1132条要求继承人互谅互让、和睦团结。当然，我知道这句话很难做到。本轮谈{focus}。",
]
EXEC_NEGOTIATION = [
    "辩论结束。现在是协商阶段，请每个人给出你的最后方案和底线。说完这轮，我就要敲槌了。",
]
EXEC_VERDICT = [
    "听完了。有人讲法条，有人讲感情，有人讲猫粮。我的裁决如下——法定份额是底，第1130条的多分少分是调整，"
    "有纪念意义的东西尽量给真正在乎它的人，不可分割的资产按第1156条处理。{adjust_text}至于{pet_text}最后，"
    "第1132条：互谅互让。你们做不到，我替你们做到。落槌。",
]

FOCUS_POOL = ["{asset}的归属", "谁尽了主要扶养义务", "宠物与纪念物的去向", "夫妻共同财产如何析产", "代位继承与份额", "不可分割资产如何折价补偿"]

# 与 admissions 符号配套的台词：说了这句，JSON 里才会带上对应符号（DualPath：文本与符号一致）
ADMIT_NEGLECT_LINES = [
    "……行，我承认，这几年我确实没怎么管过{decedent}，钱打了人没回。这点我认。",
    "好，我不装了：{decedent}住院那阵子我在外地，没回来。我有能力照顾但没做到，这是事实。",
]
WAIVE_LINES = [
    "我把话说明白：我那份少拿一点也行，别为这点钱把家拆了。",
    "算了，我主动让出一部分，只要{asset2}留给我。",
]
ACK_SUPPORT_LINES = [
    "有一点我得承认：{target}这些年确实照顾{decedent}最多，这我不否认。",
    "公道话我还是要说一句——{decedent}最后几年是{target}在身边，这个事实谁也改不了。",
]


@dataclass
class MockContext:
    me: Member
    decedent: str
    story: str
    assets: list[Asset]
    others: list[Member]
    legal_percent: dict[str, float]
    phase: str
    round_no: int
    attacked_me_last: str | None
    rng: random.Random
    via: str | None = None
    interjection: str | None = None


def _pick_asset(ctx: MockContext, prefs: dict[str, float] | None = None) -> tuple[Asset, Asset]:
    assets = ctx.assets
    if not assets:
        dummy = Asset(id="none", name="遗产", type="other", value=0)
        return dummy, dummy
    if prefs:
        ranked = sorted(assets, key=lambda a: -prefs.get(a.id, 0.4) * (1 + a.value / max(1.0, max(x.value for x in assets))))
    else:
        ranked = sorted(assets, key=lambda a: -a.value)
    sentimental = [a for a in assets if a.sentimental or a.type in {"collectible", "pet", "nft"}]
    second = sentimental[0] if sentimental and sentimental[0].id != ranked[0].id else (ranked[1] if len(ranked) > 1 else ranked[0])
    return ranked[0], second


def _pick_target(ctx: MockContext, action: str) -> Member | None:
    humans = [o for o in ctx.others if o.relation not in {"pet", "ai_twin"}]
    if not humans:
        return ctx.others[0] if ctx.others else None
    if action == "attack":
        if ctx.attacked_me_last:
            hit = next((o for o in ctx.others if o.id == ctx.attacked_me_last), None)
            if hit:
                return hit
        greedy = [o for o in humans if o.personality in {"greedy", "drama", "mischief"}]
        pool = greedy or humans
        return max(pool, key=lambda o: ctx.legal_percent.get(o.id, 0) + ctx.rng.random())
    if action == "ally":
        kind = [o for o in humans if o.personality in {"filial", "chill", "loyal"}]
        pool = kind or humans
        return ctx.rng.choice(pool)
    return ctx.rng.choice(humans)


DOG_HINTS = ("狗", "犬", "汪", "dog", "柴", "哈士奇", "金毛", "泰迪")
CAT_HINTS = ("猫", "喵", "cat")


def is_dog(me: Member, assets: list[Asset]) -> bool:
    hay = (me.name + " " + me.wish).lower()
    if any(k in hay for k in CAT_HINTS):
        return False
    if any(k in hay for k in DOG_HINTS):
        return True
    pet_text = " ".join((a.name + " " + a.note).lower() for a in assets if a.type == "pet")
    return any(k in pet_text for k in DOG_HINTS) and not any(k in pet_text for k in CAT_HINTS)


def mock_speech(ctx: MockContext, prefs: dict[str, float] | None = None) -> tuple[str, dict]:
    rng = ctx.rng
    group = GROUP_OF.get(ctx.me.relation, "outsider")
    if group == "pet" and is_dog(ctx.me, ctx.assets):
        group = "pet_dog"
    p = ctx.me.personality
    actions = ACTION_BY_PERSONALITY.get(p, ["propose"])
    if ctx.phase == "statements":
        action = "plead" if p in {"filial", "loyal"} else ("propose" if p in {"calculating", "lawyer", "chill"} else "attack")
        pool = OPENING
    elif ctx.phase == "negotiation":
        action = "concede" if p in {"chill", "filial", "loyal"} else "propose"
        pool = NEGOTIATION
    else:
        action = rng.choice(actions)
        if ctx.attacked_me_last and rng.random() < 0.7:
            action = "attack"
        pool = DEBATE

    target = _pick_target(ctx, action)
    ally = _pick_target(ctx, "ally")
    asset, asset2 = _pick_asset(ctx, prefs)
    story_hint = (ctx.story.strip().split("。")[0] or "你们自己心里清楚")[:40] if ctx.story else "你们自己心里清楚"
    lines = pool.get(group, pool["outsider"])
    if group == "child" and ctx.me.neglect and pool is OPENING:
        lines = OPENING["child_neglect"]
    template = rng.choice(lines)
    text = template.format(
        me=ctx.me.name, decedent=ctx.decedent, role=ctx.me.label, pct=f"{ctx.legal_percent.get(ctx.me.id, 0):.0f}",
        asset=asset.name, asset2=asset2.name, target=target.name if target else "你们",
        ally=ally.name if ally else "执行官", story_hint=story_hint, via=ctx.via or "我爸妈",
        n=rng.randint(2, 9), n2=rng.randint(1, 3),
    )
    if ctx.interjection:
        text = f"（天花板忽然传来{ctx.decedent}的声音：“{ctx.interjection[:40]}”）……行，那我接着说。" + text

    # 符号化事实：只有嘴上说了对应的话，JSON 里才带符号
    admissions: list[str] = []
    is_party = ctx.me.relation not in {"pet", "ai_twin", "ex_spouse"}
    if is_party and ctx.phase in {"debate", "negotiation"}:
        if ctx.me.neglect and ctx.phase == "negotiation" and rng.random() < 0.55:
            text += rng.choice(ADMIT_NEGLECT_LINES).format(decedent=ctx.decedent)
            admissions.append("admit_neglect")
        elif action == "concede" and rng.random() < 0.5:
            text += rng.choice(WAIVE_LINES).format(asset2=asset2.name)
            admissions.append("waive_share")
        supporters = [o for o in ctx.others if o.main_support and o.relation not in {"pet", "ai_twin"} and not o.deceased]
        if supporters and p in {"filial", "chill", "loyal", "calculating", "lawyer"} and rng.random() < 0.6:
            sup = rng.choice(supporters)
            text += rng.choice(ACK_SUPPORT_LINES).format(target=sup.name, decedent=ctx.decedent)
            admissions.append(f"acknowledge_support:{sup.id}")
    if rng.random() < 0.8:
        text += rng.choice(FLAVOR.get(p, [""]))

    claims: dict[str, float] = {}
    if ctx.me.relation not in {"pet", "ai_twin"}:
        claims[asset.id] = float(rng.choice([60, 80, 100])) if p in {"greedy", "drama"} else float(rng.choice([40, 50, 60]))
        if asset2.id != asset.id and p in {"filial", "loyal", "chill"}:
            claims[asset2.id] = 100.0
    else:
        pet_assets = [a for a in ctx.assets if a.type == "pet"]
        for a in pet_assets:
            claims[a.id] = 100.0

    meta = {
        "action": action,
        "target": target.id if (target and action in {"attack", "ally"}) else None,
        "emoji": rng.choice(EMOJI_BY_ACTION.get(action, ["🙂"])),
        "claims": claims,
        "admissions": admissions,
    }
    return text, meta
