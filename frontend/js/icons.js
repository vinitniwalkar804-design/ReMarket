/**
 * Lucide icon set, vendored from lucide-react 0.468.0 (ISC).
 *
 * Geometry is copied verbatim from the icon nodes lucide-react renders, and the
 * wrapper reproduces its <svg> attributes and its `lucide <name>` class exactly,
 * so these icons render pixel-identically to the React build. Vendored rather
 * than imported so the vanilla frontend needs no icon dependency at runtime.
 *
 * Do not hand-edit. Regenerate from the lucide-react package instead.
 */

const SVG_DEFAULTS = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Matches lucide-react's toKebabCase. */
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * Build an icon element.
 * @param {string} name  PascalCase lucide icon name.
 * @param {object} [opts]
 * @param {number} [opts.size=24]       width/height in px.
 * @param {string} [opts.color]         stroke colour; defaults to currentColor.
 * @param {number} [opts.strokeWidth=2]
 * @param {boolean} [opts.absoluteStrokeWidth]  keep the stroke visually equal
 *   across sizes, exactly as lucide does.
 * @param {string} [opts.className]     extra classes, appended after `lucide`.
 * @param {string} [opts.title]         accessible name; omit for decorative icons.
 */
export function icon(name, opts = {}) {
  const canonicalName = ALIASES[name] || name;
  const nodes = ICONS[canonicalName];
  if (!nodes) throw new Error(`Unknown lucide icon: ${name}`);

  const { size = 24, color = "currentColor", strokeWidth = 2 } = opts;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  for (const [k, v] of Object.entries(SVG_DEFAULTS)) svg.setAttribute(k, String(v));
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("stroke", color);
  svg.setAttribute(
    "strokeWidth",
    String(opts.absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth)
  );
  // lucide-react always emits `lucide lucide-<kebab>` first, then merged extras.
  // The kebab name is the CANONICAL one even when called via a deprecated
  // alias, because that is what the component carries internally.
  svg.setAttribute(
    "class",
    `lucide lucide-${kebab(canonicalName)}${opts.className ? ` ${opts.className}` : ""}`
  );

  if (opts.title) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = opts.title;
    svg.appendChild(t);
    svg.setAttribute("role", "img");
  }

  for (const [tag, attrs] of nodes) {
    const child = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) {
      // lucide's "key" is a React-only identity hint with no DOM equivalent.
      if (k === "key") continue;
      child.setAttribute(k, String(v));
    }
    svg.appendChild(child);
  }

  return svg;
}

export const ICONS = {
  Activity: [["path",{"d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2","key":"169zse"}]],
  Armchair: [["path",{"d":"M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3","key":"irtipd"}],["path",{"d":"M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z","key":"1qyhux"}],["path",{"d":"M5 18v2","key":"ppbyun"}],["path",{"d":"M19 18v2","key":"gy7782"}]],
  ArrowLeft: [["path",{"d":"m12 19-7-7 7-7","key":"1l729n"}],["path",{"d":"M19 12H5","key":"x3x0zl"}]],
  ArrowLeftRight: [["path",{"d":"M8 3 4 7l4 4","key":"9rb6wj"}],["path",{"d":"M4 7h16","key":"6tx8e3"}],["path",{"d":"m16 21 4-4-4-4","key":"siv7j2"}],["path",{"d":"M20 17H4","key":"h6l3hr"}]],
  ArrowRight: [["path",{"d":"M5 12h14","key":"1ays0h"}],["path",{"d":"m12 5 7 7-7 7","key":"xquz4c"}]],
  ArrowUpRight: [["path",{"d":"M7 7h10v10","key":"1tivn9"}],["path",{"d":"M7 17 17 7","key":"1vkiza"}]],
  BadgeCheck: [["path",{"d":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z","key":"3c2336"}],["path",{"d":"m9 12 2 2 4-4","key":"dzmm74"}]],
  BadgePercent: [["path",{"d":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z","key":"3c2336"}],["path",{"d":"m15 9-6 6","key":"1uzhvr"}],["path",{"d":"M9 9h.01","key":"1q5me6"}],["path",{"d":"M15 15h.01","key":"lqbp3k"}]],
  Banknote: [["rect",{"width":"20","height":"12","x":"2","y":"6","rx":"2","key":"9lu3g6"}],["circle",{"cx":"12","cy":"12","r":"2","key":"1c9p78"}],["path",{"d":"M6 12h.01M18 12h.01","key":"113zkx"}]],
  Bell: [["path",{"d":"M10.268 21a2 2 0 0 0 3.464 0","key":"vwvbt9"}],["path",{"d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326","key":"11g9vi"}]],
  BellRing: [["path",{"d":"M10.268 21a2 2 0 0 0 3.464 0","key":"vwvbt9"}],["path",{"d":"M22 8c0-2.3-.8-4.3-2-6","key":"5bb3ad"}],["path",{"d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326","key":"11g9vi"}],["path",{"d":"M4 2C2.8 3.7 2 5.7 2 8","key":"tap9e0"}]],
  Bike: [["circle",{"cx":"18.5","cy":"17.5","r":"3.5","key":"15x4ox"}],["circle",{"cx":"5.5","cy":"17.5","r":"3.5","key":"1noe27"}],["circle",{"cx":"15","cy":"5","r":"1","key":"19l28e"}],["path",{"d":"M12 17.5V14l-3-3 4-3 2 3h2","key":"1npguv"}]],
  BookOpen: [["path",{"d":"M12 7v14","key":"1akyts"}],["path",{"d":"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z","key":"ruj8y"}]],
  Brain: [["path",{"d":"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z","key":"l5xja"}],["path",{"d":"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z","key":"ep3f8r"}],["path",{"d":"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4","key":"1p4c4q"}],["path",{"d":"M17.599 6.5a3 3 0 0 0 .399-1.375","key":"tmeiqw"}],["path",{"d":"M6.003 5.125A3 3 0 0 0 6.401 6.5","key":"105sqy"}],["path",{"d":"M3.477 10.896a4 4 0 0 1 .585-.396","key":"ql3yin"}],["path",{"d":"M19.938 10.5a4 4 0 0 1 .585.396","key":"1qfode"}],["path",{"d":"M6 18a4 4 0 0 1-1.967-.516","key":"2e4loj"}],["path",{"d":"M19.967 17.484A4 4 0 0 1 18 18","key":"159ez6"}]],
  Building2: [["path",{"d":"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z","key":"1b4qmf"}],["path",{"d":"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2","key":"i71pzd"}],["path",{"d":"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2","key":"10jefs"}],["path",{"d":"M10 6h4","key":"1itunk"}],["path",{"d":"M10 10h4","key":"tcdvrf"}],["path",{"d":"M10 14h4","key":"kelpxr"}],["path",{"d":"M10 18h4","key":"1ulq68"}]],
  Calculator: [["rect",{"width":"16","height":"20","x":"4","y":"2","rx":"2","key":"1nb95v"}],["line",{"x1":"8","x2":"16","y1":"6","y2":"6","key":"x4nwl0"}],["line",{"x1":"16","x2":"16","y1":"14","y2":"18","key":"wjye3r"}],["path",{"d":"M16 10h.01","key":"1m94wz"}],["path",{"d":"M12 10h.01","key":"1nrarc"}],["path",{"d":"M8 10h.01","key":"19clt8"}],["path",{"d":"M12 14h.01","key":"1etili"}],["path",{"d":"M8 14h.01","key":"6423bh"}],["path",{"d":"M12 18h.01","key":"mhygvu"}],["path",{"d":"M8 18h.01","key":"lrp35t"}]],
  Calendar: [["path",{"d":"M8 2v4","key":"1cmpym"}],["path",{"d":"M16 2v4","key":"4m81vk"}],["rect",{"width":"18","height":"18","x":"3","y":"4","rx":"2","key":"1hopcy"}],["path",{"d":"M3 10h18","key":"8toen8"}]],
  ChartColumn: [["path",{"d":"M3 3v16a2 2 0 0 0 2 2h16","key":"c24i48"}],["path",{"d":"M18 17V9","key":"2bz60n"}],["path",{"d":"M13 17V5","key":"1frdt8"}],["path",{"d":"M8 17v-3","key":"17ska0"}]],
  ChartPie: [["path",{"d":"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z","key":"pzmjnu"}],["path",{"d":"M21.21 15.89A10 10 0 1 1 8 2.83","key":"k2fpak"}]],
  Check: [["path",{"d":"M20 6 9 17l-5-5","key":"1gmf2c"}]],
  ChevronDown: [["path",{"d":"m6 9 6 6 6-6","key":"qrunsl"}]],
  ChevronLeft: [["path",{"d":"m15 18-6-6 6-6","key":"1wnfg3"}]],
  ChevronRight: [["path",{"d":"m9 18 6-6-6-6","key":"mthhwq"}]],
  CircleAlert: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["line",{"x1":"12","x2":"12","y1":"8","y2":"12","key":"1pkeuh"}],["line",{"x1":"12","x2":"12.01","y1":"16","y2":"16","key":"4dfq90"}]],
  CircleCheck: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["path",{"d":"m9 12 2 2 4-4","key":"dzmm74"}]],
  CircleX: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["path",{"d":"m15 9-6 6","key":"1uzhvr"}],["path",{"d":"m9 9 6 6","key":"z0biqf"}]],
  ClipboardList: [["rect",{"width":"8","height":"4","x":"8","y":"2","rx":"1","ry":"1","key":"tgr4d6"}],["path",{"d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2","key":"116196"}],["path",{"d":"M12 11h4","key":"1jrz19"}],["path",{"d":"M12 16h4","key":"n85exb"}],["path",{"d":"M8 11h.01","key":"1dfujw"}],["path",{"d":"M8 16h.01","key":"18s6g9"}]],
  Clock: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["polyline",{"points":"12 6 12 12 16 14","key":"68esgv"}]],
  Coins: [["circle",{"cx":"8","cy":"8","r":"6","key":"3yglwk"}],["path",{"d":"M18.09 10.37A6 6 0 1 1 10.34 18","key":"t5s6rm"}],["path",{"d":"M7 6h1v4","key":"1obek4"}],["path",{"d":"m16.71 13.88.7.71-2.82 2.82","key":"1rbuyh"}]],
  Compass: [["path",{"d":"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z","key":"9ktpf1"}],["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}]],
  CreditCard: [["rect",{"width":"20","height":"14","x":"2","y":"5","rx":"2","key":"ynyp8z"}],["line",{"x1":"2","x2":"22","y1":"10","y2":"10","key":"1b3vmo"}]],
  Crown: [["path",{"d":"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z","key":"1vdc57"}],["path",{"d":"M5 21h14","key":"11awu3"}]],
  Database: [["ellipse",{"cx":"12","cy":"5","rx":"9","ry":"3","key":"msslwz"}],["path",{"d":"M3 5V19A9 3 0 0 0 21 19V5","key":"1wlel7"}],["path",{"d":"M3 12A9 3 0 0 0 21 12","key":"mv7ke4"}]],
  ExternalLink: [["path",{"d":"M15 3h6v6","key":"1q9fwt"}],["path",{"d":"M10 14 21 3","key":"gplh6r"}],["path",{"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6","key":"a6xqqp"}]],
  Eye: [["path",{"d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0","key":"1nclc0"}],["circle",{"cx":"12","cy":"12","r":"3","key":"1v7zrd"}]],
  EyeOff: [["path",{"d":"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49","key":"ct8e1f"}],["path",{"d":"M14.084 14.158a3 3 0 0 1-4.242-4.242","key":"151rxh"}],["path",{"d":"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143","key":"13bj9a"}],["path",{"d":"m2 2 20 20","key":"1ooewy"}]],
  Flag: [["path",{"d":"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z","key":"i9b6wo"}],["line",{"x1":"4","x2":"4","y1":"22","y2":"15","key":"1cm3nv"}]],
  Flame: [["path",{"d":"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z","key":"96xj49"}]],
  FlaskConical: [["path",{"d":"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2","key":"18mbvz"}],["path",{"d":"M6.453 15h11.094","key":"3shlmq"}],["path",{"d":"M8.5 2h7","key":"csnxdl"}]],
  Gamepad2: [["line",{"x1":"6","x2":"10","y1":"11","y2":"11","key":"1gktln"}],["line",{"x1":"8","x2":"8","y1":"9","y2":"13","key":"qnk9ow"}],["line",{"x1":"15","x2":"15.01","y1":"12","y2":"12","key":"krot7o"}],["line",{"x1":"18","x2":"18.01","y1":"10","y2":"10","key":"1lcuu1"}],["path",{"d":"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z","key":"mfqc10"}]],
  Gauge: [["path",{"d":"m12 14 4-4","key":"9kzdfg"}],["path",{"d":"M3.34 19a10 10 0 1 1 17.32 0","key":"19p75a"}]],
  Gift: [["rect",{"x":"3","y":"8","width":"18","height":"4","rx":"1","key":"bkv52"}],["path",{"d":"M12 8v13","key":"1c76mn"}],["path",{"d":"M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7","key":"6wjy6b"}],["path",{"d":"M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5","key":"1ihvrl"}]],
  GitBranch: [["line",{"x1":"6","x2":"6","y1":"3","y2":"15","key":"17qcm7"}],["circle",{"cx":"18","cy":"6","r":"3","key":"1h7g24"}],["circle",{"cx":"6","cy":"18","r":"3","key":"fqmcym"}],["path",{"d":"M18 9a9 9 0 0 1-9 9","key":"n2h4wq"}]],
  GitCompareArrows: [["circle",{"cx":"5","cy":"6","r":"3","key":"1qnov2"}],["path",{"d":"M12 6h5a2 2 0 0 1 2 2v7","key":"1yj91y"}],["path",{"d":"m15 9-3-3 3-3","key":"1lwv8l"}],["circle",{"cx":"19","cy":"18","r":"3","key":"1qljk2"}],["path",{"d":"M12 18H7a2 2 0 0 1-2-2V9","key":"16sdep"}],["path",{"d":"m9 15 3 3-3 3","key":"1m3kbl"}]],
  Globe: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["path",{"d":"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20","key":"13o1zl"}],["path",{"d":"M2 12h20","key":"9i4pu4"}]],
  Grid3x3: [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2","key":"afitv7"}],["path",{"d":"M3 9h18","key":"1pudct"}],["path",{"d":"M3 15h18","key":"5xshup"}],["path",{"d":"M9 3v18","key":"fh3hqa"}],["path",{"d":"M15 3v18","key":"14nvp0"}]],
  Handshake: [["path",{"d":"m11 17 2 2a1 1 0 1 0 3-3","key":"efffak"}],["path",{"d":"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4","key":"9pr0kb"}],["path",{"d":"m21 3 1 11h-2","key":"1tisrp"}],["path",{"d":"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3","key":"1uvwmv"}],["path",{"d":"M3 4h8","key":"1ep09j"}]],
  Heart: [["path",{"d":"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z","key":"c3ymky"}]],
  Hexagon: [["path",{"d":"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z","key":"yt0hxn"}]],
  History: [["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","key":"1357e3"}],["path",{"d":"M3 3v5h5","key":"1xhq8a"}],["path",{"d":"M12 7v5l4 2","key":"1fdv2h"}]],
  Hourglass: [["path",{"d":"M5 22h14","key":"ehvnwv"}],["path",{"d":"M5 2h14","key":"pdyrp9"}],["path",{"d":"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22","key":"1d314k"}],["path",{"d":"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2","key":"1vvvr6"}]],
  ImagePlus: [["path",{"d":"M16 5h6","key":"1vod17"}],["path",{"d":"M19 2v6","key":"4bpg5p"}],["path",{"d":"M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5","key":"1ue2ih"}],["path",{"d":"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21","key":"1xmnt7"}],["circle",{"cx":"9","cy":"9","r":"2","key":"af1f0g"}]],
  Inbox: [["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12","key":"o97t9d"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z","key":"oot6mr"}]],
  Info: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["path",{"d":"M12 16v-4","key":"1dtifu"}],["path",{"d":"M12 8h.01","key":"e9boi3"}]],
  Laptop: [["path",{"d":"M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16","key":"tarvll"}]],
  Layers: [["path",{"d":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z","key":"zw3jo"}],["path",{"d":"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12","key":"1wduqc"}],["path",{"d":"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17","key":"kqbvx6"}]],
  LayoutDashboard: [["rect",{"width":"7","height":"9","x":"3","y":"3","rx":"1","key":"10lvy0"}],["rect",{"width":"7","height":"5","x":"14","y":"3","rx":"1","key":"16une8"}],["rect",{"width":"7","height":"9","x":"14","y":"12","rx":"1","key":"1hutg5"}],["rect",{"width":"7","height":"5","x":"3","y":"16","rx":"1","key":"ldoo1y"}]],
  LayoutGrid: [["rect",{"width":"7","height":"7","x":"3","y":"3","rx":"1","key":"1g98yp"}],["rect",{"width":"7","height":"7","x":"14","y":"3","rx":"1","key":"6d4xhi"}],["rect",{"width":"7","height":"7","x":"14","y":"14","rx":"1","key":"nxv5o0"}],["rect",{"width":"7","height":"7","x":"3","y":"14","rx":"1","key":"1bb6yr"}]],
  Leaf: [["path",{"d":"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z","key":"nnexq3"}],["path",{"d":"M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12","key":"mt58a7"}]],
  Lightbulb: [["path",{"d":"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5","key":"1gvzjb"}],["path",{"d":"M9 18h6","key":"x1upvd"}],["path",{"d":"M10 22h4","key":"ceow96"}]],
  Link2: [["path",{"d":"M9 17H7A5 5 0 0 1 7 7h2","key":"8i5ue5"}],["path",{"d":"M15 7h2a5 5 0 1 1 0 10h-2","key":"1b9ql8"}],["line",{"x1":"8","x2":"16","y1":"12","y2":"12","key":"1jonct"}]],
  List: [["path",{"d":"M3 12h.01","key":"nlz23k"}],["path",{"d":"M3 18h.01","key":"1tta3j"}],["path",{"d":"M3 6h.01","key":"1rqtza"}],["path",{"d":"M8 12h13","key":"1za7za"}],["path",{"d":"M8 18h13","key":"1lx6n3"}],["path",{"d":"M8 6h13","key":"ik3vkj"}]],
  LoaderCircle: [["path",{"d":"M21 12a9 9 0 1 1-6.219-8.56","key":"13zald"}]],
  Lock: [["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2","key":"1w4ew1"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4","key":"fwvmzm"}]],
  LogOut: [["path",{"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4","key":"1uf3rs"}],["polyline",{"points":"16 17 21 12 16 7","key":"1gabdz"}],["line",{"x1":"21","x2":"9","y1":"12","y2":"12","key":"1uyos4"}]],
  Mail: [["rect",{"width":"20","height":"16","x":"2","y":"4","rx":"2","key":"18n3k1"}],["path",{"d":"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7","key":"1ocrg3"}]],
  MapPin: [["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0","key":"1r0f0z"}],["circle",{"cx":"12","cy":"10","r":"3","key":"ilqhr7"}]],
  Menu: [["line",{"x1":"4","x2":"20","y1":"12","y2":"12","key":"1e0a9i"}],["line",{"x1":"4","x2":"20","y1":"6","y2":"6","key":"1owob3"}],["line",{"x1":"4","x2":"20","y1":"18","y2":"18","key":"yk5zj1"}]],
  MessageCircle: [["path",{"d":"M7.9 20A9 9 0 1 0 4 16.1L2 22Z","key":"vv11sd"}]],
  MessageSquare: [["path",{"d":"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z","key":"1lielz"}]],
  MessagesSquare: [["path",{"d":"M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z","key":"p1xzt8"}],["path",{"d":"M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1","key":"1cx29u"}]],
  MousePointerClick: [["path",{"d":"M14 4.1 12 6","key":"ita8i4"}],["path",{"d":"m5.1 8-2.9-.8","key":"1go3kf"}],["path",{"d":"m6 12-1.9 2","key":"mnht97"}],["path",{"d":"M7.2 2.2 8 5.1","key":"1cfko1"}],["path",{"d":"M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z","key":"s0h3yz"}]],
  Network: [["rect",{"x":"16","y":"16","width":"6","height":"6","rx":"1","key":"4q2zg0"}],["rect",{"x":"2","y":"16","width":"6","height":"6","rx":"1","key":"8cvhb9"}],["rect",{"x":"9","y":"2","width":"6","height":"6","rx":"1","key":"1egb70"}],["path",{"d":"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3","key":"1jsf9p"}],["path",{"d":"M12 12V8","key":"2874zd"}]],
  Package: [["path",{"d":"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z","key":"1a0edw"}],["path",{"d":"M12 22V12","key":"d0xqtd"}],["path",{"d":"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7","key":"yx3hmr"}],["path",{"d":"m7.5 4.27 9 5.15","key":"1c824w"}]],
  PackageCheck: [["path",{"d":"m16 16 2 2 4-4","key":"gfu2re"}],["path",{"d":"M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14","key":"e7tb2h"}],["path",{"d":"m7.5 4.27 9 5.15","key":"1c824w"}],["polyline",{"points":"3.29 7 12 12 20.71 7","key":"ousv84"}],["line",{"x1":"12","x2":"12","y1":"22","y2":"12","key":"a4e8g8"}]],
  PackageSearch: [["path",{"d":"M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14","key":"e7tb2h"}],["path",{"d":"m7.5 4.27 9 5.15","key":"1c824w"}],["polyline",{"points":"3.29 7 12 12 20.71 7","key":"ousv84"}],["line",{"x1":"12","x2":"12","y1":"22","y2":"12","key":"a4e8g8"}],["circle",{"cx":"18.5","cy":"15.5","r":"2.5","key":"b5zd12"}],["path",{"d":"M20.27 17.27 22 19","key":"1l4muz"}]],
  PackageX: [["path",{"d":"M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14","key":"e7tb2h"}],["path",{"d":"m7.5 4.27 9 5.15","key":"1c824w"}],["polyline",{"points":"3.29 7 12 12 20.71 7","key":"ousv84"}],["line",{"x1":"12","x2":"12","y1":"22","y2":"12","key":"a4e8g8"}],["path",{"d":"m17 13 5 5m-5 0 5-5","key":"im3w4b"}]],
  Pencil: [["path",{"d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","key":"1a8usu"}],["path",{"d":"m15 5 4 4","key":"1mk7zo"}]],
  Percent: [["line",{"x1":"19","x2":"5","y1":"5","y2":"19","key":"1x9vlm"}],["circle",{"cx":"6.5","cy":"6.5","r":"2.5","key":"4mh3h7"}],["circle",{"cx":"17.5","cy":"17.5","r":"2.5","key":"1mdrzq"}]],
  Phone: [["path",{"d":"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z","key":"foiqr5"}]],
  Plus: [["path",{"d":"M5 12h14","key":"1ays0h"}],["path",{"d":"M12 5v14","key":"s699le"}]],
  Radar: [["path",{"d":"M19.07 4.93A10 10 0 0 0 6.99 3.34","key":"z3du51"}],["path",{"d":"M4 6h.01","key":"oypzma"}],["path",{"d":"M2.29 9.62A10 10 0 1 0 21.31 8.35","key":"qzzz0"}],["path",{"d":"M16.24 7.76A6 6 0 1 0 8.23 16.67","key":"1yjesh"}],["path",{"d":"M12 18h.01","key":"mhygvu"}],["path",{"d":"M17.99 11.66A6 6 0 0 1 15.77 16.67","key":"1u2y91"}],["circle",{"cx":"12","cy":"12","r":"2","key":"1c9p78"}],["path",{"d":"m13.41 10.59 5.66-5.66","key":"mhq4k0"}]],
  Receipt: [["path",{"d":"M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z","key":"q3az6g"}],["path",{"d":"M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8","key":"1h4pet"}],["path",{"d":"M12 17.5v-11","key":"1jc1ny"}]],
  Recycle: [["path",{"d":"M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5","key":"x6z5xu"}],["path",{"d":"M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12","key":"1x4zh5"}],["path",{"d":"m14 16-3 3 3 3","key":"f6jyew"}],["path",{"d":"M8.293 13.596 7.196 9.5 3.1 10.598","key":"wf1obh"}],["path",{"d":"m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843","key":"9tzpgr"}],["path",{"d":"m13.378 9.633 4.096 1.098 1.097-4.096","key":"1oe83g"}]],
  RefreshCcw: [["path",{"d":"M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","key":"14sxne"}],["path",{"d":"M3 3v5h5","key":"1xhq8a"}],["path",{"d":"M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16","key":"1hlbsb"}],["path",{"d":"M16 16h5v5","key":"ccwih5"}]],
  RefreshCw: [["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8","key":"v9h5vc"}],["path",{"d":"M21 3v5h-5","key":"1q7to0"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16","key":"3uifl3"}],["path",{"d":"M8 16H3v5","key":"1cv678"}]],
  Repeat: [["path",{"d":"m17 2 4 4-4 4","key":"nntrym"}],["path",{"d":"M3 11v-1a4 4 0 0 1 4-4h14","key":"84bu3i"}],["path",{"d":"m7 22-4-4 4-4","key":"1wqhfi"}],["path",{"d":"M21 13v1a4 4 0 0 1-4 4H3","key":"1rx37r"}]],
  RotateCcw: [["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","key":"1357e3"}],["path",{"d":"M3 3v5h5","key":"1xhq8a"}]],
  Route: [["circle",{"cx":"6","cy":"19","r":"3","key":"1kj8tv"}],["path",{"d":"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15","key":"1d8sl"}],["circle",{"cx":"18","cy":"5","r":"3","key":"gq8acd"}]],
  Rows3: [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2","key":"afitv7"}],["path",{"d":"M21 9H3","key":"1338ky"}],["path",{"d":"M21 15H3","key":"9uk58r"}]],
  Save: [["path",{"d":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z","key":"1c8476"}],["path",{"d":"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7","key":"1ydtos"}],["path",{"d":"M7 3v4a1 1 0 0 0 1 1h7","key":"t51u73"}]],
  Scale: [["path",{"d":"m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z","key":"7g6ntu"}],["path",{"d":"m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z","key":"ijws7r"}],["path",{"d":"M7 21h10","key":"1b0cd5"}],["path",{"d":"M12 3v18","key":"108xh3"}],["path",{"d":"M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2","key":"3gwbw2"}]],
  Search: [["circle",{"cx":"11","cy":"11","r":"8","key":"4ej97u"}],["path",{"d":"m21 21-4.3-4.3","key":"1qie3q"}]],
  SearchX: [["path",{"d":"m13.5 8.5-5 5","key":"1cs55j"}],["path",{"d":"m8.5 8.5 5 5","key":"a8mexj"}],["circle",{"cx":"11","cy":"11","r":"8","key":"4ej97u"}],["path",{"d":"m21 21-4.3-4.3","key":"1qie3q"}]],
  Send: [["path",{"d":"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z","key":"1ffxy3"}],["path",{"d":"m21.854 2.147-10.94 10.939","key":"12cjpa"}]],
  Settings: [["path",{"d":"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z","key":"1qme2f"}],["circle",{"cx":"12","cy":"12","r":"3","key":"1v7zrd"}]],
  Share2: [["circle",{"cx":"18","cy":"5","r":"3","key":"gq8acd"}],["circle",{"cx":"6","cy":"12","r":"3","key":"w7nqdw"}],["circle",{"cx":"18","cy":"19","r":"3","key":"1xt0gg"}],["line",{"x1":"8.59","x2":"15.42","y1":"13.51","y2":"17.49","key":"47mynk"}],["line",{"x1":"15.41","x2":"8.59","y1":"6.51","y2":"10.49","key":"1n3mei"}]],
  Shield: [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z","key":"oel41y"}]],
  ShieldAlert: [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z","key":"oel41y"}],["path",{"d":"M12 8v4","key":"1got3b"}],["path",{"d":"M12 16h.01","key":"1drbdi"}]],
  ShieldCheck: [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z","key":"oel41y"}],["path",{"d":"m9 12 2 2 4-4","key":"dzmm74"}]],
  ShieldX: [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z","key":"oel41y"}],["path",{"d":"m14.5 9.5-5 5","key":"17q4r4"}],["path",{"d":"m9.5 9.5 5 5","key":"18nt4w"}]],
  ShoppingBag: [["path",{"d":"M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z","key":"hou9p0"}],["path",{"d":"M3 6h18","key":"d0wm0j"}],["path",{"d":"M16 10a4 4 0 0 1-8 0","key":"1ltviw"}]],
  ShoppingCart: [["circle",{"cx":"8","cy":"21","r":"1","key":"jimo8o"}],["circle",{"cx":"19","cy":"21","r":"1","key":"13723u"}],["path",{"d":"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12","key":"9zh506"}]],
  Sigma: [["path",{"d":"M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2","key":"wuwx1p"}]],
  SlidersHorizontal: [["line",{"x1":"21","x2":"14","y1":"4","y2":"4","key":"obuewd"}],["line",{"x1":"10","x2":"3","y1":"4","y2":"4","key":"1q6298"}],["line",{"x1":"21","x2":"12","y1":"12","y2":"12","key":"1iu8h1"}],["line",{"x1":"8","x2":"3","y1":"12","y2":"12","key":"ntss68"}],["line",{"x1":"21","x2":"16","y1":"20","y2":"20","key":"14d8ph"}],["line",{"x1":"12","x2":"3","y1":"20","y2":"20","key":"m0wm8r"}],["line",{"x1":"14","x2":"14","y1":"2","y2":"6","key":"14e1ph"}],["line",{"x1":"8","x2":"8","y1":"10","y2":"14","key":"1i6ji0"}],["line",{"x1":"16","x2":"16","y1":"18","y2":"22","key":"1lctlv"}]],
  Smartphone: [["rect",{"width":"14","height":"20","x":"5","y":"2","rx":"2","ry":"2","key":"1yt0o3"}],["path",{"d":"M12 18h.01","key":"mhygvu"}]],
  Sparkles: [["path",{"d":"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z","key":"4pj2yx"}],["path",{"d":"M20 3v4","key":"1olli1"}],["path",{"d":"M22 5h-4","key":"1gvqau"}],["path",{"d":"M4 17v2","key":"vumght"}],["path",{"d":"M5 18H3","key":"zchphs"}]],
  Star: [["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z","key":"r04s7s"}]],
  Store: [["path",{"d":"m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7","key":"ztvudi"}],["path",{"d":"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8","key":"1b2hhj"}],["path",{"d":"M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4","key":"2ebpfo"}],["path",{"d":"M2 7h20","key":"1fcdvo"}],["path",{"d":"M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7","key":"6c3vgh"}]],
  Tag: [["path",{"d":"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z","key":"vktsd0"}],["circle",{"cx":"7.5","cy":"7.5","r":".5","fill":"currentColor","key":"kqv944"}]],
  Tags: [["path",{"d":"m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19","key":"1cbfv1"}],["path",{"d":"M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 0-1 1v5.172a2 2 0 0 0 .586 1.414L8.29 18.29a2.426 2.426 0 0 0 3.42 0l3.58-3.58a2.426 2.426 0 0 0 0-3.42z","key":"135mg7"}],["circle",{"cx":"6.5","cy":"9.5","r":".5","fill":"currentColor","key":"5pm5xn"}]],
  Target: [["circle",{"cx":"12","cy":"12","r":"10","key":"1mglay"}],["circle",{"cx":"12","cy":"12","r":"6","key":"1vlfrh"}],["circle",{"cx":"12","cy":"12","r":"2","key":"1c9p78"}]],
  Timer: [["line",{"x1":"10","x2":"14","y1":"2","y2":"2","key":"14vaq8"}],["line",{"x1":"12","x2":"15","y1":"14","y2":"11","key":"17fdiu"}],["circle",{"cx":"12","cy":"14","r":"8","key":"1e1u0o"}]],
  Trash: [["path",{"d":"M3 6h18","key":"d0wm0j"}],["path",{"d":"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6","key":"4alrt4"}],["path",{"d":"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2","key":"v07s0e"}]],
  Trash2: [["path",{"d":"M3 6h18","key":"d0wm0j"}],["path",{"d":"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6","key":"4alrt4"}],["path",{"d":"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2","key":"v07s0e"}],["line",{"x1":"10","x2":"10","y1":"11","y2":"17","key":"1uufr5"}],["line",{"x1":"14","x2":"14","y1":"11","y2":"17","key":"xtxkd"}]],
  TrendingDown: [["polyline",{"points":"22 17 13.5 8.5 8.5 13.5 2 7","key":"1r2t7k"}],["polyline",{"points":"16 17 22 17 22 11","key":"11uiuu"}]],
  TrendingUp: [["polyline",{"points":"22 7 13.5 15.5 8.5 10.5 2 17","key":"126l90"}],["polyline",{"points":"16 7 22 7 22 13","key":"kwv8wd"}]],
  TriangleAlert: [["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3","key":"wmoenq"}],["path",{"d":"M12 9v4","key":"juzpu7"}],["path",{"d":"M12 17h.01","key":"p32p05"}]],
  Truck: [["path",{"d":"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2","key":"wrbu53"}],["path",{"d":"M15 18H9","key":"1lyqi6"}],["path",{"d":"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14","key":"lysw3i"}],["circle",{"cx":"17","cy":"18","r":"2","key":"332jqn"}],["circle",{"cx":"7","cy":"18","r":"2","key":"19iecd"}]],
  User: [["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2","key":"975kel"}],["circle",{"cx":"12","cy":"7","r":"4","key":"17ys0d"}]],
  UserCheck: [["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","key":"1yyitq"}],["circle",{"cx":"9","cy":"7","r":"4","key":"nufk8"}],["polyline",{"points":"16 11 18 13 22 9","key":"1pwet4"}]],
  Users: [["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","key":"1yyitq"}],["circle",{"cx":"9","cy":"7","r":"4","key":"nufk8"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87","key":"kshegd"}],["path",{"d":"M16 3.13a4 4 0 0 1 0 7.75","key":"1da9ce"}]],
  Wallet: [["path",{"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1","key":"18etb6"}],["path",{"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4","key":"xoc0q4"}]],
  X: [["path",{"d":"M18 6 6 18","key":"1bl5f8"}],["path",{"d":"m6 6 12 12","key":"d8bk6v"}]],
  Zap: [["path",{"d":"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z","key":"1xq2db"}]],
  ZoomIn: [["circle",{"cx":"11","cy":"11","r":"8","key":"4ej97u"}],["line",{"x1":"21","x2":"16.65","y1":"21","y2":"16.65","key":"13gj7c"}],["line",{"x1":"11","x2":"11","y1":"8","y2":"14","key":"1vmskp"}],["line",{"x1":"8","x2":"14","y1":"11","y2":"11","key":"durymu"}]],
};

/**
 * Deprecated names still imported by the app, mapped to the icon they alias.
 * Kept explicit so a reader can see exactly which imports are legacy.
 */
export const ALIASES = {
  AlertCircle: "CircleAlert",
  AlertTriangle: "TriangleAlert",
  BarChart3: "ChartColumn",
  CheckCircle2: "CircleCheck",
  Loader2: "LoaderCircle",
  PieChart: "ChartPie",
  TargetIcon: "Target",
  XCircle: "CircleX",
};

export default icon;
