// Network: find the hostile flow in a connection table.
//
// No single column decides the answer. Benign rows are allowed to look strange,
// hostile rows are allowed to look ordinary, and every incident type requires
// combining at least two signals. If a player can win by sorting on one column
// or by memorising an address range, the puzzle has failed.

export const meta = { id: "netflow", name: "Uplink", domain: "network" };

const INTERNAL = ["10.0.4.19", "10.0.4.22", "10.0.7.5", "10.0.7.61", "10.0.9.3", "10.0.9.40", "10.0.2.88"];

// Destinations the org runs or has approved. The brief names these, so the skill
// is checking traffic against a known baseline rather than trusting a hunch
// about which numbers look sinister.
const APPROVED = [
  { ip: "52.94.236.248", label: "object storage" },
  { ip: "140.82.121.4", label: "source control" },
  { ip: "151.101.1.140", label: "content delivery" },
  { ip: "10.0.1.10", label: "file server" },
  { ip: "34.117.59.81", label: "telemetry" },
  { ip: "10.0.1.53", label: "dns resolver" },
];

// Unfamiliar addresses. Some carry the incident, some are perfectly ordinary
// traffic, and nothing about the address itself says which.
const UNFAMILIAR = [
  "203.0.113.7", "198.51.100.44", "185.220.101.6", "45.155.205.233",
  "192.0.2.19", "198.51.100.9", "203.0.113.142", "172.67.14.90",
  "104.18.32.7", "185.199.108.153", "13.107.42.14", "199.232.44.31",
];

const kb = (n) => (n < 1024 ? `${n} KB` : `${(n / 1024).toFixed(1)} MB`);

// A fixed interval is a normal thing for an approved monitoring agent to do, so
// it only means something in combination. Unfamiliar noise never runs on a
// timer: a steady heartbeat to an unknown address IS a beacon, and letting noise
// do it gave roughly half of all beacon puzzles a second defensible answer.
function interval(rng, fixed) {
  if (fixed) return `${rng.pick([30, 45, 60, 90, 120, 300])}s`;
  return rng.pick(["varies", "varies", "bursty", "irregular", "varies"]);
}

export function generate(rng, difficulty = 2) {
  const kind = rng.pick(["exfil", "beacon", "tunnel"]);
  const noise = { 1: [5, 7], 2: [9, 12], 3: [14, 19] }[difficulty] || [9, 12];
  const decoyCount = { 1: 0, 2: 1, 3: 2 }[difficulty] ?? 1;

  const approvedPool = rng.shuffle(APPROVED);
  const unfamiliarPool = rng.shuffle(UNFAMILIAR);
  let unfamiliarAt = 0;
  const nextUnfamiliar = () => unfamiliarPool[unfamiliarAt++ % unfamiliarPool.length];

  const rows = [];

  // Ordinary traffic. Roughly a quarter of it goes somewhere unfamiliar, because
  // real networks talk to plenty of addresses nobody has catalogued.
  for (let i = 0; i < rng.int(noise[0], noise[1]); i++) {
    const known = rng.bool(0.75);
    const dest = known ? rng.pick(approvedPool) : { ip: nextUnfamiliar(), label: "" };
    const fixed = !known ? false : dest.label === "telemetry" ? rng.bool(0.6) : rng.bool(0.15);
    rows.push({
      src: rng.pick(INTERNAL),
      dst: dest.ip,
      approved: known,
      port: dest.label === "dns resolver" ? 53 : dest.label === "file server" ? 445 : rng.pick([443, 443, 443, 80]),
      out: rng.int(4, 340),
      in: rng.int(200, 5200),
      count: fixed ? rng.int(40, 300) : rng.int(1, 26),
      interval: interval(rng, fixed),
      hostile: false,
    });
  }

  // Decoys: each one carries the single signal that would give the incident away
  // if that signal were sufficient on its own. It never is.
  const decoys = {
    exfil: () => ({
      src: rng.pick(INTERNAL),
      dst: "10.0.1.10",
      approved: true,
      port: 445,
      out: rng.int(2200, 6000), // large upload, but a backup to the approved file server
      in: rng.int(10, 90),
      count: rng.int(1, 4),
      interval: interval(rng, false),
      hostile: false,
    }),
    beacon: () => ({
      src: rng.pick(INTERNAL),
      dst: "34.117.59.81",
      approved: true,
      port: 443,
      out: rng.int(3, 9), // metronomic, but it is the approved telemetry agent
      in: rng.int(4, 14),
      count: rng.int(300, 700),
      interval: interval(rng, true),
      hostile: false,
    }),
    tunnel: () => ({
      src: rng.pick(INTERNAL),
      dst: "10.0.1.53",
      approved: true,
      port: 53, // port 53, but it is the resolver and the volume is sane
      out: rng.int(30, 120),
      in: rng.int(60, 260),
      count: rng.int(400, 1400),
      interval: interval(rng, false),
      hostile: false,
    }),
  };
  for (let i = 0; i < decoyCount; i++) rows.push(decoys[kind]());

  let hints, explain, brief, situation;
  const badHost = nextUnfamiliar();
  const victim = rng.pick(INTERNAL);
  // At the easiest setting the incident is loud. At the hardest it sits close to
  // the range ordinary traffic already occupies.
  const scale = { 1: 1.6, 2: 1.0, 3: 0.55 }[difficulty] || 1;

  if (kind === "exfil") {
    rows.push({
      src: victim,
      dst: badHost,
      approved: false,
      port: rng.pick([443, 8443, 22]),
      out: Math.round(rng.int(900, 3400) * scale),
      in: rng.int(3, 60),
      count: rng.int(1, 3),
      interval: interval(rng, false),
      hostile: true,
    });
    brief = "Data is leaving that should not be. Find the flow.";
    situation = `Something on ${victim} moved a lot more than it received`;
    hints = [
      "Clients pull far more than they push. Compare the two byte columns against each other, not against zero.",
      "A large upload is not automatically bad. Check whether the destination is one of ours.",
      "You want heavy out, almost nothing in, and a destination that is not on the approved list.",
    ];
    explain = {
      method:
        "Normal client traffic is inbound heavy. A flow pushing far more than it pulls is a transfer, but that alone is not enough, because backups do exactly the same thing. It becomes an incident when the heavy upload goes somewhere that is not ours.",
      real:
        "Attackers favour 443 precisely because the port looks innocent and is rarely inspected. Direction and destination give it away, not the port.",
    };
  } else if (kind === "beacon") {
    rows.push({
      src: victim,
      dst: badHost,
      approved: false,
      port: rng.pick([443, 8080, 8443]),
      out: rng.int(2, 7),
      in: rng.int(2, 9),
      count: Math.round(rng.int(240, 620) * scale),
      interval: interval(rng, true),
      hostile: true,
    });
    brief = "Something is checking in with a controller. Find it.";
    situation = `A host is contacting the same address on a timer`;
    hints = [
      "Volume is not the signal here. Look at how often, and how regularly.",
      "A fixed interval is normal for a monitoring agent. The question is what it is talking to.",
      "You want hundreds of tiny connections on a fixed interval to a destination that is not approved.",
    ];
    explain = {
      method:
        "Implants phone home on a timer, with payloads just big enough to ask for orders. But approved monitoring agents beacon too, so regularity by itself proves nothing. Regular plus unapproved is the finding.",
      real:
        "This is why hunting on timing beats hunting on volume, and why mature implants add jitter. Jitter defeats a naive interval rule and becomes its own signature.",
    };
  } else {
    rows.push({
      src: victim,
      dst: badHost,
      approved: false,
      port: 53,
      out: Math.round(rng.int(700, 2200) * scale),
      in: Math.round(rng.int(700, 2200) * scale),
      count: rng.int(3000, 9000),
      interval: interval(rng, false),
      hostile: true,
    });
    brief = "A protocol is being abused as a transport. Find the flow.";
    situation = `Name resolution traffic is carrying far more than names`;
    hints = [
      "Every row here is plausible on its own. Start from what each port is supposed to be used for.",
      "There is more than one DNS row. Compare their volumes, and check which one is actually our resolver.",
      "You want megabytes over port 53 going to something that is not the approved resolver.",
    ];
    explain = {
      method:
        "DNS leaves almost every network unfiltered, which makes it the classic covert channel. Real resolution is small and cached. Port 53 alone means nothing, since the resolver lives there too. Volume plus a destination that is not the resolver is the finding.",
      real:
        "DNS tunneling walks through egress filtering because port 53 is trusted by default. Comparing against the approved resolver is the cheap detection most teams never write.",
    };
  }

  const shuffled = rng.shuffle(rows);
  const answerIndex = shuffled.findIndex((r) => r.hostile);
  const approvedList = APPROVED.map((a) => `${a.ip} (${a.label})`).join(", ");

  return {
    meta,
    difficulty,
    brief,
    situation,
    mode: "pick",
    solution: `Row ${answerIndex + 1}`,
    hints,
    explain: {
      ...explain,
      next: { label: "Dig into network forensics on Hack The Box", url: "https://www.hackthebox.com" },
    },
    check: (value) => Number(value) === answerIndex,
    render(root, onPick) {
      root.innerHTML = `
        <p class="muted">${shuffled.length} flows, last hour. Approved destinations: ${approvedList}</p>`;
      const wrap = document.createElement("div");
      wrap.className = "tablewrap";
      const table = document.createElement("table");
      table.className = "flowtable";
      table.innerHTML = `
        <thead><tr>
          <th></th><th>Source</th><th>Destination</th><th>Port</th>
          <th>Out</th><th>In</th><th>Conns</th><th>Interval</th>
        </tr></thead>`;
      const tbody = document.createElement("tbody");
      shuffled.forEach((r, i) => {
        const tr = document.createElement("tr");
        tr.className = "flowrow";
        tr.innerHTML = `
          <td class="ln">${String(i + 1).padStart(2, "0")}</td>
          <td>${r.src}</td><td>${r.dst}</td><td>${r.port}</td>
          <td>${kb(r.out)}</td><td>${kb(r.in)}</td>
          <td>${r.count}</td><td>${r.interval}</td>`;
        // Rows are the answer control, so they take focus and respond to the
        // keyboard like the log lines (which are real buttons) already do.
        tr.tabIndex = 0;
        tr.setAttribute("aria-selected", "false");
        const pick = () => {
          tbody.querySelectorAll(".flowrow").forEach((n) => {
            n.classList.remove("selected");
            n.setAttribute("aria-selected", "false");
          });
          tr.classList.add("selected");
          tr.setAttribute("aria-selected", "true");
          onPick(i);
        };
        tr.addEventListener("click", pick);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      root.appendChild(wrap);
    },
  };
}
