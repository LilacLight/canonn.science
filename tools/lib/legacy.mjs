// Transforms for the archived WordPress articles. They contained hand-written
// <script> tags that cannot be published as-is; the few interactive tools are
// replaced by fixed Angular components, and typed.js headings are filled in.
// This runs BEFORE sanitising, so the sanitiser still removes every script.

/** The coordinate calculator: a <form onsubmit="return calc_xyz()"> followed by its <script>. */
const XYZ_CALCULATOR = /<form\b[^>]*calc_xyz\(\)[\s\S]*?<\/form>\s*<script>[\s\S]*?<\/script>/i;
/** The Gnosis itinerary: date-fns + jQuery <script> tags, then a <table> that a script fills in. */
const GNOSIS_ITINERARY = /(?:<script\b[^>]*src="[^"]*(?:date_fns|jquery)[^"]*"[^>]*><\/script>\s*)+<table>[\s\S]*?class="rows"[\s\S]*?<\/table>/i;
/** The speed-scanning leaderboard, fetched from a Canonn API that is gone. */
const LEADERBOARD = /<div id="result">[\s\S]*?(?=<p class="has-text-align-center">)/i;
const LEADERBOARD_NOTE = '<p><em>The live leaderboard was served by a Canonn API that is no longer available, so the times are not shown here.</em></p>\n';

/** typed.js headings: the archived <span> is empty; write in the text the animation ended on. */
function fillTypedHeadings(html) {
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const t = /#(typed-[\w-]+)["']\)\.typed\(\{\s*strings:\s*(\[[^\]]*\])/.exec(m[1]);
    if (!t) continue;
    try {
      const strings = JSON.parse(t[2]);
      const text = String(strings[strings.length - 1] ?? '').replace(/\^\d+/g, '').replace(/\s+/g, ' ').trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html = html.replace(new RegExp(`(<span\\b[^>]*\\bid="${t[1]}"[^>]*>)\\s*(</span>)`), `$1${text}$2`);
    } catch { /* leave the span empty */ }
  }
  return html;
}

/** Splits article HTML into { html } segments and fixed { widget } segments. */
export function splitLegacyWidgets(html) {
  if (!/<script|calc_xyz|id="result"/i.test(html)) return [{ html }];
  return split(fillTypedHeadings(html.replace(LEADERBOARD, LEADERBOARD_NOTE)));
}

function split(html) {
  const xyz = XYZ_CALCULATOR.exec(html);
  const gnosis = GNOSIS_ITINERARY.exec(html);
  const m = [xyz, gnosis].filter(Boolean).sort((a, b) => a.index - b.index)[0];
  if (!m) return [{ html }];
  const rest = split(html.slice(m.index + m[0].length));
  let widget;
  if (m === xyz) {
    widget = { widget: 'xyz-converter' };
  } else {
    const d = /Date\.UTC\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(m[0]);
    const systems = [...m[0].matchAll(/"([^"]+)"\s*:\s*dateFns\.addWeeks\(\s*startDate\s*,\s*(\d+)\s*\)/g)].map((x) => ({ name: x[1], week: Number(x[2]) }));
    if (!d || systems.length === 0) return [{ html: html.slice(0, m.index) }, ...rest];
    widget = { widget: 'gnosis-itinerary', start: [Number(d[1]), Number(d[2]), Number(d[3])], systems };
  }
  return [{ html: html.slice(0, m.index) }, widget, ...rest];
}
