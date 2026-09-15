<div dir="rtl" style="text-align: right;">

# طابور الأوردرات الجاهزة — Ready Orders

![worker](https://img.shields.io/badge/worker-v1.0.0-blue)

**Worker بس — مفيش واجهة في الريبو ده.**

بترجّع الأوردرات اللي حالتها **`Ready`**: الشحنة الأصلية
(`custom.manual_status`) أو دورة الاستبدال/الاسترجاع (`custom.status_2_r_e`).

🔗 **الواجهة:** https://ecommoda-dev.github.io/Delivery-COD-Operations-Center/ready-orders.html
(صفحة `ready-orders.html` جوّه ريبو `Delivery-COD-Operations-Center`)

> ⛔ **ممنوع يتضاف `index.html` هنا.** الأداة **مالهاش نسخة مستقلة بقرار**
> (أحمد · 15-09-2026) — الدخول بيحصل مرة واحدة في الهب، والسر سر مجموعة
> `warehouse_ops`.

> 🔴 **قراءة بحتة** — صفر كتابة على شوبيفاي، وصفر صف في D1، ومفيش
> `[[d1_databases]]` أصلاً.

## Endpoints

```
GET  ?action=get_config        نسخة الـ Worker
GET  ?action=diag              فحص ذاتي بلا كتابة
GET  ?action=get_ready_queue   أوردرات Ready (الماكينتين) بحقولها الخام
```

## النشر

منشور من git عبر **Workers Builds** على `main`.
الأسرار من الداشبورد ثم **Promote**: `WORKER_SECRET` (= سر مجموعة
`warehouse_ops`) · `CLIENT_ID` · `CLIENT_SECRET`.

التفاصيل والقرارات والفخاخ → **`CLAUDE.md`**

</div>
