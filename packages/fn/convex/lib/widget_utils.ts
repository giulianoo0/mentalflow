export type WidgetType = "task" | "person" | "event" | "note";
export type LinkKind = "mentions" | "related" | "depends_on";

export type WidgetInput = {
  type: WidgetType;
  title: string;
  description?: string;
  dueDate?: number;
  priority?: "high" | "medium" | "low";
  isCompleted?: boolean;
  person?: {
    role?: string | null;
    contactInfo?: string | null;
  };
  event?: {
    startsAt?: number | null;
    endsAt?: number | null;
    location?: string | null;
  };
  relatedTitles?: string[];
};

export type WidgetLinkInput = {
  fromTitle: string;
  toTitle: string;
  kind: LinkKind;
};

export type WidgetUpsert = {
  type: WidgetType;
  title: string;
  description?: string;
  data: Record<string, unknown>;
  titleNormalized: string;
  sourceMessageNanoId?: string;
  fingerprint: string;
  isPlaceholder?: boolean;
};

export type LinkUpsert = {
  fromFingerprint: string;
  toFingerprint: string;
  kind: LinkKind;
  fingerprint: string;
};

export type WidgetSummary = {
  fingerprint: string;
  type: WidgetType;
  title: string;
  titleNormalized: string;
  description?: string;
  data: Record<string, unknown>;
  nanoId: string;
};

export function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const body = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",");
  return `{${body}}`;
}

export function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = sha256Bytes(bytes);
  return Array.from(hash)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sha256Bytes(message: Uint8Array) {
  const k = [
    0x428a2f98,
    0x71374491,
    0xb5c0fbcf,
    0xe9b5dba5,
    0x3956c25b,
    0x59f111f1,
    0x923f82a4,
    0xab1c5ed5,
    0xd807aa98,
    0x12835b01,
    0x243185be,
    0x550c7dc3,
    0x72be5d74,
    0x80deb1fe,
    0x9bdc06a7,
    0xc19bf174,
    0xe49b69c1,
    0xefbe4786,
    0x0fc19dc6,
    0x240ca1cc,
    0x2de92c6f,
    0x4a7484aa,
    0x5cb0a9dc,
    0x76f988da,
    0x983e5152,
    0xa831c66d,
    0xb00327c8,
    0xbf597fc7,
    0xc6e00bf3,
    0xd5a79147,
    0x06ca6351,
    0x14292967,
    0x27b70a85,
    0x2e1b2138,
    0x4d2c6dfc,
    0x53380d13,
    0x650a7354,
    0x766a0abb,
    0x81c2c92e,
    0x92722c85,
    0xa2bfe8a1,
    0xa81a664b,
    0xc24b8b70,
    0xc76c51a3,
    0xd192e819,
    0xd6990624,
    0xf40e3585,
    0x106aa070,
    0x19a4c116,
    0x1e376c08,
    0x2748774c,
    0x34b0bcb5,
    0x391c0cb3,
    0x4ed8aa4a,
    0x5b9cca4f,
    0x682e6ff3,
    0x748f82ee,
    0x78a5636f,
    0x84c87814,
    0x8cc70208,
    0x90befffa,
    0xa4506ceb,
    0xbef9a3f7,
    0xc67178f2,
  ];

  const h = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  const bitLength = message.length * 8;
  const withPadding = new Uint8Array(
    ((message.length + 9 + 63) >> 6) * 64,
  );
  withPadding.set(message);
  withPadding[message.length] = 0x80;

  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 4, bitLength >>> 0, false);
  view.setUint32(withPadding.length - 8, Math.floor(bitLength / 2 ** 32), false);

  const w = new Uint32Array(64);

  for (let i = 0; i < withPadding.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 =
        rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hVal = h[7];

    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hVal + s1 + ch + k[t] + w[t]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      hVal = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hVal) >>> 0;
  }

  const hash = new Uint8Array(32);
  for (let i = 0; i < h.length; i++) {
    hash[i * 4] = (h[i] >>> 24) & 0xff;
    hash[i * 4 + 1] = (h[i] >>> 16) & 0xff;
    hash[i * 4 + 2] = (h[i] >>> 8) & 0xff;
    hash[i * 4 + 3] = h[i] & 0xff;
  }
  return hash;
}

function rotr(value: number, shift: number) {
  return (value >>> shift) | (value << (32 - shift));
}

export function widgetCanonicalPayload(widget: WidgetInput) {
  const titleNormalized = normalizeTitle(widget.title);
  return {
    type: widget.type,
    title: widget.title.trim(),
    titleNormalized,
    description: widget.description?.trim() || "",
    dueDate: widget.dueDate ?? null,
    priority: widget.priority ?? null,
    isCompleted: widget.isCompleted ?? null,
    person: widget.person
      ? {
          role: widget.person.role?.trim() || "",
          contactInfo: widget.person.contactInfo?.trim() || "",
        }
      : null,
    event: widget.event
      ? {
          startsAt: widget.event.startsAt ?? null,
          endsAt: widget.event.endsAt ?? null,
          location: widget.event.location?.trim() || "",
        }
      : null,
    relatedTitles:
      widget.relatedTitles?.map((title) => normalizeTitle(title)) || [],
  };
}

export function fingerprintWidget(widget: WidgetInput) {
  return sha256Hex(stableStringify(widgetCanonicalPayload(widget)));
}

export function fingerprintLink(payload: {
  fromFingerprint: string;
  toFingerprint: string;
  kind: LinkKind;
}) {
  return sha256Hex(stableStringify(payload));
}

export function widgetDataFromInput(widget: WidgetInput) {
  return {
    dueDate: widget.dueDate,
    priority: widget.priority,
    isCompleted: widget.isCompleted,
    person: widget.person,
    event: widget.event,
    relatedTitles: widget.relatedTitles || [],
  };
}
