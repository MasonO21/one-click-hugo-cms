using System;
using System.Collections.Generic;

namespace SnowGlobe.Core
{
    public enum LedgerEnding
    {
        None = 0,
        Signed = 1, // you become the supplier's partner
        Torn = 2,   // you refuse; the shop carries on without H.'s favour
    }

    /// <summary>Story progress. Saved with the game.</summary>
    [Serializable]
    public sealed class StoryState
    {
        /// <summary>Ledger chapters completed, 0..LedgerCatalog.Count.</summary>
        public int Chapter;
        public LedgerEnding Ending;
    }

    /// <summary>
    /// One request from "H.", the supplier. Either a payment (a late-game money sink with a lasting
    /// reward) or a specific boxed globe sent down in the freight-lift crate (paid at a premium).
    /// </summary>
    public sealed class LedgerChapter
    {
        public string Title;
        public int AvailableDay;
        public int Payment;
        public bool NeedsGlobe;
        public ArchetypeId Archetype;
        public bool AnyTheme;
        public ThemeId Theme;
        public QualityTier MinTier;
        public bool RequireCertified;
        /// <summary>H. pays the globe's value times this.</summary>
        public float GlobePriceMultiplier = 1f;
        public string Request;
        public string Reply;
        public string RewardText;
    }

    public static class LedgerCatalog
    {
        public static readonly LedgerChapter[] Chapters =
        {
            new LedgerChapter
            {
                Title = "Dues", AvailableDay = 8, Payment = 400,
                Request = "'Every shop on the list pays dues. Leave $400 in the crate and your account will be marked preferred. — H.'",
                Reply = "'Received. You will find our prices friendlier. Theirs, less so.'",
                RewardText = "Preferred account: new characters cost 15% less.",
            },
            new LedgerChapter
            {
                Title = "A Sample", AvailableDay = 12, NeedsGlobe = true, Archetype = ArchetypeId.Performer, AnyTheme = true,
                MinTier = QualityTier.Fine, GlobePriceMultiplier = 2f,
                Request = "'A sample of your work, please. One of the Performers, boxed, Fine or better. Send it down in the lift crate. We pay double for the privilege.'",
                Reply = "'Charming. It has not stopped bowing. Our clients will be delighted.'",
                RewardText = "H. paid double the globe's value.",
            },
            new LedgerChapter
            {
                Title = "Machine Oil", AvailableDay = 16, Payment = 1000,
                Request = "'Your machines sound tired. We have an oil for that. It comes from the same place they do. $1000, in the crate.'",
                Reply = "'Apply sparingly. Do not let it touch your skin. It remembers.'",
                RewardText = "Machines wear half as fast.",
            },
            new LedgerChapter
            {
                Title = "For the Window", AvailableDay = 22, NeedsGlobe = true, Archetype = ArchetypeId.Watcher, Theme = ThemeId.HauntedManor,
                MinTier = QualityTier.Fine, RequireCertified = true, GlobePriceMultiplier = 2.5f,
                Request = "'A client of ours would like to be watched. A Watcher in the Haunted Manor, inspected, Fine or better. Send it down.'",
                Reply = "'Delivered. It faces the client's bed. They asked for that.'",
                RewardText = "H. paid two and a half times the globe's value.",
            },
            new LedgerChapter
            {
                Title = "The Last Page", AvailableDay = 28, Payment = 4000,
                Request = "'You have done well. There is one page left in the ledger, and your name is already on it. Pay $4000, then sign it, or tear it out.'",
                Reply = "",
                RewardText = "The ledger is closed.",
            },
        };

        public static int Count { get { return Chapters.Length; } }

        public static string EndingText(LedgerEnding ending)
        {
            switch (ending)
            {
                case LedgerEnding.Signed:
                    return "You sign. The ink is warm. By morning the notes in the crates are addressed to you, in your own handwriting, and the cabinets hum when you walk past. " +
                           "(New characters cost 40% less.)";
                case LedgerEnding.Torn:
                    return "You tear the page out and burn it in the sink. The lift stays quiet for a day. Then, as ever, a crate arrives. No note. " +
                           "(The town forgets its suspicions, but characters now cost 25% more.)";
                default:
                    return "";
            }
        }
    }

    /// <summary>Lasting effects of story choices. Systems ask here instead of checking chapters.</summary>
    public static class StoryRules
    {
        public const int DuesChapter = 0;
        public const int OilChapter = 2;

        static bool Done(GameState s, int chapter) { return s.Story != null && s.Story.Chapter > chapter; }

        public static float CharacterCostMultiplier(GameState s)
        {
            if (s.Story != null && s.Story.Ending == LedgerEnding.Signed) return 0.6f;
            if (s.Story != null && s.Story.Ending == LedgerEnding.Torn) return 1.25f;
            return Done(s, DuesChapter) ? 0.85f : 1f;
        }

        public static int CharacterCost(GameState s, ArchetypeId archetype)
        {
            return Math.Max(1, (int)(ArchetypeCatalog.Get(archetype).AcquisitionCost * CharacterCostMultiplier(s) + 0.5f));
        }

        public static float WearMultiplier(GameState s) { return Done(s, OilChapter) ? 0.5f : 1f; }
    }

    public sealed class StoryService
    {
        readonly GameState _state;

        public StoryService(GameState state) { _state = state; }

        StoryState St { get { return _state.Story; } }

        /// <summary>The next unfinished chapter, or null once the ledger is closed.</summary>
        public LedgerChapter Current { get { return St.Chapter < LedgerCatalog.Count ? LedgerCatalog.Chapters[St.Chapter] : null; } }

        public bool IsFinal(LedgerChapter c) { return c != null && c == LedgerCatalog.Chapters[LedgerCatalog.Count - 1]; }

        /// <summary>Has H. asked yet? Requests arrive on their day and wait until they're answered.</summary>
        public bool RequestOpen { get { return Current != null && _state.Day.Day >= Current.AvailableDay; } }

        public bool Finished { get { return St.Ending != LedgerEnding.None; } }

        /// <summary>The envelope in this morning's crate, if a request is newly available today.</summary>
        public string MorningNote()
        {
            var c = Current;
            if (c == null || c.AvailableDay != _state.Day.Day) return null;
            return "A red envelope in the crate: " + c.Request;
        }

        /// <summary>Pays a payment request. The last page also needs the player's choice.</summary>
        public ActionResult Pay(LedgerEnding choice = LedgerEnding.None)
        {
            var c = Current;
            if (c == null) return ActionResult.Fail("The ledger is closed.");
            if (!RequestOpen) return ActionResult.Fail("H. hasn't asked for anything yet.");
            if (c.NeedsGlobe) return ActionResult.Fail("H. wants a globe, not money. Send it down in the lift crate.");
            bool final = IsFinal(c);
            if (final && choice == LedgerEnding.None) return ActionResult.Fail("Sign the page or tear it out.");
            if (!_state.Wallet.TrySpend(c.Payment)) return ActionResult.Fail("H. asks for $" + c.Payment + ".");
            _state.Day.Stats.Expenses += c.Payment;
            St.Chapter++;
            if (final)
            {
                St.Ending = choice;
                if (choice == LedgerEnding.Torn) _state.Exposure.Value = 0f;
                return ActionResult.Ok(LedgerCatalog.EndingText(choice));
            }
            return ActionResult.Ok(c.Reply + " " + c.RewardText);
        }

        public static bool GlobeMatches(LedgerChapter c, Product p, out string reason)
        {
            reason = "";
            if (c == null || !c.NeedsGlobe) { reason = "H. isn't asking for a globe."; return false; }
            if (p == null || p.Stage != ProductStage.Packaged) { reason = "It has to go down boxed."; return false; }
            if (p.Archetype != c.Archetype) { reason = "H. asked for " + ArchetypeCatalog.Get(c.Archetype).DisplayName + "."; return false; }
            if (!c.AnyTheme && p.Theme != c.Theme) { reason = "H. asked for the " + ThemeCatalog.Get(c.Theme).DisplayName + "."; return false; }
            if (QualityModel.Tier(QualityModel.Compute(p)) < c.MinTier) { reason = "Not good enough for H. (needs " + c.MinTier + ")."; return false; }
            if (c.RequireCertified && !p.Certified) { reason = "H. wants it inspected first."; return false; }
            return true;
        }

        public bool CanSend(Product p, out string reason)
        {
            if (!RequestOpen) { reason = "Deliveries only come in, never go out."; return false; }
            return GlobeMatches(Current, p, out reason);
        }

        /// <summary>The globe goes down in the lift. H. pays a premium; it leaves the game like a sale.</summary>
        public int SendGlobe(Product p, out ActionResult result)
        {
            string reason;
            if (!CanSend(p, out reason)) { result = ActionResult.Fail(reason); return 0; }
            var c = Current;
            int paid = (int)(QualityModel.EstimateValue(p) * c.GlobePriceMultiplier + 0.5f);
            p.Stage = ProductStage.Sold;
            p.Location = ProductLocation.Gone();
            p.SoldPrice = paid;
            p.SoldOnDay = _state.Day.Day;
            _state.Wallet.Earn(paid);
            _state.Day.Stats.Revenue += paid;
            _state.Day.Stats.GlobesSold++;
            _state.LifetimeGlobesSold++;
            St.Chapter++;
            result = ActionResult.Ok("The lift groans down. $" + paid + " comes back up in an envelope. " + c.Reply);
            return paid;
        }

        /// <summary>Requests and replies so far, for the Notes tab.</summary>
        public List<string> Log()
        {
            var list = new List<string>();
            for (int i = 0; i < LedgerCatalog.Count; i++)
            {
                var c = LedgerCatalog.Chapters[i];
                if (i > St.Chapter || _state.Day.Day < c.AvailableDay) break;
                list.Add(c.Title + ": " + c.Request);
                if (i < St.Chapter)
                {
                    if (c.Reply.Length > 0) list.Add("  Reply: " + c.Reply + " (" + c.RewardText + ")");
                    else list.Add("  " + LedgerCatalog.EndingText(St.Ending));
                }
            }
            return list;
        }

        public static string Describe(LedgerChapter c)
        {
            if (c == null) return "";
            if (!c.NeedsGlobe) return "Pay $" + c.Payment + " into the ledger.";
            return "Send down a boxed " + ArchetypeCatalog.Get(c.Archetype).DisplayName + " globe" +
                   (c.AnyTheme ? "" : " (" + ThemeCatalog.Get(c.Theme).DisplayName + ")") + ", " + c.MinTier + " or better" +
                   (c.RequireCertified ? ", inspected" : "") + ". Pays " + c.GlobePriceMultiplier + "x its value.";
        }
    }
}
