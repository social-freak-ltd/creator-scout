// Categories for Discover: what Shuffle suggests, and the related words highlighted in
// bios and captions so it's obvious at a glance why a creator matched.
// The Shuffle list only holds categories tested live to return plenty of real creators.

export const CATEGORIES = {
  sunglasses: ["sunglasses", "shades", "eyewear", "glasses", "frames", "polarized", "lenses"],
  "pimple patches": ["pimple", "patches", "acne", "spot", "skincare", "breakout", "zit", "blemish"],
  "k-beauty skincare": ["k-beauty", "kbeauty", "korean", "skincare", "skin care", "serum", "toner", "glass skin", "sheet mask"],
  makeup: ["makeup", "make-up", "mua", "beauty", "lipstick", "foundation", "concealer", "mascara", "glam", "cosmetics"],
  "mens basics": ["mens", "menswear", "men's", "basics", "tees", "t-shirt", "essentials", "outfit", "style", "fashion"],
  "running shoes": ["running", "runner", "run", "shoes", "sneakers", "marathon", "trainers", "miles", "5k", "10k"],
  matcha: ["matcha", "green tea", "latte", "tea", "café", "cafe", "whisk"],
  "protein powder": ["protein", "whey", "supplements", "fitness", "gym", "macros", "shake", "gains", "nutrition"],
  candles: ["candle", "candles", "scent", "fragrance", "wax", "home decor", "cozy"],
  swimwear: ["swimwear", "swimsuit", "bikini", "swim", "beach", "resort", "one-piece"],
  "gold jewelry": ["gold", "jewelry", "jewellery", "necklace", "rings", "earrings", "bracelet", "chain", "layering"],
  "hair care": ["hair", "haircare", "curls", "curly", "shampoo", "conditioner", "hairstyle", "blowout"],
  perfume: ["perfume", "fragrance", "scent", "parfum", "cologne", "smell", "notes"],
  "yoga leggings": ["yoga", "leggings", "activewear", "athleisure", "pilates", "workout", "gym"],
  "dog treats": ["dog", "dogs", "puppy", "pup", "treats", "pet", "doggo"],
  sneakers: ["sneakers", "sneaker", "kicks", "shoes", "jordans", "nike", "trainers"],
  coffee: ["coffee", "espresso", "latte", "barista", "café", "cafe", "brew"],
  "lip gloss": ["lip gloss", "lipgloss", "gloss", "lips", "lip", "makeup", "beauty"],
  sunscreen: ["sunscreen", "spf", "sun care", "skincare", "uv", "sunblock"],
  pajamas: ["pajamas", "pyjamas", "pjs", "loungewear", "sleepwear", "cozy", "sleep"],
};

/**
 * Shuffle draws from these: tested live on 2026-10-30 (20 categories), kept where most of the
 * top results were dedicated creators scoring 85+. Dropped: protein powder, lip gloss,
 * sunscreen, yoga leggings and pimple patches (mostly one-off posters), and sunglasses,
 * swimwear, candles, pajamas and matcha (thin or inconsistent between runs).
 */
export const SHUFFLE = ["k-beauty skincare", "perfume", "makeup", "hair care", "coffee", "running shoes", "sneakers", "mens basics", "dog treats", "gold jewelry"];

/** Words to highlight for a search: the category's related words, or the typed words. */
export function relatedWords(keyword, tokens = []) {
  const key = String(keyword || "").trim().toLowerCase();
  const words = new Set([...(CATEGORIES[key] || []), ...tokens]);
  for (const t of tokens) if (t.endsWith("s") && t.length > 4) words.add(t.slice(0, -1)); // "patches" → "patche" is harmless; "candles" → "candle"
  return [...words];
}
