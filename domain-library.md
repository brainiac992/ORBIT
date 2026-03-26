# HERALD Domain Library

HERALD matches requests against this library at the start of Layer 1. Each domain defines the constraint questions that must be answered before any technical decision is made. This library is not exhaustive — when HERALD encounters a domain not listed here, it constructs a relevant constraint checklist from first principles and documents it in `context.md` for future sessions.

---

## Universal Constraint Dimensions

These apply to **every request** after domain-specific questions are answered. HERALD asks these unless the answer is already obvious from context or the user has confirmed they are not applicable.

| Dimension | Question | Blocker? |
|---|---|---|
| **Accessibility** | WCAG compliance required? Level AA or AAA? Screen reader support? | Blocker if public-facing or government |
| **Offline / connectivity** | Must work without internet or in low-bandwidth environments? | Blocker if mobile or field deployment |
| **Localization** | Multiple languages? RTL support? Regional date, currency, and number formats? | Blocker if multi-region |
| **Data retention & deletion** | How long is data kept? Right to erasure required? Who can delete what? | Blocker if personal data is stored |
| **Disaster recovery** | RTO/RPO targets? What is acceptable downtime? Backup strategy? | Blocker if production / customer-facing |
| **Multi-tenancy** | Single org or multiple orgs sharing the platform? Data isolation requirements? | Blocker if SaaS or platform product |
| **White-labeling** | Does it need to be rebrandable by clients? Custom domains, logos, themes? | Advisory |
| **Mobile** | Responsive web, native app (iOS/Android/both), or PWA? | Blocker if end users are on mobile |
| **Audit logging** | Is an action history required? Must the log be tamper-proof or immutable? | Blocker if compliance or regulated |
| **Data portability** | Can users export their data? In what format? (CSV, JSON, PDF) | Advisory |
| **Integration surface** | Webhooks, public API, or embeddable widgets needed? | Advisory |
| **Dependency licensing** | Any restrictions on open-source licenses? (GPL, AGPL incompatible with commercial?) | Blocker if commercial product |
| **Post-launch ownership** | Who maintains this after delivery? Internal team size and technical level? | Advisory |
| **Sandbox availability** | Do all third-party integrations have sandbox/test environments? | Blocker if external APIs are involved |

---

## Banking & Fintech
**Signals:** bank, transaction, account, balance, statement, open banking, Plaid, TrueLayer, Yodlee, IBAN, SWIFT, ledger, reconciliation
**Constraint questions:**
- What country/region are your users in? (determines available APIs and regulatory framework)
- Which banks or institutions need to be supported?
- Do you have existing API credentials, or is provider selection open?
- Is this for personal use only, or will real user financial data flow through it?
- Any compliance requirements? (PSD2, PCI-DSS, GDPR, local financial regulation)
- Will the app read data only, or also initiate payments/transfers?

---

## Healthcare & MedTech
**Signals:** patient, medical, health, EHR, EMR, FHIR, HL7, prescription, clinic, hospital, diagnosis, HIPAA, PHI
**Constraint questions:**
- What country/region? (HIPAA in US, GDPR in EU, different frameworks elsewhere)
- Will real patient data be stored or processed?
- Does this integrate with existing EHR/EMR systems? Which ones?
- Who are the end users — clinicians, patients, administrators?
- Are there certification or regulatory approval requirements?
- On-premise deployment required, or is cloud acceptable?

---

## Payments & E-commerce
**Signals:** payment, checkout, cart, invoice, subscription, billing, Stripe, PayPal, refund, currency, merchant, POS
**Constraint questions:**
- Which countries/currencies need to be supported?
- Do you have an existing payment provider, or is that open?
- One-time payments, subscriptions, or both?
- What is the expected transaction volume?
- PCI-DSS compliance required?
- Marketplace model (split payments) or single merchant?

---

## Auth & Identity
**Signals:** login, authentication, SSO, OAuth, SAML, LDAP, MFA, session, JWT, identity, Auth0, Okta, Cognito, Active Directory
**Constraint questions:**
- Do you have an existing identity provider (IdP)?
- SSO required? Which protocol — OAuth2, SAML, OIDC?
- What user types exist and what are their permission levels?
- MFA required?
- Social login needed? Which providers?
- Any compliance requirements around session management or data residency?

---

## Real Estate
**Signals:** property, listing, MLS, mortgage, tenant, landlord, lease, Zillow, rental, real estate, property management
**Constraint questions:**
- What country/market? (MLS access varies by region)
- Do you have existing MLS or listing API access?
- Residential, commercial, or both?
- Buyer/seller platform, rental platform, or property management?
- Does it handle financial transactions (rent collection, deposits)?
- Map/location features required? Preferred provider?

---

## Gaming
**Signals:** game, player, score, leaderboard, multiplayer, Unity, Unreal, Steam, matchmaking, inventory, loot, achievement, game engine
**Constraint questions:**
- Target platform(s)? (PC, console, mobile, browser, VR)
- Game engine already chosen, or open?
- Single-player, multiplayer, or both? If multiplayer — real-time or turn-based?
- Monetization model? (premium, free-to-play, subscriptions, in-app purchases)
- Expected concurrent player count at launch?
- Age rating target? (affects content and store requirements)
- Existing backend infrastructure, or greenfield?

---

## Legal & Compliance
**Signals:** contract, legal, compliance, GDPR, regulation, audit, policy, clause, jurisdiction, law, terms
**Constraint questions:**
- What jurisdiction(s) does this operate in?
- Will the system store or process personally identifiable information (PII)?
- Does it generate, store, or manage legal documents?
- Who are the end users — legal professionals, businesses, or consumers?
- Any audit trail or immutability requirements?
- Does it need to integrate with court systems, e-signature providers, or legal databases?

---

## Education & EdTech
**Signals:** student, course, LMS, curriculum, quiz, grade, classroom, SCORM, xAPI, tutor, learning, school, university
**Constraint questions:**
- K-12, higher education, corporate training, or consumer?
- Existing LMS to integrate with? (Canvas, Moodle, Blackboard, Google Classroom)
- FERPA or COPPA compliance required? (US — student data privacy, child data)
- Synchronous (live classes) or asynchronous (self-paced), or both?
- Content types needed — video, quizzes, assignments, certificates?
- Single institution or multi-tenant platform?

---

## Travel & Logistics
**Signals:** booking, flight, hotel, itinerary, route, shipment, tracking, GDS, Amadeus, freight, delivery, fleet, GPS
**Constraint questions:**
- Travel booking, logistics/shipping, or fleet management?
- Existing provider APIs available? (GDS for travel, carrier APIs for logistics)
- What geographies need to be covered?
- Real-time tracking required?
- Does it handle payments for bookings?
- B2B, B2C, or internal tool?

---

## Social & Community
**Signals:** post, feed, follow, like, comment, community, forum, messaging, notification, social, user-generated content
**Constraint questions:**
- Public platform or private community?
- Expected user scale at launch and 12 months out?
- Real-time features required? (live chat, notifications, feeds)
- Content moderation requirements?
- User-generated content — what types? (text, images, video)
- Any age restrictions on the user base? (COPPA, GDPR-K implications)

---

## Infrastructure & DevOps
**Signals:** deploy, CI/CD, pipeline, Kubernetes, Docker, cloud, AWS, GCP, Azure, terraform, monitoring, infrastructure
**Constraint questions:**
- Cloud provider already chosen, or open?
- Existing infrastructure to integrate with or extend?
- What environments are needed? (dev, staging, prod)
- Compliance requirements for data residency or sovereignty?
- Expected traffic scale and SLA requirements?
- On-call and incident response process already in place?

---

## AI & Machine Learning
**Signals:** model, training, inference, dataset, ML, AI, neural network, embedding, fine-tune, LLM, vector, prediction
**Constraint questions:**
- Building a model from scratch, fine-tuning an existing one, or integrating a third-party API?
- What data is available for training/evaluation? Is it labelled?
- Any data privacy constraints on the training data?
- Inference latency requirements? (real-time vs. batch)
- On-device, on-premise, or cloud inference?
- Explainability or audit requirements on model decisions?

---

## IoT & Hardware
**Signals:** device, sensor, firmware, embedded, MQTT, hardware, microcontroller, Arduino, Raspberry Pi, edge, BLE, Zigbee
**Constraint questions:**
- What hardware platform/microcontroller?
- Connectivity: WiFi, BLE, Zigbee, LoRa, cellular, or wired?
- Power constraints? (battery-operated vs. mains)
- Does it need OTA (over-the-air) firmware updates?
- What is the deployment environment? (industrial, consumer, outdoor)
- Any certification requirements? (FCC, CE, UL)

---

## HR & Workforce
**Signals:** employee, payroll, HR, onboarding, attendance, leave, performance, HRIS, ATS, recruitment, workforce
**Constraint questions:**
- What countries/jurisdictions need to be supported? (payroll laws vary significantly)
- Existing HRIS to integrate with? (Workday, BambooHR, SAP, etc.)
- Core modules needed — payroll, recruitment, performance, or all?
- Employee count and expected growth?
- Union or collective agreement rules to account for?
- Self-service portal for employees, or admin-only?

---

## Media & Content
**Signals:** video, audio, podcast, streaming, CDN, CMS, editorial, transcoding, subtitle, DRM, publishing, VOD
**Constraint questions:**
- Content types — video, audio, text, or mixed?
- Live streaming, on-demand, or both?
- DRM required?
- Expected concurrent viewers / storage volume?
- Existing CDN or media infrastructure?
- Monetization model — subscription, ad-supported, pay-per-view?
- Subtitles/closed captions required? (ADA, Section 508, CVAA compliance)
- Creator upload model or editorial-only? (affects moderation and storage architecture)

---

## Crypto & Web3
**Signals:** blockchain, wallet, token, NFT, smart contract, DeFi, Web3, Ethereum, Solana, on-chain, off-chain, gas, DAO, dApp, crypto, staking, mint
**Constraint questions:**
- Which blockchain(s) need to be supported? (Ethereum, Solana, Polygon, other L2s)
- On-chain logic, off-chain backend, or hybrid?
- Does it involve financial transactions? (triggers regulatory and KYC/AML obligations)
- Custodial (you hold keys) or non-custodial (user holds keys)?
- Smart contract audit required before deployment?
- What wallet providers need to be supported? (MetaMask, WalletConnect, Phantom, etc.)
- Is this for a regulated jurisdiction? (MiCA in EU, FinCEN in US, MAS in Singapore)
- Gas cost sensitivity — are users paying gas directly, or is the product abstracting it?

---

## Insurance
**Signals:** insurance, policy, claim, underwriting, premium, broker, actuary, reinsurance, coverage, insured, adjuster, loss, risk assessment
**Constraint questions:**
- Line of business — life, health, property & casualty, auto, or specialty?
- Which country/region? (insurance is heavily jurisdiction-specific)
- Building a carrier system, broker platform, or claims portal?
- Does it need to integrate with existing core insurance systems? (Guidewire, Duck Creek, Majesco)
- Will it perform underwriting calculations or pricing? (actuarial data sources required)
- Regulatory filing requirements? (state/country approval for rate changes)
- Fraud detection required?
- Does it handle first-party claims intake, or full claims lifecycle management?

---

## Government & Public Sector
**Signals:** government, public sector, citizen, municipality, federal, state, agency, procurement, e-government, permit, license, FOI, public records
**Constraint questions:**
- Federal, state/provincial, or municipal level?
- Which country? (procurement rules, accessibility mandates, and data laws differ significantly)
- Is this an internal government tool or a citizen-facing service?
- Procurement constraints? (approved vendor lists, open-source mandates, security clearance)
- Accessibility mandates? (Section 508 in US, EN 301 549 in EU — typically non-negotiable)
- Data sovereignty requirements? (must data stay within national borders?)
- Identity: does it integrate with a national identity scheme? (Login.gov, GOV.UK Verify, etc.)
- Are there open data or Freedom of Information obligations?

---

## Automotive
**Signals:** vehicle, car, OBD, telematics, fleet, dealership, VIN, CAN bus, ADAS, autonomous, EV, charging, OTA update, infotainment, automotive
**Constraint questions:**
- In-vehicle software, fleet management platform, or dealer/consumer app?
- Does it interface with vehicle hardware? (OBD-II, CAN bus, proprietary APIs)
- OTA firmware updates required? (strict validation and rollback requirements)
- Safety-critical system? (ISO 26262 functional safety classification required)
- Which vehicle makes/models must be supported? Existing telematics platforms? (Geotab, Samsara, etc.)
- EV-specific features? (charging network integration, battery/range data)
- Connected services requiring cellular? (data plan model — embedded SIM or bring-your-own)
- Regional compliance? (UNECE WP.29 cybersecurity regulation in EU/Asia)

---

## Supply Chain & Manufacturing
**Signals:** supply chain, inventory, warehouse, ERP, SKU, BOM, procurement, vendor, shipment, manufacturing, assembly, quality control, traceability, logistics, fulfilment
**Constraint questions:**
- Manufacturing, warehousing, procurement, or end-to-end supply chain?
- Existing ERP to integrate with? (SAP, Oracle, Microsoft Dynamics, NetSuite)
- Does it need EDI support? (850 PO, 856 ASN, 810 invoice — common in retail/CPG supply chains)
- Barcode/RFID scanning required? (warehouse floor operations)
- Traceability requirements? (lot/batch tracking, recall readiness, food safety, pharma serialisation)
- Multi-location or multi-entity? (separate legal entities, intercompany transactions)
- Real-time inventory or periodic reconciliation?
- Any industry-specific compliance? (FDA 21 CFR Part 11 for pharma, FSMA for food)

---

## Telecommunications
**Signals:** telecom, carrier, SMS, voice, call, SIP, VoIP, number, PSTN, IVR, CPaaS, Twilio, Vonage, messaging, routing, trunk, MVNO, spectrum
**Constraint questions:**
- SMS, voice, or both?
- Outbound only, inbound only, or bidirectional?
- Expected message/call volume per month? (affects provider tier and cost model)
- Do you have an existing CPaaS provider? (Twilio, Vonage, MessageBird, etc.)
- Short code, long code, or toll-free? (US) — or equivalent in target region
- Regulatory compliance? (TCPA in US, GDPR for EU SMS, TRAI in India)
- Number porting required?
- Does it need IVR / call routing logic?
- Carrier-grade reliability required? (SLA, failover, redundant routes)

---

## Agriculture & AgTech
**Signals:** farm, crop, soil, irrigation, livestock, harvest, agronomy, field, drone, precision agriculture, weather, yield, fertilizer, pest, AgTech
**Constraint questions:**
- Crop production, livestock management, supply chain, or farm management platform?
- Does it use sensor or IoT data? (soil sensors, weather stations, drones)
- Connectivity in field — reliable internet available, or must it work offline/low-bandwidth?
- Integration with farm management systems? (John Deere Operations Center, Climate FieldView, Trimble)
- Precision agriculture features? (GPS-guided, variable rate application)
- Weather API dependency? Which provider, or is that open?
- Does it handle financial transactions? (input procurement, crop sales, subsidy claims)
- Regulatory context? (pesticide application records, organic certification, food safety traceability)

---

## Sports & Fitness
**Signals:** athlete, sport, team, league, match, score, fitness, workout, training, wearable, Garmin, Strava, nutrition, coaching, fantasy, stadium
**Constraint questions:**
- Consumer fitness app, team/athlete performance platform, league management, or fan engagement?
- Wearable/device integration required? (Apple Health, Google Fit, Garmin, Polar, Whoop)
- Real-time data required? (live scores, heart rate, GPS tracking during activity)
- Does it involve licensed sports data? (league data, odds, stats — often requires official data partnerships)
- Video content? (highlights, analysis, coaching review — licensing and storage implications)
- Fantasy sports or betting features? (heavy regulatory variation by jurisdiction)
- Age of users? (youth sports platforms require COPPA/GDPR-K compliance)
- Multi-sport or single-sport? Does it need sport-specific metrics?
