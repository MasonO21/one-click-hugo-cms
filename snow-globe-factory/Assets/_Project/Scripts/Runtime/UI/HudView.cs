#if SGF_UGUI
using System.Collections.Generic;
using SnowGlobe.Core;
using UnityEngine;
using UnityEngine.UI;

namespace SnowGlobe.Game
{
    /// <summary>
    /// The always-on HUD, drawn with uGUI and built entirely in code (like the rest of the game, so there are no assets or
    /// .meta files to carry): the status card, exposure meter, crosshair and key prompts, alert cards, toasts and
    /// subtitles. Hud keeps the state; this only shows it. Menus and floating world labels are still drawn by Hud (IMGUI).
    /// </summary>
    public sealed class HudView : MonoBehaviour
    {
        static readonly Color PanelBg = new Color(0.07f, 0.06f, 0.06f, 0.8f);
        static readonly Color Cream = new Color(1f, 0.96f, 0.9f);
        static readonly Color Muted = new Color(0.78f, 0.74f, 0.68f);
        static readonly Color Gold = new Color(0.96f, 0.8f, 0.45f);
        static readonly Color Amber = new Color(1f, 0.78f, 0.25f);
        static readonly Color Red = new Color(1f, 0.36f, 0.3f);

        Hud _hud;
        Font _font;
        Sprite _round;
        RectTransform _root;

        Text _dayLine, _clock, _cash, _stock, _making, _power, _exposureLabel;
        Image _exposureFill;
        RectTransform _prompts, _alerts, _toasts, _subtitles;
        readonly List<GameObject> _pool = new List<GameObject>();

        public static HudView Create(Hud hud)
        {
            var go = new GameObject("HudCanvas");
            go.transform.SetParent(hud.transform, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;
            var view = go.AddComponent<HudView>();
            view._hud = hud;
            view._root = (RectTransform)go.transform;
            view.Build();
            return view;
        }

        // ------------------------------------------------------------ construction

        void Build()
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            _round = RoundedSprite(64, 14);

            // Status card, top-left.
            var card = Panel("StatusCard", _root, PanelBg);
            Anchor(card, new Vector2(0f, 1f), new Vector2(24f, -24f), new Vector2(380f, 0f));
            var v = card.gameObject.AddComponent<VerticalLayoutGroup>();
            v.padding = new RectOffset(20, 20, 16, 16);
            v.spacing = 4f;
            v.childControlHeight = v.childControlWidth = true;
            v.childForceExpandHeight = false;
            card.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var top = Row(card, "TopRow");
            _dayLine = Label(top, "Day", 22, Cream, FontStyle.Bold, TextAnchor.MiddleLeft);
            _clock = Label(top, "Clock", 22, Muted, FontStyle.Normal, TextAnchor.MiddleRight);
            _cash = Label(card, "Cash", 38, Gold, FontStyle.Bold, TextAnchor.MiddleLeft);
            Divider(card);
            _stock = Label(card, "Stock", 18, Cream, FontStyle.Normal, TextAnchor.UpperLeft);
            _making = Label(card, "Making", 18, Muted, FontStyle.Italic, TextAnchor.UpperLeft);
            _power = Label(card, "Power", 20, Red, FontStyle.Bold, TextAnchor.MiddleLeft);
            _power.text = "POWER OUT";

            // Exposure meter inside the card.
            var meterRow = new GameObject("Exposure", typeof(RectTransform)).GetComponent<RectTransform>();
            meterRow.SetParent(card, false);
            meterRow.gameObject.AddComponent<LayoutElement>().preferredHeight = 44f;
            _exposureLabel = Label(meterRow, "ExposureLabel", 16, Muted, FontStyle.Normal, TextAnchor.UpperLeft);
            Stretch(_exposureLabel.rectTransform, new Vector2(0f, 0.5f), Vector2.one);
            var track = Panel("Track", meterRow, new Color(0f, 0f, 0f, 0.55f));
            Stretch(track, Vector2.zero, new Vector2(1f, 0.42f));
            _exposureFill = Panel("Fill", track, Palette.Ok).GetComponent<Image>();
            Stretch((RectTransform)_exposureFill.transform, Vector2.zero, Vector2.one, 3f);

            var hint = Label(_root, "Hint", 16, new Color(1f, 1f, 1f, 0.55f), FontStyle.Normal, TextAnchor.UpperLeft);
            hint.text = "Tab  management      Esc  pause";
            hint.rectTransform.SetParent(card, false);

            // Crosshair and prompts, centre.
            var dot = Panel("Crosshair", _root, new Color(1f, 1f, 1f, 0.85f));
            Anchor(dot, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(7f, 7f));
            dot.pivot = new Vector2(0.5f, 0.5f);
            _prompts = Column("Prompts", _root, new Vector2(0.5f, 0.5f), new Vector2(0f, -40f), TextAnchor.UpperCenter, 6f);

            // Alerts, top-right. Toasts, top-centre. Subtitles, bottom-centre.
            _alerts = Column("Alerts", _root, new Vector2(1f, 1f), new Vector2(-24f, -24f), TextAnchor.UpperRight, 8f);
            _toasts = Column("Toasts", _root, new Vector2(0.5f, 1f), new Vector2(0f, -150f), TextAnchor.UpperCenter, 6f);
            _subtitles = Column("Subtitles", _root, new Vector2(0.5f, 0f), new Vector2(0f, 60f), TextAnchor.LowerCenter, 6f);
            _subtitles.pivot = new Vector2(0.5f, 0f);
        }

        RectTransform Panel(string name, Transform parent, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.sprite = _round;
            img.type = Image.Type.Sliced;
            img.color = color;
            img.raycastTarget = false;
            return (RectTransform)go.transform;
        }

        Text Label(Transform parent, string name, int size, Color color, FontStyle style, TextAnchor align)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.font = _font;
            t.fontSize = size;
            t.fontStyle = style;
            t.color = color;
            t.alignment = align;
            t.supportRichText = true;
            t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            var shadow = go.AddComponent<Shadow>();
            shadow.effectColor = new Color(0f, 0f, 0f, 0.6f);
            shadow.effectDistance = new Vector2(1f, -1f);
            return t;
        }

        RectTransform Row(Transform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var h = go.AddComponent<HorizontalLayoutGroup>();
            h.childControlWidth = h.childControlHeight = true;
            h.childForceExpandWidth = true;
            return (RectTransform)go.transform;
        }

        void Divider(Transform parent)
        {
            var d = Panel("Divider", parent, new Color(1f, 0.9f, 0.7f, 0.18f));
            d.GetComponent<Image>().sprite = null;
            d.gameObject.AddComponent<LayoutElement>().preferredHeight = 2f;
        }

        RectTransform Column(string name, Transform parent, Vector2 anchor, Vector2 offset, TextAnchor align, float spacing)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = rt.pivot = anchor;
            rt.anchoredPosition = offset;
            rt.sizeDelta = new Vector2(900f, 10f);
            var v = go.AddComponent<VerticalLayoutGroup>();
            v.childAlignment = align;
            v.spacing = spacing;
            v.childControlWidth = v.childControlHeight = true;
            v.childForceExpandWidth = v.childForceExpandHeight = false;
            go.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            return rt;
        }

        static void Anchor(RectTransform rt, Vector2 anchor, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = rt.anchorMax = rt.pivot = anchor;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
        }

        static void Stretch(RectTransform rt, Vector2 min, Vector2 max, float inset = 0f)
        {
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.offsetMin = new Vector2(inset, inset);
            rt.offsetMax = new Vector2(-inset, -inset);
        }

        /// <summary>A white rounded rectangle for 9-sliced panels (generated, so there's no sprite asset to ship).</summary>
        static Sprite RoundedSprite(int size, int radius)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, radius, size - radius), cy = Mathf.Clamp(y + 0.5f, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                    byte a = (byte)(Mathf.Clamp01(radius - d + 0.5f) * 255f);
                    px[y * size + x] = new Color32(255, 255, 255, a);
                }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(radius, radius, radius, radius));
        }

        // ------------------------------------------------------------ per frame

        void LateUpdate()
        {
            var root = GameRoot.I;
            bool show = root != null && root.Session != null && !_hud.TitleShown;
            _root.gameObject.GetComponent<Canvas>().enabled = show;
            if (!show) return;

            var s = root.Session;
            var st = s.State;
            string phase = st.Day.Phase == DayPhase.BeforeOpening ? "Before opening" : st.Day.Phase == DayPhase.Open ? (root.ClosingRequested ? "Closing" : "OPEN") : "Closed";
            Set(_dayLine, "Day " + st.Day.Day + "  <color=#" + ColorUtility.ToHtmlStringRGB(st.Day.Phase == DayPhase.Open ? Palette.Ok : Muted) + ">" + phase + "</color>");
            Set(_clock, s.Days.ClockText);
            Set(_cash, "$" + st.Wallet.Cash.ToString("N0") + (st.Wallet.Debt > 0 ? "  <size=18><color=#" + ColorUtility.ToHtmlStringRGB(Red) + ">owed $" + st.Wallet.Debt + "</color></size>" : ""));
            Set(_stock, "Kits " + st.Inventory.GlobeKits + "   Serum " + st.Inventory.SerumCharges + "   Boxes " + st.Inventory.PackagingBoxes +
                        "\nHolding " + s.HoldingCount() + "   On display " + s.Store.DisplayedCount() + "/" + st.ShelfCapacity);
            Set(_making, "Making " + ThemeCatalog.Get(st.ActiveTheme).DisplayName + (s.Orders.PinnedOrder != null ? "  ·  order #" + s.Orders.PinnedOrder.Id + " pinned" : ""));
            _power.gameObject.SetActive(!s.PowerAvailable);
            float exposure = Mathf.Clamp01(st.Exposure.Value / 100f);
            Set(_exposureLabel, "Exposure: " + st.Exposure.Level);
            // Size the fill to the value (a Filled image needs a sprite; the rounded one would clip its ends).
            var fill = (RectTransform)_exposureFill.transform;
            fill.anchorMax = new Vector2(Mathf.Max(0.02f, exposure), 1f);
            _exposureFill.enabled = exposure > 0.005f;
            _exposureFill.color = exposure < 0.5f ? Color.Lerp(Palette.Ok, Amber, exposure * 2f) : Color.Lerp(Amber, Red, (exposure - 0.5f) * 2f);

            int used = 0;
            // Prompts under the crosshair (hidden while a menu is open).
            var i = root.Interactor;
            if (!_hud.AnyModal)
                foreach (var p in new[] { i.PrimaryPrompt, i.SecondaryPrompt, i.CarryPrompt })
                    if (!string.IsNullOrEmpty(p)) Prompt(ref used, _prompts, p);
            // Alerts: standing ones first, then recent events.
            if (root.Customers.WaitingAtCounter != null) Card(ref used, _alerts, "Customer waiting at the counter", Amber, 1f, 420f);
            int loose = root.Horror.LooseCount();
            if (loose > 0) Card(ref used, _alerts, loose + (loose == 1 ? " character loose!" : " characters loose!"), Red, 1f, 420f);
            foreach (var a in _hud.Alerts) Card(ref used, _alerts, a.Text, Red, Fade(a.Until), 420f);
            foreach (var t in _hud.Toasts) Card(ref used, _toasts, t.Text, t.Bad ? Red : Gold, Fade(t.Until), 720f);
            foreach (var sub in _hud.Subtitles) Subtitle(ref used, sub.Text, Fade(sub.Until));
            for (int k = used; k < _pool.Count; k++) if (_pool[k].activeSelf) _pool[k].SetActive(false);
        }

        static float Fade(float until) { return Mathf.Clamp01((until - Time.unscaledTime) / 0.6f); }

        static void Set(Text t, string s) { if (t.text != s) t.text = s; }

        /// <summary>A pooled card: rounded background, optional coloured stripe, a key-cap and a text.</summary>
        GameObject Item(ref int used, RectTransform parent)
        {
            GameObject go;
            if (used < _pool.Count) go = _pool[used];
            else
            {
                go = Panel("Item", parent, PanelBg).gameObject;
                var h = go.AddComponent<HorizontalLayoutGroup>();
                h.padding = new RectOffset(14, 16, 8, 8);
                h.spacing = 10f;
                h.childAlignment = TextAnchor.MiddleLeft;
                h.childControlWidth = h.childControlHeight = true;
                h.childForceExpandWidth = h.childForceExpandHeight = false;
                var stripe = Panel("Stripe", go.transform, Red);
                stripe.GetComponent<Image>().sprite = null;
                var se = stripe.gameObject.AddComponent<LayoutElement>();
                se.preferredWidth = 4f;
                se.minHeight = 22f;
                var key = Panel("Key", go.transform, Cream);
                var kl = key.gameObject.AddComponent<HorizontalLayoutGroup>();
                kl.padding = new RectOffset(9, 9, 2, 2);
                kl.childControlWidth = kl.childControlHeight = true;
                kl.childForceExpandWidth = kl.childForceExpandHeight = false;
                var keyLe = key.gameObject.AddComponent<LayoutElement>();
                keyLe.flexibleWidth = 0f;
                keyLe.minWidth = 30f;
                var keyText = Label(key, "KeyText", 18, new Color(0.1f, 0.08f, 0.07f), FontStyle.Bold, TextAnchor.MiddleCenter);
                keyText.GetComponent<Shadow>().enabled = false;
                Label(go.transform, "Text", 20, Cream, FontStyle.Normal, TextAnchor.MiddleLeft);
                _pool.Add(go);
            }
            used++;
            if (go.transform.parent != parent) go.transform.SetParent(parent, false);
            go.transform.SetAsLastSibling();
            if (!go.activeSelf) go.SetActive(true);
            return go;
        }

        void Fill(GameObject item, string key, string text, Color stripe, float alpha, int size, float maxWidth, bool showStripe, TextAnchor align)
        {
            var bg = item.GetComponent<Image>();
            bg.color = new Color(PanelBg.r, PanelBg.g, PanelBg.b, PanelBg.a * alpha);
            var st = item.transform.Find("Stripe");
            st.gameObject.SetActive(showStripe);
            st.GetComponent<Image>().color = new Color(stripe.r, stripe.g, stripe.b, alpha);
            var k = item.transform.Find("Key");
            k.gameObject.SetActive(key != null);
            if (key != null)
            {
                k.GetComponent<Image>().color = new Color(Cream.r, Cream.g, Cream.b, 0.95f * alpha);
                Set(k.GetComponentInChildren<Text>(), key);
            }
            var t = item.transform.Find("Text").GetComponent<Text>();
            Set(t, text);
            t.fontSize = size;
            t.alignment = align;
            t.color = new Color(Cream.r, Cream.g, Cream.b, alpha);
            var le = t.GetComponent<LayoutElement>();
            if (le == null) le = t.gameObject.AddComponent<LayoutElement>();
            le.preferredWidth = Mathf.Min(maxWidth, t.preferredWidth + 1f);
        }

        void Prompt(ref int used, RectTransform parent, string prompt)
        {
            // "E: Ring up …" → key-cap "E" + text. Prompts without a key show as plain text.
            string key = null, text = prompt;
            int colon = prompt.IndexOf(':');
            if (colon > 0 && colon <= 5 && prompt.Substring(0, colon).Trim().Length > 0 && prompt.Substring(0, colon).IndexOf(' ') < 0)
            {
                key = prompt.Substring(0, colon);
                text = prompt.Substring(colon + 1).Trim();
            }
            Fill(Item(ref used, parent), key, text, Gold, 1f, 21, 720f, false, TextAnchor.MiddleLeft);
        }

        void Card(ref int used, RectTransform parent, string text, Color stripe, float alpha, float maxWidth)
        {
            Fill(Item(ref used, parent), null, text, stripe, alpha, 19, maxWidth, true, TextAnchor.MiddleLeft);
        }

        void Subtitle(ref int used, string line, float alpha)
        {
            int colon = line.IndexOf(": ");
            string text = colon > 0 && colon < 24 ? "<color=#" + ColorUtility.ToHtmlStringRGB(Gold) + ">" + line.Substring(0, colon) + "</color>  " + line.Substring(colon + 2) : "<i>" + line + "</i>";
            Fill(Item(ref used, _subtitles), null, text, Gold, alpha, 22, 1100f, false, TextAnchor.MiddleCenter);
        }
    }
}
#endif
