import { act, create, type ReactTestRendererJSON } from "react-test-renderer";
import { FoodPicture } from "../src/components/FoodPicture";
import { IdentifyCard } from "../src/components/IdentifyCard";
import { addDays, todayISO } from "../src/lib/dates";
import { demoScan } from "../src/lib/demo";
import {
  canLookUp,
  displayName,
  durationLabel,
  isAllowedPicture,
  isRecognized,
  knownForScan,
  learnedFromCandidate,
  needsLookup,
  shelfLifeSummary,
  toCandidates,
} from "../src/lib/identify";
import { toDrafts, type DraftItem } from "../src/lib/scan";
import {
  estimateShelfLifeDays,
  freezesWell,
  guessCategory,
  knownShelfLifeDays,
  learnedDays,
  setLearnedFoods,
  usualPlace,
} from "../src/lib/shelfLife";
import { resolveTyped, suggestFoods } from "../src/lib/suggest";
import type { FoodCandidate, LearnedFood } from "../src/lib/types";
import { MAX_LEARNED_FOODS, useFoods } from "../src/store/foods";
import { useLookups } from "../src/store/lookups";
import { useScanDraft } from "../src/store/scanDraft";

jest.mock("@react-native-async-storage/async-storage", () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => void data.set(k, v),
      removeItem: async (k: string) => void data.delete(k),
    },
  };
});
// The real billing store loads the RevenueCat SDKs; lookups only need a user id.
jest.mock("../src/store/billing", () => ({
  getProvider: () => ({ getUserId: async () => "test-user" }),
  useBilling: { getState: () => ({ refresh: async () => {} }) },
}));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: {},
}));

function textOf(
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(textOf).join("");
  return (node.children ?? [])
    .map((c) => (typeof c === "string" ? c : textOf(c)))
    .join("");
}

const candidate = (over: Partial<FoodCandidate> = {}): FoodCandidate => ({
  name: "Gochujang",
  brand: null,
  product: null,
  category: "condiments",
  keptIn: "pantry",
  shelfLife: { fridge: 180, freezer: 365, pantry: 365 },
  looks: "Red tub",
  why: "Same tub",
  sourceUrl: "https://en.wikipedia.org/wiki/Gochujang",
  image: {
    url: "https://upload.wikimedia.org/g.jpg",
    credit: "Wikipedia",
    pageUrl: "https://en.wikipedia.org/wiki/Gochujang",
  },
  ...over,
});

const learned = (over: Partial<LearnedFood> = {}): LearnedFood => ({
  id: "f1",
  name: "Gochujang",
  brand: null,
  product: null,
  category: "condiments",
  keptIn: "pantry",
  shelfLife: { fridge: 180, freezer: null, pantry: 365 },
  looks: "Red tub",
  aliases: [],
  imageUrl: null,
  imageCredit: null,
  sourceUrl: null,
  addedOn: "2026-09-30",
  ...over,
});

afterEach(() => {
  act(() => {
    useFoods.getState().clear();
    useLookups.getState().reset();
    useScanDraft.getState().clear();
  });
  setLearnedFoods([]);
});

describe("pictures", () => {
  it("only load from the food databases, or inline in the demo", () => {
    expect(
      isAllowedPicture(
        "https://images.openfoodfacts.org/images/products/1/front.jpg",
      ),
    ).toBe(true);
    expect(isAllowedPicture("https://upload.wikimedia.org/x.jpg")).toBe(true);
    expect(isAllowedPicture("http://upload.wikimedia.org/x.jpg")).toBe(false);
    expect(isAllowedPicture("https://tracker.example/pixel.gif")).toBe(false);
    expect(
      isAllowedPicture("https://upload.wikimedia.org.evil.example/x.jpg"),
    ).toBe(false);
    expect(isAllowedPicture("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isAllowedPicture("data:image/jpeg;base64,AAAA", true)).toBe(true);
    expect(isAllowedPicture("data:text/html;base64,AAAA", true)).toBe(false);
  });
});

describe("toCandidates (the trust boundary for lookup results)", () => {
  it("keeps well-formed candidates and cleans them", () => {
    const out = toCandidates({
      candidates: [
        {
          ...candidate(),
          name: "  gochujang ",
          shelfLife: { fridge: 180.4, freezer: -3, pantry: 99999 },
          sourceUrl: "javascript:alert(1)",
        },
        {
          ...candidate({ name: "Ssamjang" }),
          image: {
            url: "https://evil.example/x.jpg",
            credit: "x",
            pageUrl: "https://evil.example",
          },
        },
        { name: "No category" },
        null,
        "junk",
        candidate({ name: "Doenjang" }),
        candidate({ name: "Fourth" }),
      ],
    });
    expect(out.map((c) => c.name)).toEqual([
      "Gochujang",
      "Ssamjang",
      "Doenjang",
    ]);
    expect(out[0]!.shelfLife).toEqual({ fridge: 180, freezer: 0, pantry: 730 });
    expect(out[0]!.sourceUrl).toBeNull();
    expect(out[1]!.image).toBeNull();
    expect(out[2]!.image?.url).toBe("https://upload.wikimedia.org/g.jpg");
  });

  it("returns nothing for a malformed reply", () => {
    expect(toCandidates(null)).toEqual([]);
    expect(toCandidates({ candidates: "x" })).toEqual([]);
  });
});

describe("what counts as recognised", () => {
  it("knows catalog foods and foods with a shelf-life rule, not unfamiliar ones", () => {
    expect(isRecognized("Milk")).toBe(true);
    expect(isRecognized("Halloumi")).toBe(true);
    expect(isRecognized("Gochujang")).toBe(false);
    expect(isRecognized("Yakult")).toBe(false);
  });

  it("looks up unknown foods, and known-looking names the scan was unsure of", () => {
    const d = (over: Partial<DraftItem>) => ({
      name: "Gochujang",
      category: "condiments" as const,
      confidence: "medium" as const,
      ...over,
    });
    expect(needsLookup(d({}))).toBe(true);
    // "Chili paste" matches a rule, but the scan was unsure and described the packaging.
    expect(
      needsLookup(
        d({
          name: "Chili paste",
          confidence: "low",
          clue: "Red tub, Korean label",
        }),
      ),
    ).toBe(true);
    expect(
      needsLookup(
        d({ name: "Strawberries", category: "produce", confidence: "low" }),
      ),
    ).toBe(false);
    expect(
      needsLookup(d({ name: "Mystery stew", category: "leftovers" })),
    ).toBe(false);
    expect(needsLookup(d({ identified: true }))).toBe(false);
    expect(needsLookup(d({ name: "ab" }))).toBe(false);
    expect(canLookUp({ name: "Yakult", category: "drinks" })).toBe(true);
    expect(canLookUp({ name: "Milk", category: "dairy" })).toBe(false);
  });

  it("the sample scan includes one item to look up", () => {
    return demoScan("fridge").then((res) => {
      const drafts = toDrafts(res, "fridge", []);
      const toLookUp = drafts.filter(needsLookup).map((d) => d.name);
      expect(toLookUp).toEqual(["Chili paste"]);
      const paste = drafts.find((d) => d.name === "Chili paste")!;
      expect(paste.clue).toMatch(/Korean label/);
      expect(paste.photo).toBe(0);
    });
  });
});

describe("taught foods in the shelf-life rules", () => {
  it("win over built-in rules and fall back sensibly", () => {
    expect(knownShelfLifeDays("Gochujang", "condiments", "fridge")).toBeNull();
    setLearnedFoods([learned({ aliases: ["Red pepper paste"] })]);
    expect(estimateShelfLifeDays("gochujang", "condiments", "fridge")).toBe(
      180,
    );
    expect(estimateShelfLifeDays("GOCHUJANG", "other", "pantry")).toBe(365);
    // Freezing not advised: the freezer buys nothing over the fridge, and it is flagged.
    expect(estimateShelfLifeDays("Gochujang", "condiments", "freezer")).toBe(
      180,
    );
    expect(freezesWell("Gochujang", "condiments")).toBe(false);
    expect(usualPlace("Gochujang", "condiments")).toBe("pantry");
    expect(guessCategory("Gochujang")).toBe("condiments");
    // An alias overrides the "peppers" rule it would otherwise match.
    expect(estimateShelfLifeDays("Red pepper paste", "produce", "fridge")).toBe(
      180,
    );
    expect(isRecognized("Gochujang")).toBe(true);
    setLearnedFoods([]);
    expect(knownShelfLifeDays("Gochujang", "condiments", "fridge")).toBeNull();
  });

  it("fill unknown figures from the category and clamp silly ones", () => {
    expect(
      learnedDays(
        {
          category: "dairy",
          shelfLife: { fridge: null, freezer: 9999, pantry: null },
        },
        "freezer",
      ),
    ).toBe(730);
    expect(
      learnedDays(
        {
          category: "dairy",
          shelfLife: { fridge: null, freezer: null, pantry: null },
        },
        "fridge",
      ),
    ).toBe(estimateShelfLifeDays("Zzz unknown", "dairy", "fridge"));
  });
});

describe("learnedFromCandidate", () => {
  it("keeps a real scanned name as an alias, never a vague description", () => {
    const fromName = learnedFromCandidate(
      candidate({ name: "Probiotic drink", brand: "Yakult" }),
      { name: "Yakult bottles", confidence: "medium" },
      "id",
      "2026-09-30",
    );
    expect(fromName.aliases).toEqual([
      "Yakult bottles",
      "Yakult Probiotic drink",
    ]);
    const vague = learnedFromCandidate(
      candidate(),
      { name: "Jar of red paste", confidence: "low", clue: "Red tub" },
      "id",
      "2026-09-30",
    );
    expect(vague.aliases).toEqual([]);
    expect(vague.imageUrl).toBe("https://upload.wikimedia.org/g.jpg");
    expect(vague.imageCredit).toBe("Wikipedia");
  });

  it("labels and summaries read naturally", () => {
    expect(displayName({ name: "Gochujang", brand: "Chung Jung One" })).toBe(
      "Chung Jung One Gochujang",
    );
    expect(displayName({ name: "Yakult", brand: "Yakult" })).toBe("Yakult");
    expect(durationLabel(1)).toBe("1 day");
    expect(durationLabel(21)).toBe("3 weeks");
    expect(durationLabel(180)).toBe("6 months");
    expect(durationLabel(365)).toBe("1 year");
    expect(shelfLifeSummary({ fridge: 180, freezer: null, pantry: 0 })).toBe(
      "Fridge 6 months · Keep chilled · Don't freeze",
    );
  });

  it("known foods for the scan are the newest, trimmed", () => {
    const foods = [
      learned({ name: "Old", addedOn: "2026-01-01" }),
      learned({ name: "New", addedOn: "2026-09-01", looks: "" }),
    ];
    expect(knownForScan(foods, 1)).toEqual([{ name: "New", looks: null }]);
  });
});

describe("food database store", () => {
  it("keeps the shelf-life registry in step", () => {
    act(() => {
      useFoods.getState().add(learned());
    });
    expect(estimateShelfLifeDays("Gochujang", "condiments", "fridge")).toBe(
      180,
    );
    act(() => {
      useFoods.getState().remove("f1");
    });
    expect(knownShelfLifeDays("Gochujang", "condiments", "fridge")).toBeNull();
  });

  it("replaces an entry with the same name, merging aliases, and caps the list", () => {
    act(() => {
      useFoods.getState().add(learned({ aliases: ["A"] }));
      useFoods
        .getState()
        .add(
          learned({
            id: "f2",
            name: "gochujang",
            aliases: ["B"],
            shelfLife: { fridge: 90, freezer: null, pantry: 365 },
          }),
        );
    });
    const foods = useFoods.getState().foods;
    expect(foods).toHaveLength(1);
    expect(foods[0]!.id).toBe("f1");
    expect(foods[0]!.aliases).toEqual(["A", "B"]);
    expect(estimateShelfLifeDays("Gochujang", "condiments", "fridge")).toBe(90);
    act(() => {
      for (let i = 0; i < MAX_LEARNED_FOODS + 5; i++)
        useFoods.getState().add(learned({ id: `x${i}`, name: `Food ${i}` }));
    });
    expect(useFoods.getState().foods).toHaveLength(MAX_LEARNED_FOODS);
  });
});

describe("suggestions include taught foods", () => {
  it("with their picture, spelling and category", () => {
    const taught = [
      {
        name: "Gochujang",
        category: "condiments" as const,
        imageUrl: "https://upload.wikimedia.org/g.jpg",
      },
    ];
    const [first] = suggestFoods("goch", { taught });
    expect(first).toMatchObject({
      name: "Gochujang",
      taught: true,
      imageUrl: "https://upload.wikimedia.org/g.jpg",
    });
    expect(resolveTyped("gochujang", [], taught)).toEqual({
      name: "Gochujang",
      category: "condiments",
    });
    expect(suggestFoods("goch")).toEqual([]);
  });
});

describe("lookup flow (demo mode)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function scanned() {
    const promise = demoScan("fridge");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    const drafts = toDrafts(await promise, "fridge", []);
    act(() => {
      useScanDraft.getState().start("fridge", drafts, null, "scan");
    });
    return useScanDraft
      .getState()
      .drafts.find((d) => d.name === "Chili paste")!;
  }

  async function search(draft: DraftItem) {
    act(() => {
      useLookups.getState().start(draft);
    });
    expect(useLookups.getState().byKey[draft.key]).toEqual({
      status: "searching",
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
  }

  it('finds candidates, and "Yes" saves the food and updates the item', async () => {
    const draft = await scanned();
    await search(draft);
    const found = useLookups.getState().byKey[draft.key];
    expect(found?.status).toBe("found");
    if (found?.status !== "found") return;
    expect(found.candidates.map((c) => c.name)).toEqual([
      "Gochujang",
      "Ssamjang",
    ]);
    expect(found.candidates[0]!.image?.url).toMatch(
      /^data:image\/jpeg;base64,/,
    );

    let food: LearnedFood | null = null;
    act(() => {
      food = useLookups.getState().confirm(draft.key);
    });
    expect(food).not.toBeNull();
    expect(useLookups.getState().byKey[draft.key]).toEqual({
      status: "confirmed",
      name: "Gochujang",
    });
    expect(useFoods.getState().foods.map((f) => f.name)).toEqual(["Gochujang"]);
    // The vague scanned name is not kept as an alias.
    expect(useFoods.getState().foods[0]!.aliases).toEqual([]);
    const updated = useScanDraft
      .getState()
      .drafts.find((d) => d.key === draft.key)!;
    expect(updated).toMatchObject({
      name: "Gochujang",
      category: "condiments",
      identified: true,
      confidence: "high",
      expirySource: "estimate",
    });
    expect(updated.expiresOn).toBe(addDays(todayISO(), 180));
    // Confirming twice does nothing more.
    act(() => {
      useLookups.getState().confirm(draft.key);
    });
    expect(useFoods.getState().foods).toHaveLength(1);
  });

  it('"No" steps through the candidates and ends with no match', async () => {
    const draft = await scanned();
    await search(draft);
    act(() => {
      useLookups.getState().next(draft.key);
    });
    const second = useLookups.getState().byKey[draft.key];
    expect(
      second?.status === "found" && second.candidates[second.index]!.name,
    ).toBe("Ssamjang");
    act(() => {
      useLookups.getState().next(draft.key);
    });
    expect(useLookups.getState().byKey[draft.key]).toEqual({ status: "none" });
    expect(useFoods.getState().foods).toHaveLength(0);
  });

  it("an unknown typed name finds nothing in the demo", async () => {
    act(() => {
      useScanDraft.getState().start("fridge", [], null, "manual");
    });
    act(() => {
      useScanDraft.getState().addManual("Yakult");
    });
    const draft = useScanDraft.getState().drafts[0]!;
    await search(draft);
    expect(useLookups.getState().byKey[draft.key]).toEqual({ status: "none" });
  });

  it("closing the review screen stops a search, and its result is dropped", async () => {
    const draft = await scanned();
    act(() => {
      useLookups.getState().start(draft);
    });
    act(() => {
      useLookups.getState().reset();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(useLookups.getState().byKey).toEqual({});
  });

  it("removing an item cancels its search", async () => {
    const draft = await scanned();
    act(() => {
      useLookups.getState().start(draft);
    });
    act(() => {
      useLookups.getState().cancel(draft.key);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(useLookups.getState().byKey[draft.key]).toBeUndefined();
  });
});

describe("IdentifyCard and FoodPicture render and animate", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const run = () =>
    act(() => {
      jest.advanceTimersByTime(5000);
    });

  it("searching, found, no match, error and confirmed", () => {
    const onRetry = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <IdentifyCard
          draftKey="k"
          lookup={{ status: "searching" }}
          location="fridge"
          onRetry={onRetry}
        />,
      );
    });
    run();
    expect(textOf(tree.toJSON())).toContain("Looking this up online");

    act(() =>
      tree.update(
        <IdentifyCard
          draftKey="k"
          lookup={{
            status: "found",
            candidates: [candidate(), candidate({ name: "Ssamjang" })],
            index: 0,
          }}
          location="fridge"
          onRetry={onRetry}
        />,
      ),
    );
    run();
    let text = textOf(tree.toJSON());
    expect(text).toContain("Is this your item?");
    expect(text).toContain("1 of 2");
    expect(text).toContain("Gochujang");
    expect(text).toContain("Keeps about 6 months in the fridge");
    expect(text).toContain("Picture: Wikipedia");
    expect(text).toContain("Source: en.wikipedia.org");
    expect(
      tree.root.findAll((n) => n.props.testID === "lookup-yes").length,
    ).toBeGreaterThan(0);

    act(() =>
      tree.update(
        <IdentifyCard
          draftKey="k"
          lookup={{
            status: "found",
            candidates: [
              candidate({
                image: null,
                shelfLife: { fridge: 5, freezer: null, pantry: 0 },
              }),
            ],
            index: 0,
          }}
          location="freezer"
          onRetry={onRetry}
        />,
      ),
    );
    run();
    text = textOf(tree.toJSON());
    expect(text).toContain("No picture found online");
    expect(text).toContain("Freezing is not recommended");

    act(() =>
      tree.update(
        <IdentifyCard
          draftKey="k"
          lookup={{ status: "none" }}
          location="fridge"
          onRetry={onRetry}
        />,
      ),
    );
    run();
    expect(textOf(tree.toJSON())).toContain("No match");

    act(() =>
      tree.update(
        <IdentifyCard
          draftKey="k"
          lookup={{ status: "error", message: "Could not reach Fridge Pulse." }}
          location="fridge"
          onRetry={onRetry}
        />,
      ),
    );
    run();
    expect(textOf(tree.toJSON())).toContain("Could not reach Fridge Pulse.");
    act(() =>
      tree.root
        .findAll(
          (n) =>
            n.props.testID === "lookup-retry" &&
            typeof n.props.onPress === "function",
        )[0]!
        .props.onPress(),
    );
    expect(onRetry).toHaveBeenCalled();

    act(() =>
      tree.update(
        <IdentifyCard
          draftKey="k"
          lookup={{ status: "confirmed", name: "Gochujang" }}
          location="fridge"
          onRetry={onRetry}
        />,
      ),
    );
    run();
    expect(textOf(tree.toJSON())).toContain(
      "Identified as Gochujang. Saved to your foods.",
    );
  });

  it("a picture that fails to load falls back to the emoji", () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <FoodPicture
          uri="https://upload.wikimedia.org/x.jpg"
          emoji="🌶️"
          emojiSize={20}
          style={{ width: 40, height: 40 }}
        />,
      );
    });
    const image = tree.root.findAll(
      (n) => typeof n.props.onError === "function",
    )[0]!;
    act(() => image.props.onLoad());
    run();
    act(() => image.props.onError());
    expect(textOf(tree.toJSON())).toContain("🌶️");
  });
});
