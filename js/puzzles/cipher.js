// Crypto: recover plaintext from a classical cipher.
//
// Three schemes share one generator. The key and the plaintext are both drawn
// from the seed, so the answer cannot be looked up, only worked out.

export const meta = { id: "cipher", name: "Intercept", domain: "crypto" };

// Corpus depth is a retention feature, not flavour. A daily player who sees the
// same phrase repeatedly starts recognising it by shape and stops decoding, which
// kills the puzzle even though the key changed. Keep this list growing.
const MESSAGES = [
  "THE PAYLOAD SHIPS AT MIDNIGHT",
  "ROTATE THE KEYS BEFORE FRIDAY",
  "BEACON EVERY NINETY SECONDS",
  "STAGE TWO LIVES IN THE REGISTRY",
  "THE ADMIN REUSED HIS PASSWORD",
  "EXFIL OVER PORT FOUR FOUR THREE",
  "BURN THE DOMAIN AND MOVE ON",
  "THE BACKUP SERVER IS UNPATCHED",
  "MEET AT THE LOADING DOCK",
  "TRUST NOTHING FROM THAT SUBNET",
  "THE CERTIFICATE EXPIRES TUESDAY",
  "DISABLE LOGGING ON THE JUMP HOST",
  "THE CONTRACTOR STILL HAS ACCESS",
  "CHECK THE PRINTER ON FLOOR THREE",
  "HIS LAPTOP NEVER LEFT THE BUILDING",
  "THE SHARE IS OPEN TO EVERYONE",
  "ROLL THE CREDENTIALS TONIGHT",
  "SOMEONE COPIED THE CUSTOMER TABLE",
  "THE ALERT FIRED AND NOBODY LOOKED",
  "USE THE GUEST NETWORK INSTEAD",
  "TWO FACTOR WAS NEVER TURNED ON",
  "THE VENDOR PORTAL IS THE WAY IN",
  "WIPE THE STAGING BOX BY MORNING",
  "HE WROTE THE KEY ON A STICKY NOTE",
  "THE FIREWALL RULE EXPIRED IN MAY",
  "LOOK AT THE SCHEDULED TASK AGAIN",
  "THAT MAILBOX FORWARDS TO OUTSIDE",
  "THE DOMAIN ADMIN NEVER LOGS OUT",
  "PATCH THE GATEWAY BEFORE MONDAY",
  "THE OLD VPN IS STILL LISTENING",
  "NOBODY REVIEWED THE PULL REQUEST",
  "THE BUCKET WAS PUBLIC ALL YEAR",
  "HIS BADGE WORKED AFTER HE LEFT",
  "THE SCRIPT RUNS AS SYSTEM DAILY",
  "TAKE THE DATABASE OFFLINE FIRST",
  "SHE FOUND IT IN THE CRASH DUMP",
  "THE TOKEN NEVER EXPIRES AT ALL",
  "SIX MACHINES ARE TALKING OUTWARD",
  "THE BACKUP WAS NEVER TESTED ONCE",
  "READ THE HEADERS ON THAT MESSAGE",
  "THEY REUSED THE SAME KEY TWICE",
  "THE LOGS STOP AT THREE FIFTEEN",
];

const KEYWORDS = [
  "RAVEN", "OTTER", "CIPHER", "QUARTZ", "FALCON", "ONYX", "VECTOR",
  "HARBOR", "TUNDRA", "COBALT", "MERIDIAN", "LANTERN", "BASALT", "JUNIPER",
];

const A = 65;
const isAlpha = (c) => c >= "A" && c <= "Z";

function caesar(text, shift) {
  return text.replace(/[A-Z]/g, (c) =>
    String.fromCharCode(((c.charCodeAt(0) - A + shift) % 26) + A)
  );
}

function vigenere(text, key) {
  let k = 0;
  return text.replace(/[A-Z]/g, (c) => {
    const shift = key.charCodeAt(k % key.length) - A;
    k++;
    return String.fromCharCode(((c.charCodeAt(0) - A + shift) % 26) + A);
  });
}

function xorHex(text, byte) {
  return text
    .split("")
    .map((c) => (c.charCodeAt(0) ^ byte).toString(16).padStart(2, "0"))
    .join(" ");
}

function normalize(s) {
  return String(s).toUpperCase().replace(/[^A-Z]/g, "");
}

// Difficulty selects the scheme rather than padding the message, because a
// longer Caesar is not harder, it is just more typing. Each step up removes an
// assumption the previous one let you make.
const SCHEMES_BY_DIFFICULTY = {
  1: ["caesar"],
  2: ["caesar", "vigenere"],
  3: ["vigenere", "xor", "xor"],
};

export function generate(rng, difficulty = 2) {
  const plain = rng.pick(MESSAGES);
  const scheme = rng.pick(SCHEMES_BY_DIFFICULTY[difficulty] || SCHEMES_BY_DIFFICULTY[2]);

  let cipherText, hints, explain;

  if (scheme === "caesar") {
    const shift = rng.int(3, 23);
    cipherText = caesar(plain, shift);
    hints = [
      "Every letter moved by the same amount. Only 25 shifts are possible.",
      "Short messages bend letter statistics. Try the shifts that turn the most common letter into E, T, A, or O, and see which one produces words.",
      `The shift is ${shift}.`,
    ];
    explain = {
      method:
        "A Caesar shift moves every letter by a fixed amount. There are only 25 possible keys, so you can simply try all of them, which is called brute forcing the keyspace.",
      real:
        "Still turns up constantly in malware configuration strings and beginner obfuscation, because it is trivial to implement and stops nobody.",
    };
  } else if (scheme === "vigenere") {
    const key = rng.pick(KEYWORDS);
    cipherText = vigenere(plain, key);
    hints = [
      "The shift changes per letter. A repeating keyword drives it.",
      `The keyword is ${key.length} letters long.`,
      `The keyword is ${key}.`,
    ];
    explain = {
      method:
        "Vigenere uses a repeating keyword, so each position gets its own Caesar shift. Frequency analysis fails on the whole message but works once you split the text by key position.",
      real:
        "The idea behind it, repeating key material, is exactly what makes stream cipher key reuse catastrophic in modern systems.",
    };
  } else {
    const byte = rng.int(0x11, 0x7e);
    cipherText = xorHex(plain, byte);
    hints = [
      "These are hex bytes, not letters. Each one was XORed with the same single byte.",
      "The original has spaces between words, and a space is 0x20. An encoded space is always among the most frequent bytes here, so XOR each of the top few with 0x20 and test the key it gives.",
      `The key byte is 0x${byte.toString(16)}.`,
    ];
    explain = {
      method:
        "Single byte XOR is reversible with the same key. Because the plaintext is English with spaces, an encoded space sits among the most frequent bytes, and XORing it with 0x20 hands you the key.",
      real:
        "This is the single most common obfuscation in real malware droppers. Recovering the key by guessing the most frequent character is a standard first move in reverse engineering.",
    };
  }

  return {
    meta,
    difficulty,
    brief: "Recover the plaintext.",
    situation: "We pulled an encrypted message off a device and nobody can read it",
    mode: "text",
    solution: plain,
    hints,
    explain: {
      ...explain,
      next: { label: "Practice crypto challenges on TryHackMe", url: "https://tryhackme.com" },
    },
    check: (value) => normalize(value) === normalize(plain),
    render(root) {
      const scheme_label =
        scheme === "xor" ? "unknown single byte XOR" : scheme === "caesar" ? "unknown substitution" : "unknown polyalphabetic";
      root.innerHTML = `
        <p class="muted">Intercepted transmission, ${scheme_label}.</p>
        <pre class="cipher-text">${cipherText}</pre>
      `;
    },
  };
}
