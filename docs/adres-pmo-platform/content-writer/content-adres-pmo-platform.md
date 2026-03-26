# UI Copy — ADRES PMO Platform
**Date:** 2026-03-26
**Author:** Content Writer Agent
**Tone:** Professional / clear (standard enterprise PMO)
**Primary Audience:** General Manager, PMO Lead, Project Managers
**Languages:** English + Arabic (AR/EN only)

---

## Terminology Reference

| Concept | Approved Term (EN) | Approved Term (AR) | Do Not Use |
|---|---|---|---|
| A tracked project/programme | Venture | مشروع | Project, Programme, Initiative |
| Project health indicator | Health Status | حالة المشروع | RAG, Traffic Light |
| Sub-component of a venture | Workstream | مسار العمل | Stream, Track, Module |
| Key delivery point | Milestone | معلم رئيسي | Deliverable, Checkpoint |
| Weekly submission by PM | Progress Update | تحديث التقدم | Status Report, Weekly Report |
| Risk probability × impact | RAG Rating | تصنيف المخاطر | Traffic Light, Risk Score |
| Budget remaining estimate | Forecast to Complete | التوقع للاكتمال | ETC, Remaining Budget |
| System-calculated total | Forecast at Completion | التوقع عند الاكتمال | EAC, Total Forecast |
| Difference: approved − forecast | Budget Variance | فرق الميزانية | Overspend, Deviation |
| Person working on a venture | Resource | مورد | Staff, Employee, Headcount |
| Hours assigned per week | HpW | ساعات/أسبوع | FTE, Allocation % |

---

## Navigation & Page Titles

| Element | English | Arabic |
|---|---|---|
| App title | ADRES PMO | ADRES PMO |
| Login button | Sign in with ADRES | تسجيل الدخول عبر ADRES |
| GM dashboard title | Portfolio Health | نظرة عامة على المحفظة |
| PMO dashboard title | Venture Oversight | متابعة المشاريع |
| PM workspace title | My Venture | مشروعي |
| Tab: Overview | Overview | نظرة عامة |
| Tab: Project Plan | Project Plan | خطة المشروع |
| Tab: Resources | Resources | الموارد |
| Tab: Budget | Budget | الميزانية |
| Tab: Progress | Progress | التقدم |
| Tab: Risks & Issues | Risks & Issues | المخاطر والمشكلات |
| PMO tab: Ventures | Ventures | المشاريع |
| PMO tab: Escalations | Escalations | التصعيدات |
| PMO tab: Decisions | Decisions Needed | قرارات مطلوبة |
| PMO tab: Resources | Resources | الموارد |
| Admin: Users | User Management | إدارة المستخدمين |
| Admin: Resources | Resource Directory | دليل الموارد |
| Admin: New Venture | Create Venture | إنشاء مشروع |
| Breadcrumb: Back | Back to Dashboard | العودة للوحة المتابعة |
| Language toggle | EN / AR | EN / AR |
| Logout | Sign Out | تسجيل الخروج |

---

## Status Labels & Health Indicators

| Status | English | Arabic | Colour Token |
|---|---|---|---|
| On Track | On Track | على المسار | `--status-on-track` (green) |
| At Risk | At Risk | في خطر | `--status-at-risk` (amber) |
| Off Track | Off Track | متأخر | `--status-off-track` (red) |
| Complete | Complete | مكتمل | `--status-complete` (blue) |
| Planning | Planning | تخطيط | `--status-neutral` (grey) |
| On Hold | On Hold | معلّق | `--status-neutral` (grey) |
| Archived | Archived | مؤرشف | `--status-neutral` (grey) |
| Not Started | Not Started | لم يبدأ | `--status-neutral` (grey) |
| In Progress | In Progress | قيد التنفيذ | `--status-on-track` (green) |

### Milestone Status

| Status | English | Arabic |
|---|---|---|
| Upcoming | Upcoming | قادم |
| Achieved | Achieved | تم الإنجاز |
| Overdue | Overdue | متأخر عن الموعد |
| Deferred | Deferred | مؤجّل |

### Budget Status

| Status | English | Arabic |
|---|---|---|
| Within Budget | Within Budget | ضمن الميزانية |
| At Risk | Budget at Risk | ميزانية في خطر |
| Over Budget | Over Budget | تجاوز الميزانية |

---

## Buttons & Actions

| Context | English | Arabic |
|---|---|---|
| Submit weekly update | Submit Update | إرسال التحديث |
| Add workstream | Add Workstream | إضافة مسار عمل |
| Add milestone | Add Milestone | إضافة معلم رئيسي |
| Log spend entry | Log Spend Entry | تسجيل مصروف |
| Update forecast | Update Forecast | تحديث التوقع |
| Set approved budget | Set Approved Budget | تحديد الميزانية المعتمدة |
| Log risk | Log Risk | تسجيل خطر |
| Log issue | Log Issue | تسجيل مشكلة |
| Escalate | Escalate | تصعيد |
| Close risk | Close Risk | إغلاق الخطر |
| Resolve issue | Resolve Issue | حل المشكلة |
| Create venture | Create Venture | إنشاء مشروع |
| Archive venture | Archive Venture | أرشفة المشروع |
| Add blocker | Add Blocker | إضافة عائق |
| Add decision | Add Decision Needed | إضافة قرار مطلوب |
| Save | Save | حفظ |
| Cancel | Cancel | إلغاء |
| Confirm archive | Archive this venture? This hides it from active dashboards. All data is preserved. | أرشفة هذا المشروع؟ سيختفي من لوحات المتابعة النشطة. جميع البيانات محفوظة. |

---

## Form Labels, Placeholders & Validation

### Venture Creation

| Field | Label (EN) | Label (AR) | Placeholder (EN) | Validation Error (EN) | Validation Error (AR) |
|---|---|---|---|---|---|
| Name | Venture Name | اسم المشروع | e.g. DARI.AE | Venture name is required | اسم المشروع مطلوب |
| Description | Description | الوصف | Brief description of the venture | | |
| Type | Venture Type | نوع المشروع | e.g. Property Platform | | |
| Start Date | Start Date | تاريخ البدء | | Start date is required | تاريخ البدء مطلوب |
| End Date | Target End Date | تاريخ الانتهاء المستهدف | | End date must be after start date | تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء |
| PM | Assigned PM | مدير المشروع المعين | Select a project manager | PM assignment is required | تعيين مدير المشروع مطلوب |

### Spend Entry

| Field | Label (EN) | Label (AR) | Placeholder (EN) | Validation Error (EN) | Validation Error (AR) |
|---|---|---|---|---|---|
| Amount | Amount (AED) | المبلغ (درهم) | e.g. 45,000 | Amount is required | المبلغ مطلوب |
| Date | Date | التاريخ | | Date is required | التاريخ مطلوب |
| Category | Category | الفئة | Select category | Category is required | الفئة مطلوبة |
| Description | Description | الوصف | e.g. March contractor fee | Description is required | الوصف مطلوب |
| Vendor | Vendor | المورّد | e.g. Acme Consulting | | |

### Weekly Update

| Field | Label (EN) | Label (AR) |
|---|---|---|
| Overall Status | Overall Status | الحالة العامة |
| Completion | Overall Completion % | نسبة الإنجاز الكلية % |
| Narrative | What happened this week | ماذا حدث هذا الأسبوع |
| Workstream status | Status | الحالة |
| Workstream % | Completion % | نسبة الإنجاز % |
| Milestones completed | Milestones Completed This Week | المعالم المنجزة هذا الأسبوع |
| Blockers | Blockers | العوائق |
| Decisions | Decisions Needed | قرارات مطلوبة |
| Next actions | Next Week's Actions | خطة الأسبوع القادم |

---

## Empty, Loading & Error States

| Screen / Component | Empty State (EN) | Empty State (AR) | Loading (EN) | Error (EN) | Error (AR) |
|---|---|---|---|---|---|
| GM Dashboard | No active ventures | لا توجد مشاريع نشطة | Loading portfolio... | Unable to load portfolio data. Please try again. | تعذر تحميل بيانات المحفظة. يرجى المحاولة مرة أخرى. |
| PMO Ventures | No ventures created yet. Create your first venture. | لم يتم إنشاء مشاريع بعد. أنشئ مشروعك الأول. | Loading ventures... | Unable to load ventures. | تعذر تحميل المشاريع. |
| PM Overview | No updates logged yet. | لم يتم تسجيل أي تحديثات بعد. | Loading venture... | Unable to load venture data. | تعذر تحميل بيانات المشروع. |
| Project Plan | No workstreams defined. Add your first workstream. | لا توجد مسارات عمل. أضف أول مسار عمل. | Loading plan... | | |
| Resources | No resources assigned to this venture. | لا توجد موارد معينة لهذا المشروع. | Loading resources... | | |
| Budget — Spend log | No spend entries logged yet. | لم يتم تسجيل مصروفات بعد. | Loading budget... | | |
| Risks | No open risks. | لا توجد مخاطر مفتوحة. | Loading risks... | | |
| Issues | No open issues. | لا توجد مشكلات مفتوحة. | Loading issues... | | |
| Escalations (PMO) | No open escalations across ventures. | لا توجد تصعيدات مفتوحة. | | | |
| Decisions (PMO) | No open decisions across ventures. | لا توجد قرارات مطلوبة. | | | |

---

## System Messages & Notifications

| Trigger | Message (EN) | Message (AR) |
|---|---|---|
| Weekly update submitted | Update submitted successfully. | تم إرسال التحديث بنجاح. |
| Spend entry logged | Spend entry logged. | تم تسجيل المصروف. |
| Forecast updated | Forecast updated. | تم تحديث التوقع. |
| Venture created | Venture created successfully. | تم إنشاء المشروع بنجاح. |
| Venture archived | Venture archived. All data preserved. | تم أرشفة المشروع. جميع البيانات محفوظة. |
| Risk escalated | Risk escalated to GM dashboard. | تم تصعيد الخطر إلى لوحة المدير العام. |
| Issue escalated | Issue escalated to GM dashboard. | تم تصعيد المشكلة إلى لوحة المدير العام. |
| Approved budget locked | Budget approved and locked. | تم اعتماد وتثبيت الميزانية. |
| SSO unavailable | Authentication service unavailable — contact IT. | خدمة المصادقة غير متاحة — تواصل مع قسم تقنية المعلومات. |
| Access not configured | Access not configured — contact PMO. | لم يتم تهيئة الوصول — تواصل مع مكتب إدارة المشاريع. |
| Forbidden (wrong venture) | You do not have access to this venture. | ليس لديك صلاحية الوصول لهذا المشروع. |
| Update immutability warning | Once submitted, this update cannot be edited. | بمجرد الإرسال، لا يمكن تعديل هذا التحديث. |
| Spend immutability note | Spend entries cannot be edited. To correct an entry, log a correction. | لا يمكن تعديل المصروفات المسجلة. لتصحيح إدخال، سجّل تصحيحاً. |

---

## GM Venture Drawer Labels

| Element | English | Arabic |
|---|---|---|
| Section: Latest Update | Latest Update | آخر تحديث |
| Section: Upcoming Milestones | Upcoming Milestones | المعالم القادمة |
| Section: Budget | Budget | الميزانية |
| Label: Approved | Approved | المعتمد |
| Label: Forecast | Forecast | التوقع |
| Section: Open Risks | Open Risks | مخاطر مفتوحة |
| Section: Escalations | Escalations | التصعيدات |
| No update yet | No updates submitted yet. | لم يتم تقديم تحديثات بعد. |

---

## PMO Dashboard Labels

| Element | English | Arabic |
|---|---|---|
| Column: Name | Name | الاسم |
| Column: PM | PM | مدير المشروع |
| Column: Health | Health | الحالة |
| Column: Completion | % Complete | % الإنجاز |
| Column: Budget | Budget | الميزانية |
| Column: Last Updated | Last Updated | آخر تحديث |
| Stale warning | Not updated in {n} days | لم يتم التحديث منذ {n} يوم |
| Over-allocated badge | Over-allocated | تخصيص زائد |

---

## Budget Labels

| Element | English | Arabic |
|---|---|---|
| Approved Budget | Approved Budget | الميزانية المعتمدة |
| Actual Spend | Actual Spend | المصروف الفعلي |
| Committed | Committed | الملتزم به |
| Forecast to Complete | Forecast to Complete | التوقع للاكتمال |
| Forecast at Completion | Forecast at Completion | التوقع عند الاكتمال |
| Budget Variance | Budget Variance | فرق الميزانية |
| Category: People | People | أشخاص |
| Category: Technology | Technology | تقنية |
| Category: Vendors | Vendors | مورّدون |
| Category: Other | Other | أخرى |
| Correction entry | Correction | تصحيح |

---

## Copy Notes

- All AED amounts display with comma thousands separator (AED 1,200,000) in both EN and AR
- Numbers always render LTR even in Arabic context
- Week labels use format "W13 (Mar 23–27, 2026)" in EN and "الأسبوع 13 (23–27 مارس 2026)" in AR
- Date format: EN uses "Mar 25, 2026", AR uses "25 مارس 2026"
- Percentage always shown as "72%" in both languages
- The word "venture" is the canonical term — never use "project" in the UI (despite PM role title). The Arabic equivalent is مشروع which is a natural translation.
