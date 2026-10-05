# Aether Rift: Unity project (scaffold)

`Assets/_Game/Logic` holds engine-free C# (no `UnityEngine`): economy, gacha with pity, battle pass, rank, ad cap,
combat vitals, progression, and the hero catalog ported from the web prototype. It builds as an asmdef in Unity
and is also tested outside Unity:

    dotnet run --project unity/Tests.Logic

Next: wrap `Logic` with Unity-side MonoBehaviours (HeroController, WaveSpawner, HUD) per `game/UNITY_PORT_PLAN.md`.
Draw rolls, purchases and ad rewards must run server-side; the client only requests them.
