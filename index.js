// ══════════════════════════════════════════════════════════════
// §HEADER
// Worker: ready-orders-worker — EcomModa
// Tool:   طابور الأوردرات الجاهزة (Ready Orders)
//
// skills: worker-builder v3.3.0 · constants v2.6.0 · order-lifecycle v1.8.0
//         · shopify-graphql-helper v1.1.0 · html-builder v6.6.0 — 15-09-2026
//
// 🔴 الأداة دي **مالهاش واجهة مستقلة** — الواجهة الوحيدة هي `ready-orders.html`
//    جوّه `Delivery-COD-Operations-Center`. الريبو ده Worker وبس، بنفس سابقة
//    `Package-Transfer-To-Office` بالحرف (قرار أحمد 15-09-2026).
//
// 🔴 **قراءة بحتة — صفر كتابة.** مفيش `metafieldsSet` ومفيش `orderCancel`
//    ومفيش صف D1، **ومفيش `[[d1_databases]]` في `wrangler.toml` أصلاً**.
//    ⛔ أول ما يتضاف أي فعل: الـ binding يترجع، و`tool`/`type` **يتسجّلوا في
//       `ecommoda-constants` §7 قبل أول `writeLog`** (Rule 7) — مش بعده.
//    ⚠️ ولأنها مابتكتبش، مفيش `get_logs*` ومفيش `get_employees`: نقطة
//       endpoint بلا مستهلك = سطح بلا لازمة (نفس قرار Worker الباركود).
//
// 🔴 **بتجيب الحالة خام — والاشتقاق كله في الواجهة، في مكان واحد.**
//    الاستعلام بيسأل عن `Ready` في الماكينتين وبس؛ الماكينة والتنبيهات
//    والتقسيمة والمبلغ المستحق بيتحسبوا في `shared/shell.js` §QUEUE-RULES.
//    ⛔ ممنوع أي قاعدة اشتقاق تتكتب هنا **وفي الواجهة** مع بعض — نسختين
//       بيفترقوا مع أول تعديل (درس R1 · v1.11.0 في هب المخزن: الرئيسية قالت
//       «بوسطة ٦٦» والصفحة فتحت على ٦).
// ══════════════════════════════════════════════════════════════
const WORKER_VERSION = '1.0.0';
const TOOL_LABEL     = 'ready_orders';   // للتعريف في `diag` بس — **مش** قيمة `tool` في D1

// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// ══════════════════════════════════════════════════════════════

// ─── §CONSTANTS::status — تُنسخ حرفيًا (worker-builder Step 5B) ───
// فرق حرف واحد = فلتر بيرجّع صفر صف **من غير أي خطأ**.
// `Confirmed + Edit` بمسافات حوالين الـ`+` · `WhatsApp-CANCELLED` كابيتال.
const S1_STATUS = {
  NEW_ORDER: 'New Order', CONFIRMED: 'Confirmed',
  WA_CONFIRMED: 'WhatsApp-Confirmed', WA_CANCELLED: 'WhatsApp-CANCELLED',
  CONFIRMED_EDIT: 'Confirmed + Edit', PENDING_EDIT: 'Pending Edit',
  READY: 'Ready', SHIPPED: 'Shipped', IN_RETURN: 'In-Return',
  DELIVERED: 'Delivered', RETURNED: 'Returned', CANCELLED: 'Cancelled',
};
const S2_STATUS = {
  CONFIRMED_RETURN: 'Confirmed + RETURN', CONFIRMED_EXCHANGE: 'Confirmed + EXCHANGE',
  READY: 'Ready', SHIPPED: 'Shipped', IN_RETURN: 'In-Return', RETURNED: 'Returned',
};

// ─── §CONSTANTS::caps — سلسلة السقوف التلاتة (worker-builder ⑪) ───
// ① الواجهة    CHUNK           = —    ← مفيش دفعة: الأداة **عرض بحت**، مفيش
//                                        أي endpoint بياخد مصفوفة عناصر
// ② الـ Worker  MAX_BATCH       = —    ← نفس السبب
// ③ شوبيفاي     QUEUE_PAGE_SIZE = 40   ← **تكلفة، مش عدد**
//
// 🔴 **ليه ٤٠ مش ٥٠:** القياس الحيّ الوحيد اللي عندنا لشكل الاستعلام ده هو
//    `package-transfer-to-office` (٥٠ نود × **١٠** ميتافيلد، 15-09-2026، بلا
//    `MAX_COST_EXCEEDED`). الاستعلام هنا بـ**١١** ميتافيلد + حقلين سكالر
//    زيادة، يعني أغلى شوية — والاستعلام اللي تكلفته أعلى من السقف **بيترفض
//    بالكامل** ويرجّع دفعة فاضية برسالة GraphQL مبهمة، مش بيتقص.
//    فالنزول خطوة **آمن بالتعريف**، والطلوع محتاج قياس.
// ⛔ متطلّعهاش من غير ما تقرا `actualQueryCost` فعليًا — و`?action=diag`
//    بيعرض `throttleStatus` بتاع آخر استعلام عشان الاقتراب من السقف يبان
//    **قبل** ما ينفجر في وش الموظف.
const QUEUE_PAGE_SIZE = 40;

// حارس حلقة **مش سقف بيانات** — لو اتضرب، الرد بيقول `truncated: true`
// والواجهة بتطلّع بانر أصفر منفصل عن بانر الفشل.
// ٤٠ × ١٢ = ٤٨٠ أوردر لكل ماكينة. طابور «جاهز» بيتفضّى أول بأول (٦٧ أوردر
// يوم القياس 15-09-2026 في محطة المخزن)، فالسقف ده واسع بمراحل.
const QUEUE_MAX_PAGES = 12;

const SHOPIFY_API_VERSION = '2026-01';   // `ecommoda-constants` §1 — صريح دايمًا

// ══════════════════════════════════════════════════════════════
// §CORS — Option B (قايمة صارمة)
// ══════════════════════════════════════════════════════════════
//
// ⚠️ **انحراف موثّق عن `ecommoda-worker-builder` Step 3.** القاعدة بتقول
//    أداة قراءة-فقط → Option A (wildcard). الأداة دي قراءة بحتة فعلاً،
//    **ومع ذلك على Option B** — والسبب مش الكتابة:
//    الرد بيحمل **اسم العميل ومحافظته ومبلغ التحصيل** لكل أوردر في الطابور.
//    دي بيانات تشغيلية ومالية، ومستهلكها **واحد معروف** (الهب)، فالقايمة
//    الصارمة تكلفتها صفر ومكسبها حقيقي.
// ⚠️ الحماية الفعلية لسه `WORKER_SECRET` — الـ CORS بيحمي متصفح، مش سيرفر.
const ALLOWED_ORIGINS = ['https://ecommoda-dev.github.io'];
function getCORS(request) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// ══════════════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════════════
function json(data, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  Object.assign(headers, request ? getCORS(request) : { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] });
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── §HELPERS::time — توقيت القاهرة **يتحسب** مايتكتبش ثابت ───
// (`ecommoda-constants` §13 — نفس الدوال بالحرف في الـ Worker وفي الواجهة)
// ⚠️ مصر بترجع UTC+2 يوم 29-10-2026 — أي إزاحة مكتوبة ثابت بتبقى غلط
//    **من غير ما الأداة تشتكي**، وده بالظبط سبب القاعدة دي.
const CAIRO_TZ = 'Africa/Cairo';
const _cairoFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function cairoParts(d) {
  const o = {};
  for (const p of _cairoFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';   // حارس: بعض المحركات بترجّع 24
  return o;
}
function cairoDate() { const p = cairoParts(new Date()); return `${p.year}-${p.month}-${p.day}`; }

// ─── §HELPERS::assertEnv ───
// ⚠️ **مفيش `DB` في القايمة** — الأداة مابتلمسش D1 خالص. لو اتضاف فعل يومًا،
//    الـ binding بيترجع هنا وفي `wrangler.toml` **مع بعض**.
const ENV_REQUIRED = { shopify: ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET'] };
function assertEnv(env, ...groups) {
  const missing = [];
  for (const g of groups) {
    for (const key of (ENV_REQUIRED[g] || [])) {
      if (env[key] === undefined || env[key] === null || String(env[key]).trim() === '') missing.push(key);
    }
  }
  if (missing.length) {
    throw new Error(
      `متغيرات ناقصة في الـ Worker: ${missing.join('، ')} — ضِفها من ` +
      `Dashboard → Settings → Variables ثم **Promote** النسخة. (شغّل ?action=diag)`
    );
  }
}

// ─── §HELPERS::secretFingerprint — بصمة قصيرة لسر المجموعة ───
// (`ecommoda-constants` → `references/secret-groups.md`)
// الطول لوحده **مش كافي** لإثبات إن أعضاء مجموعة `warehouse_ops` شايلين نفس
// القيمة — سرّين مختلفين بنفس الطول شكلهم واحد. البصمة بتكشف الحالتين اللي
// بيوقّعوا الناس: ① عضو لسه على السر القديم ② السر اتضاف والـ Promote ما اتعملش.
// ⛔ ٨ خانات hex من SHA-256 — **مش** قابلة لاسترجاع القيمة.
async function secretFingerprint(secret) {
  if (!secret) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(buf)].slice(0, 4)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════
async function getAccessToken(env) {
  const resp = await fetch(
    `https://${env.SHOP_DOMAIN}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        grant_type:    'client_credentials',
      }),
    }
  );
  if (!resp.ok) throw new Error(`OAuth failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

// ─── §SHOPIFY::shopifyGQL — العقد الإلزامي، منسوخة كما هي ───
// أي فشل بيترمي: ① شبكة ② HTTP status ③ رد مش JSON ④ data.errors ⑤ data فاضية.
// ⚠️ ④ هو الخطير: استعلام بيترفض على مستوى الحقل بيرجّع
//    {"errors":[…],"data":null} — وكود بيقرا `data.orders` بس بيقرا ده
//    **طابور فاضي** بدل خطأ.
let _lastThrottle = null;   // بيتعرض في diag — الاقتراب من السقف مابيبانش غير بانفجار
async function shopifyGQL(env, token, query, variables = {}, opName = 'shopify') {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body:    JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: شوبيفاي ردّت HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(' | ')}` +
        (codes.length ? ` [${codes.join(',')}]` : '')
      );
      if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: رد شوبيفاي بدون data — ${text.slice(0, 180)}`);
    if (data.extensions?.cost?.throttleStatus) _lastThrottle = data.extensions.cost.throttleStatus;
    return data;
  }
  throw lastErr || new Error(`${opName}: فشل غير معروف`);
}

// ══════════════════════════════════════════════════════════════
// §QUEUE — طابور «جاهز للشحن»
// ══════════════════════════════════════════════════════════════
//
// 🔴 **الاستعلام بيسأل عن الحالة وبس.** مفيش أي شرط تاني في الـ `query` —
//    لا زون ولا مندوب ولا تغليف. السبب مش تبسيط:
//    ① الأداة **عرض بحت** ومالهاش بوابة كتابة تحمي حد من حاجة.
//    ② الفلترة الزيادة في الاستعلام معناها أوردر **بيختفي في صمت** —
//       والموظف بيسأل «الأوردر ده فين؟» ومفيش إجابة. القاعدة هنا:
//       **يبان وعليه علامة**، مش يختفي (قاعدة ١٣ و١٤ في `order-lifecycle`).
//
// ⚠️ **وممنوع فلتر على ميتافيلد مش قابل للفلترة.** `package_whereabouts_s1`
//    مثلاً بيتجاهَل **في صمت** ويرجّع المتجر كله (١٠٬٠٠٠ صف — مقيس
//    15-09-2026 في `package-transfer-to-office`). الحقول المستخدمة في
//    الفلتر هنا اتنين بس وهما **مؤكَّدين قابلين للفلترة**:
//    `custom.manual_status` و`custom.status_2_r_e`.
const ORDER_FIELDS = `
  id
  legacyResourceId
  name
  createdAt
  cancelledAt
  displayFulfillmentStatus
  displayFinancialStatus
  currentSubtotalLineItemsQuantity
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  shippingAddress { name city province }
  zone:    metafield(namespace: "custom", key: "zone") { value }
  courier: metafield(namespace: "custom", key: "courier") { value }
  s1:      metafield(namespace: "custom", key: "manual_status") { value }
  s2:      metafield(namespace: "custom", key: "status_2_r_e") { value }
  p1:      metafield(namespace: "custom", key: "s1_packing_date_time") { value }
  p2:      metafield(namespace: "custom", key: "s2_packing_date_time") { value }
  pb1:     metafield(namespace: "custom", key: "s1_packed_by") { value }
  pb2:     metafield(namespace: "custom", key: "s2_packed_by") { value }
  w1:      metafield(namespace: "custom", key: "package_whereabouts_s1") { value }
  w2:      metafield(namespace: "custom", key: "package_whereabouts_s2") { value }
  tr0:     metafield(namespace: "custom", key: "bosta_tracking_number") { value }
`;

const QUEUE_QUERY = `
query ReadyQueue($q: String!, $after: String, $n: Int!) {
  orders(first: $n, query: $q, sortKey: CREATED_AT, reverse: true, after: $after) {
    nodes { ${ORDER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

// ─── §QUEUE::shapeOrder ───
// ⚠️ الشكل ده **عقد مع الواجهة**: `dcoShapeGuard` و`dcoFlags` و`dcoCounts`
//    في `shared/shell.js` بيقروا المفاتيح دي **بالاسم**. تغيير اسم مفتاح هنا
//    = عمود بيرجع `—` على كل صف **بلا أي خطأ في الكونسول**.
// 🔴 **`orderId` رقمي إلزامي** (worker-builder Step 5 § Numeric Order ID) —
//    الواجهة بتبني بيه رابط الأدمن، والـ `gid` مايبنيش رابط.
function shapeOrder(o) {
  return {
    orderId:   o.legacyResourceId || (o.id ? String(o.id).split('/').pop() : null),
    orderGid:  o.id,
    orderName: o.name,
    createdAt: o.createdAt,
    cancelledAt: o.cancelledAt || null,
    fulfillment: o.displayFulfillmentStatus || null,
    financial:   o.displayFinancialStatus   || null,
    customer:  o.shippingAddress?.name || null,
    city:      o.shippingAddress?.city || null,
    province:  o.shippingAddress?.province || null,
    itemsQty:  o.currentSubtotalLineItemsQuantity ?? null,
    // 🔴 `currentTotalPriceSet` مش `totalPriceSet` — التاني بيمسك القيمة
    //    **الأصلية** وبيفضل زي ما هو بعد أي تعديل أو مرتجع
    //    (`order-lifecycle` قاعدة ٣). ودي بالظبط القيمة اللي المندوب
    //    بيحصّلها، ونفس اللي بوابة بوسطة في أداة الطباعة بتقارنها بـ`cod`.
    total:     o.currentTotalPriceSet?.shopMoney?.amount ?? null,
    currency:  o.currentTotalPriceSet?.shopMoney?.currencyCode ?? null,
    zone:      o.zone?.value    || null,
    courier:   o.courier?.value || null,
    s1:        o.s1?.value      || null,
    s2:        o.s2?.value      || null,
    packedAtS1: o.p1?.value     || null,
    packedAtS2: o.p2?.value     || null,
    packedByS1: o.pb1?.value    || null,
    packedByS2: o.pb2?.value    || null,
    whereaboutsS1: o.w1?.value  || null,
    whereaboutsS2: o.w2?.value  || null,
    trackingLegacy: o.tr0?.value || null,
  };
}

async function fetchStatusPage(env, token, q, opName) {
  const out = [];
  let after = null, pages = 0, truncated = false;
  while (pages < QUEUE_MAX_PAGES) {
    const data = await shopifyGQL(env, token, QUEUE_QUERY,
      { q, after, n: QUEUE_PAGE_SIZE }, opName);
    const conn = data.data?.orders;
    // ⚠️ الرد الناجح بلا `orders` = عقد اتكسر، **مش** طابور فاضي.
    if (!conn) throw new Error(`${opName}: رد شوبيفاي بلا \`orders\``);
    out.push(...(conn.nodes || []));
    pages++;
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    if (pages >= QUEUE_MAX_PAGES) truncated = true;
  }
  return { nodes: out, truncated };
}

// ─── §QUEUE::handleQueue ───
// بيجيب **الماكينتين** بالتوازي: `manual_status = Ready` (الشحنة الأصلية) و
// `status_2_r_e = Ready` (دورة استبدال/استرجاع).
// ⚠️ **أوردر ممكن يرجع في الاتنين** — بيتدمج بالـ id (مش بيتكرر)، والواجهة
//    هي اللي بتقرر الماكينة وبتعلّم على الحالة الشاذة دي بعلامة مراجعة.
async function handleQueue(env, request) {
  assertEnv(env, 'shopify');
  const token = await getAccessToken(env);

  const [a, b] = await Promise.all([
    fetchStatusPage(env, token, `metafields.custom.manual_status:'${S1_STATUS.READY}'`,  'readyS1'),
    fetchStatusPage(env, token, `metafields.custom.status_2_r_e:'${S2_STATUS.READY}'`,   'readyS2'),
  ]);

  const byId = new Map();
  for (const n of [...a.nodes, ...b.nodes]) {
    const s = shapeOrder(n);
    if (s.orderId) byId.set(s.orderId, s);
  }

  return json({
    ok: true,
    queue: 'ready',
    orders: [...byId.values()],
    truncated: a.truncated || b.truncated,
    fetchedAt: new Date().toISOString(),
    cairoDate: cairoDate(),
  }, 200, request);
}

// ══════════════════════════════════════════════════════════════
// §DIAG — فحص ذاتي بلا أي كتابة
// ══════════════════════════════════════════════════════════════
// الشكل المعتمد للجديد: **مصفوفة** `[{ ok, label, detail, hint }]` — `ok`
// صريحة. ⛔ ممنوع يرجّع قيمة أي سر — الأسماء والأطوال والبصمة بس.
const DIAG_QUERY = `
query Diag {
  currentAppInstallation { accessScopes { handle } }
  shop { name }
}`;

async function handleDiag(env, request) {
  const checks = [];
  const push = (ok, label, detail, hint) => checks.push({ ok, label, detail, hint });

  // ① المتغيرات — أسماء وأطوال بس
  const names = ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET', 'WORKER_SECRET'];
  const envDetail = names.map(k => {
    const v = env[k];
    return `${k}=${v === undefined || v === null || String(v).trim() === '' ? '❌ ناقص' : String(v).length + ' حرف'}`;
  }).join(' · ');
  const envOk = names.every(k => env[k] !== undefined && String(env[k] ?? '').trim() !== '');
  push(envOk, 'متغيرات وأسرار الـ Worker', envDetail,
       'Dashboard → Settings → Variables، وبعدها **Promote** للنسخة — من غير Promote القيمة بتفضل undefined');

  // ② بصمة سر المجموعة — الطول مش كافي لإثبات التوحيد
  const fp = await secretFingerprint(env.WORKER_SECRET);
  push(!!fp, 'بصمة WORKER_SECRET', fp
    ? `بصمة ${fp} · مجموعة warehouse_ops — لازم تطابق باقي أعضاء المجموعة`
    : 'مفيش سر — البصمة مستحيلة',
    'لو البصمة مختلفة عن باقي الأعضاء، المجموعة مكسورة والهب هيرجّع 401 من الأداة دي بس');

  // ③ D1 — **مقصود إنها مش متصلة**
  // ⚠️ السطر ده معلومة مش فحص: أداة قراءة بحتة مالهاش binding، وغيابه
  //    **مش عطل**. عرضه ✅ كان هيدّي طمأنينة كاذبة إن فيه تسجيل شغّال.
  push(true, 'D1 (تسجيل العمليات)',
    env.DB ? '⚠️ فيه binding اسمه DB — الأداة دي مش بتستخدمه (قراءة بحتة)'
           : 'مفيش binding — مقصود: الأداة قراءة بحتة وصفر كتابة في السجل');

  // ④ شوبيفاي + الصلاحيات
  try {
    assertEnv(env, 'shopify');
    const token = await getAccessToken(env);
    const data  = await shopifyGQL(env, token, DIAG_QUERY, {}, 'diag');
    push(true, 'OAuth شوبيفاي', `التوكن اتجاب بنجاح · المتجر: ${data.data?.shop?.name || '—'}`);

    const scopes = (data.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
    const canRead = scopes.includes('read_orders') || scopes.includes('write_orders');
    push(canRead, 'صلاحية قراءة الأوردرات',
         canRead ? `موجودة (${scopes.filter(s => /orders/.test(s)).join(', ')})` : 'ناقصة — الطابور هيرجع فاضي',
         'Custom App → Configuration → Admin API access scopes');

    // 🔴 `read_all_orders` — الأوردرات الأقدم من ٦٠ يوم بتختفي من غيرها
    //    **بلا أي خطأ**. طابور «جاهز» بيتفضّى أول بأول فالأثر محدود، بس
    //    أوردر قديم عالق في `Ready` هو **بالظبط** اللي الطابور موجود
    //    عشان يمسكه — فغيابه الصامت أسوأ من رقم ناقص.
    const readAll = scopes.includes('read_all_orders');
    push(readAll, 'صلاحية read_all_orders',
         readAll ? 'موجودة — الأوردرات الأقدم من ٦٠ يوم بتظهر'
                 : '⚠️ ناقصة — أي أوردر أقدم من ٦٠ يوم **مش هيظهر في الطابور** وبلا أي خطأ',
         'مش حاجزة للتشغيل اليومي، بس الأوردر القديم العالق هو أهم صف في الطابور — القرار لأحمد');
  } catch (e) {
    push(false, 'شوبيفاي', `FAILED: ${e.message}`);
  }

  // ⑤ تكلفة الاستعلام — الاقتراب من السقف مابيبانش غير بانفجار دفعة كاملة
  push(true, 'تكلفة استعلام شوبيفاي', _lastThrottle
    ? `currentlyAvailable=${_lastThrottle.currentlyAvailable} / ${_lastThrottle.maximumAvailable} · restoreRate=${_lastThrottle.restoreRate}/s · حجم الصفحة=${QUEUE_PAGE_SIZE}`
    : `لسه مفيش استعلام طابور في الاستدعاء ده · حجم الصفحة=${QUEUE_PAGE_SIZE}`);

  // ⑥ الأصل
  const origin = request.headers.get('Origin') || '(بلا Origin)';
  push(ALLOWED_ORIGINS.includes(origin), 'الـ Origin', `${origin} · المسموح: ${ALLOWED_ORIGINS.join(', ')}`,
       'الواجهة لازم تتفتح من https://ecommoda-dev.github.io — الفتح من ملف محلي بيترفض');

  return json({ ok: checks.every(c => c.ok), version: WORKER_VERSION,
                tool: TOOL_LABEL, checks }, 200, request);
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    // 🔴 حارس السر الغايب **قبل** فحص الـ auth — من غيره القالب بينتج السلسلة
    //    الحرفية "Bearer undefined"، يعني أي طلب معاه الهيدر ده **بيعدّي**،
    //    والحالة اللي المفروض تبقى «كل حاجة 401» بتتحوّل لـ«الحماية اتشالت».
    if (typeof env.WORKER_SECRET !== 'string' || !env.WORKER_SECRET.trim())
      return json({ ok: false, error: 'WORKER_SECRET غير مضبوط على الـ Worker', step: 'env' }, 500, request);

    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return json({ error: 'Unauthorized' }, 401, request);

    const url    = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    try {
      if (action === 'get_config')
        return json({ ok: true, version: WORKER_VERSION, WORKER_VERSION, tool: TOOL_LABEL }, 200, request);

      if (action === 'diag') return await handleDiag(env, request);

      if (action === 'get_ready_queue') return await handleQueue(env, request);

      // 🔴 **انحراف مقصود ومكتوب:** مفيش `check_employee`/`register_pin`/
      //    `verify_employee`/`log_logout`/`get_employees`/`get_logs*` هنا.
      //    الدخول بيحصل **مرة واحدة** في `index.html` بتاع الهب عبر Worker
      //    التغليف، والهوية بتوصل من `sessionStorage`. والأداة مابتكتبش في
      //    D1 أصلاً، فمفيش سجل يتفلتر. نقطة دخول تانية هنا = سطح هجوم بلا
      //    مستهلك (نفس قرار `order-sku-barcode-printer-worker` و
      //    `package-transfer-to-office-worker`).
      return json({ error: `Unknown action: ${action}` }, 404, request);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, request);
    }
  },
};
