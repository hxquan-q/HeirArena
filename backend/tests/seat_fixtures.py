from app.models import Asset, CaseInput, Goals, Member, SeatConfig


def cat_case(seat: SeatConfig | None = None, **kw) -> CaseInput:
    return CaseInput(
        decedent_name="老王",
        story="儿子王大宝五年没回家，只在借钱时打电话；女儿王小美辞职照顾我三年；我最爱的是橘猫大橘。",
        assets=[
            Asset(id="house", name="学区房", type="house", value=600, joint=True),
            Asset(id="btc", name="比特币 2.3 枚", type="crypto", value=120),
            Asset(id="cash", name="银行存款", type="cash", value=80),
            Asset(id="cat", name="橘猫大橘", type="pet", value=1, sentimental=True),
            Asset(id="album", name="老相册与家书", type="collectible", value=0.5, sentimental=True),
        ],
        members=[
            Member(id="wife", name="李阿姨", relation="spouse", personality="drama",
                   cohabit=True, wish="房子我得住着"),
            Member(id="son", name="王大宝", relation="son", personality="greedy",
                   neglect=True, wish="房子和比特币"),
            Member(id="daughter", name="王小美", relation="daughter", personality="filial",
                   main_support=True, wish="相册和大橘"),
            Member(id="ex", name="前妻张姐", relation="ex_spouse", personality="lawyer",
                   wish="当年的首付"),
            Member(id="cat_agent", name="大橘", relation="pet", personality="loyal"),
            Member(id="ai", name="老王 2.0", relation="ai_twin", personality="mischief"),
        ],
        seat=seat,
        **kw,
    )


def seated(player_id: str = "daughter", goals: dict[str, Goals] | None = None, **kw) -> CaseInput:
    return cat_case(seat=SeatConfig(player_id=player_id, goals=goals or {}), **kw)
