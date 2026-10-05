using System.Collections.Generic;

namespace AetherRift.Gameplay
{
    public enum SkillType { Dash, Shot, Aoe, Heal, Shield }
    public enum HeroRole { Fighter, Marksman, Mage, Tank, Support, Assassin }

    public sealed class SkillDef
    {
        public string Name; public SkillType Type; public float Cooldown, Damage, Radius, Stun, Amount, Width;
    }
    public sealed class HeroDef
    {
        public string Id, Name; public HeroRole Role;
        public float Hp, Attack, Range, Speed; public bool Ranged; public int CoinCost;
        public SkillDef[] Skills;
    }

    /// <summary>Seed data ported from the web prototype. In Unity these become ScriptableObjects + Remote Config overrides.</summary>
    public static class HeroCatalog
    {
        static SkillDef S(string n, SkillType t, float cd, float dmg = 0, float r = 0, float stun = 0, float amt = 0, float w = 0)
            => new SkillDef { Name = n, Type = t, Cooldown = cd, Damage = dmg, Radius = r, Stun = stun, Amount = amt, Width = w };

        public static readonly IReadOnlyList<HeroDef> All = new[]
        {
            new HeroDef{Id="kael",Name="Kael, Ember Duelist",Role=HeroRole.Fighter,Hp=1500,Attack=62,Range=70,Speed=215,CoinCost=0,Skills=new[]{S("Cinder Dash",SkillType.Dash,4,150),S("Flame Ring",SkillType.Aoe,7,170,150),S("Phoenix Fall",SkillType.Aoe,22,480,240,1.2f)}},
            new HeroDef{Id="lyra",Name="Lyra, Gale Archer",Role=HeroRole.Marksman,Hp=1050,Attack=78,Range=300,Speed=210,Ranged=true,CoinCost=3000,Skills=new[]{S("Wind Volley",SkillType.Shot,3.5f,190),S("Tumble",SkillType.Dash,6),S("Storm Arrow",SkillType.Shot,20,520,0,0,0,30)}},
            new HeroDef{Id="morrow",Name="Morrow, Void Mage",Role=HeroRole.Mage,Hp=950,Attack=70,Range=320,Speed=205,Ranged=true,CoinCost=4500,Skills=new[]{S("Rift Bolt",SkillType.Shot,3,210),S("Gravity Well",SkillType.Aoe,8,180,190,.8f),S("Collapse",SkillType.Aoe,24,620,280)}},
            new HeroDef{Id="seren",Name="Seren, Dawn Healer",Role=HeroRole.Support,Hp=1100,Attack=52,Range=290,Speed=210,Ranged=true,CoinCost=5000,Skills=new[]{S("Light Bolt",SkillType.Shot,3,150),S("Mending Pulse",SkillType.Heal,7,0,260,0,380),S("Sunburst",SkillType.Heal,24,300,340,0,900)}},
            new HeroDef{Id="brum",Name="Brum, Stone Warden",Role=HeroRole.Tank,Hp=2300,Attack=48,Range=70,Speed=195,CoinCost=6000,Skills=new[]{S("Shield Bash",SkillType.Dash,5,110,0,.6f),S("Bulwark",SkillType.Shield,9,0,0,0,420),S("Quake",SkillType.Aoe,21,360,260,1.5f)}},
            new HeroDef{Id="riven",Name="Riven, Night Blade",Role=HeroRole.Assassin,Hp=1200,Attack=85,Range=65,Speed=240,CoinCost=7500,Skills=new[]{S("Shadow Step",SkillType.Dash,3.5f,170),S("Fan of Knives",SkillType.Aoe,6,200,130),S("Execution",SkillType.Dash,16,560,0,.5f)}},
            new HeroDef{Id="thorne",Name="Thorne, Briar Hunter",Role=HeroRole.Marksman,Hp=1150,Attack=72,Range=270,Speed=215,Ranged=true,CoinCost=7500,Skills=new[]{S("Thorn Shot",SkillType.Shot,3,170),S("Root Snare",SkillType.Aoe,8,120,170,1),S("Briar Barrage",SkillType.Shot,19,600,0,0,0,40)}},
            new HeroDef{Id="zeph",Name="Zeph, Storm Monk",Role=HeroRole.Fighter,Hp=1700,Attack=58,Range=75,Speed=225,CoinCost=9000,Skills=new[]{S("Thunder Step",SkillType.Dash,4,140,0,.4f),S("Static Field",SkillType.Aoe,7,190,160),S("Tempest",SkillType.Aoe,22,520,260,1)}},
        };
    }
}
