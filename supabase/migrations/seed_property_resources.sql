-- Seed the Property Playbook from the East Meadow Word docs.
-- Run once in the Supabase SQL editor (runs as service role, bypasses RLS).
-- Safe to re-run: clears existing rows with these titles first.

delete from public.property_resources
where title in (
  'Tenant Application Review Criteria',
  'Pet Policy',
  'Pre-Qualification Questionnaire',
  'First Reply — Offer Showing + Questionnaire',
  'Showing Reply — Occupied Property',
  'Showing Reply — Vacant Property',
  'Minimum Qualifications',
  '"Is this still available?" Auto-Reply',
  'Re-Engage Cold Lead',
  'Month-to-Month Note',
  'Showing Schedule Link',
  'Common Responses & Routing Rules',
  'Application Requirements'
);

insert into public.property_resources (category, title, body, is_template, sort_order) values

-- ───────────── Application Criteria ─────────────
('Application Criteria', 'Tenant Application Review Criteria', $md$**East Meadow Properties — Tenant Application Review Criteria**

These criteria are applied consistently to all applicants. All decisions are made without regard to race, color, national origin, religion, sex, familial status, or disability in accordance with the Fair Housing Act.

### Income
Combined gross monthly income must be at least **3x the monthly rent**. Acceptable sources: employment, self-employment, Social Security, disability, or other verifiable recurring income. Pay stubs, bank statements, or an employer verification letter are required.

### Credit
Preferred minimum credit score of **600**. Applicants below 600 are not automatically denied — the full credit report is reviewed to assess the nature of any derogatory items. Factors considered:

- Age of derogatory accounts
- Whether issues appear isolated or part of a pattern
- Presence of active collections or judgments
- Overall payment history

A score below 600 may be approved with an additional security deposit or a qualified co-signer. Bankruptcies discharged within the last 3 years are grounds for denial.

### Rental History
No evictions within the past 5 years. Positive references from at least one prior landlord are required. Inability to provide a landlord reference will be noted and may result in denial.

### Background
No felony convictions within the past 7 years. Convictions are reviewed case-by-case depending on nature and recency. Active sex offender registration is grounds for denial.

### Employment
Current verifiable employment or documented stable income source required. Self-employed applicants must provide bank statements or tax documents showing consistent income.

### Pets
Pets are permitted on a case-by-case basis subject to management approval. **Maximum of 3 pets per unit.** All pets must be documented and approved prior to move-in. (See the **Pet Policy** entry for fees.)

### Housing Vouchers
The property does **not** participate in the Housing Choice Voucher (Section 8) program.

### Incomplete Applications
Applications missing required documents (photo ID, pay stubs, landlord references) will not be processed until complete.

### Co-Applicants
All occupants 18 and older must submit a separate application and meet the same criteria individually.

---
East Meadow Properties · thomas@eastmeadowproperties.com · 530-919-7350$md$, false, 10),

-- ───────────── Policies ─────────────
('Policies', 'Pet Policy', $md$Pets are permitted on a case-by-case basis subject to management approval. **Maximum of 3 pets per unit.** All pets must be documented and approved prior to move-in.

- **Pet deposit (non-refundable):** $100 per cat, $200 per dog, plus $50 for each additional pet
- **Monthly pet fee:** $35 for the first pet, $20/month for each additional pet
- Current vaccination records required for all pets
- Residents are responsible for any pet-caused damage to the property
- Excessive noise or disruptive behavior by pets is subject to review and may result in loss of pet privileges$md$, false, 10),

-- ───────────── Lead Messaging (templates) ─────────────
('Lead Messaging', 'Pre-Qualification Questionnaire', $md$Here's the pre-qualification questionnaire — you can just reply here.

**Applicant**
- First Name
- Last Name
- Email
- Phone

**Additional**
- Total Occupants
- Pets
- Pets Description
- Smokes
- Lawsuit
- Felony
- Felony / Lawsuit Description

**Financial**
- Current Monthly Income
- Income Assistance
- Credit Score
- Guarantor Current Income$md$, true, 10),

('Lead Messaging', 'First Reply — Offer Showing + Questionnaire', $md$Thanks for your interest! Happy to set up a showing. We do ask that you fill out a quick pre-qualification questionnaire first. The application can be done after the showing — it includes a background check, credit check, and proof of income. Would you like me to send the questionnaire over?$md$, true, 20),

('Lead Messaging', 'Showing Reply — Occupied Property', $md$Yes, we can set up a showing. Please do not arrive at the house unannounced as it is currently occupied. We also ask that you complete a pre-qualification checklist — would you like me to send that over?$md$, true, 30),

('Lead Messaging', 'Showing Reply — Vacant Property', $md$Yes, we can set up a showing. Please do not arrive at the house unannounced or disturb the neighbors. We also ask that you complete a pre-qualification checklist — would you like me to send that over?$md$, true, 40),

('Lead Messaging', 'Minimum Qualifications', $md$Our minimum qualifications are income of three times the monthly rent and a credit score of 625+. We do a background check, credit check, and income verification during the application process, which happens after the showing.$md$, true, 50),

('Lead Messaging', '"Is this still available?" Auto-Reply', $md$Yes — are you still interested?$md$, true, 60),

('Lead Messaging', 'Re-Engage Cold Lead', $md$Are you still interested in this rental?$md$, true, 70),

('Lead Messaging', 'Month-to-Month Note', $md$Please note, as of now we are offering month-to-month leases.$md$, true, 80),

('Lead Messaging', 'Showing Schedule Link', $md$Here's the showing schedule — please book a time:
https://calendly.com/thomas-eastmeadow/showing-589-dyer-cemetery-rd

_(Swap in the correct Calendly link for the property.)_$md$, true, 90),

-- ───────────── Lead Messaging (reference, not templates) ─────────────
('Lead Messaging', 'Common Responses & Routing Rules', $md$- **Non-English message** → reply: "I'm sorry, English only."
- **"Is this still available?"** → auto-response: "Yes, are you still interested?"
- **Simple "yes" to "are you interested?"** → use the **First Reply** template.
- **Lead asking when they can see it** → use the **First Reply** template.$md$, false, 100),

('Lead Messaging', 'Application Requirements', $md$The application (completed after the showing) includes:

- Background check
- Credit check
- Proof of employment / income$md$, false, 110);
