# AWN Design Constitution

## 1. Purpose

AWN is a simple personal and household finance tracker.

It should help ordinary users understand and record their finances without making them feel like they are using:

- accounting software
- a spreadsheet
- a banking administration system
- a professional investment terminal

AWN should feel:

Premium · Minimal · Friendly · Modern · Trustworthy

Functionality and clarity come before unnecessary complexity.

## 2. Core Visual Identity

The existing original AWN design is the visual foundation.

The authenticated application must look like a natural continuation of the AWN landing page and authentication pages.

### Primary visual characteristics

- Light main background
- Dark/black sidebar
- Purple as AWN's primary accent
- Modern purple gradients where appropriate
- Large confident typography
- Generous whitespace
- Rounded bento-style cards
- Light borders
- Soft shadows
- Minimal iconography
- Simple animations
- Clean information hierarchy

The authenticated app must never look like a separate product from the public AWN website.

Dashboard Desktop v1.0 is the frozen visual reference for the authenticated app. Future authenticated pages should feel like they were designed beside Dashboard, not independently.

Consistency is more important than visual novelty. Do not create duplicate component styles when an existing Dashboard-aligned component can be reused.

## 3. Color Rules

### Brand color

Purple remains the primary AWN brand color.

Purple may be modernized through:

- subtle gradients
- slightly different purple tones
- soft low-opacity purple backgrounds
- purple highlights

Do not replace purple with another primary brand color without explicit approval.

### Neutral colors

Use:

- white/off-white main backgrounds
- near-black/dark sidebar
- dark text
- soft grey secondary text
- subtle grey borders

The light background may include very subtle:

- shapes
- vectors
- gradients
- abstract forms

These must remain low-opacity and must not distract from financial information.

### Financial semantic colors

Use familiar colors:

**Green**

- income
- healthy progress
- under budget
- positive status

**Amber**

- approaching budget
- attention needed

**Red**

- expense
- overspending
- negative financial values where appropriate

These colors are semantic only.

They must never replace purple as AWN's brand identity.

On dark hero or card surfaces, use the shared light success-on-dark token for
positive values and statuses. Dark green text is forbidden on dark surfaces;
status pills and positive amounts must use the same high-luminance green palette.

## 4. Layout

AWN should use a balanced information density.

Do not:

- cram information together
- create huge empty areas unnecessarily
- display every possible financial metric simultaneously

Use a bento-style layout where different information cards naturally fit together.

Pages may use a wide desktop layout.

Maintain generous spacing between major sections.

Use the same subtle ambient page zoning established on Dashboard: low-opacity outlines, soft grouping, and quiet section separation that add depth without becoming visible panels.

## 5. Cards

Cards are one of AWN's primary design elements.

Use:

- generous rounded corners
- bento-style proportions
- light borders
- soft shadows
- clean internal spacing

Not every card must look identical.

Important cards may use:

- dark backgrounds
- purple gradients
- soft tinted backgrounds
- larger dimensions

Supporting cards should normally remain lighter and quieter.

Avoid a screen full of identical bordered rectangles.

### Card hierarchy

Primary cards are hero cards.

Secondary cards contain important supporting views or actions.

Supporting cards contain KPIs and smaller contextual metrics.

Use spacing, proportions, typography, borders, and shadows to communicate this hierarchy. Do not rely on color alone.

## 6. Typography

Keep the existing typography direction.

Use:

- large page headings
- bold important financial numbers
- clear supporting text
- small uppercase eyebrow labels

Example:

YOUR FINANCIAL OVERVIEW

followed by:

Dashboard

Important financial numbers should have strong visual priority.

Typography should preserve a clear hierarchy:

- page eyebrow
- large page title
- section title
- card label
- primary financial value
- supporting description

Do not introduce a new typography system when adding pages or components.

Example:

AED 5,000.00

Currency display can become user-configurable later.

For now use:

AED 5,000.00

## 7. Sidebar

Desktop navigation remains a dark sidebar.

Main navigation:

- Dashboard
- Transactions
- History
- Cards & Accounts
- Plan
- Insights

Also retain:

- Help
- Sign out

The selected section should use a rounded active-state pill similar to the original AWN design.

The sidebar should remain relatively wide.

Add the ability to hide/collapse the sidebar, allowing the main content area to expand.

Keep the existing AWN logo temporarily until the final logo is created.

## 8. Icons

Use one consistent icon family throughout the authenticated application.

Preferred direction:

- clean line icons
- medium-light visual weight
- simple geometry
- modern
- recognizable without labels where possible

Avoid mixing:

- filled icons
- outline icons
- decorative icons
- multiple unrelated icon styles

The final icon style can be revisited later.

## 8.5 Frozen Component Reuse

Reusable UI components should follow Dashboard Desktop v1.0.

Use the established shared components for:

- buttons
- cards
- section headers
- badges
- progress indicators
- empty states
- modal and dialog surfaces
- list rows

Do not create a new component style for one page when an existing AWN component already solves the same purpose.

### Button hierarchy

Primary buttons use AWN purple.

Secondary buttons are neutral with light borders.

Ghost and text actions remain minimal.

In-card text actions should use the Dashboard style, such as:

View all →

View plan →

Button hover behavior, typography, spacing, shadows, and transitions should match Dashboard.

### Hover behavior

Static information cards:

- subtle glass/light sweep
- contained low-opacity outline
- no movement
- no scaling

Cards with actions:

- subtle glass/light sweep
- subtle purple hover reveal
- contained low-opacity outline
- no movement
- no scaling

Hover effects must not imply that a non-clickable card can be opened.

### Hero principles

Hero cards are the strongest visual component on a page.

They may use dark surfaces, purple gradients, grain, glass sweep, and premium lighting when consistent with Dashboard.

Hero cards should prioritize one clear financial figure, with secondary details visually supporting it.

Do not redesign a hero when a task only adds or adjusts functionality.

## 9. Dashboard

Dashboard is AWN's complete current financial overview.

It should not feel like onboarding after setup has been completed.

### Main hierarchy

The largest financial figure should be:

Money Available

Use:

one large overall balance card

with supporting KPI cards beneath or beside it.

Supporting information should include:

- Income this month
- Spent this month
- Net position
- Credit card amount owed
- Budget remaining

Credit-card debt must remain visually distinct from money the user actually owns.

### Budget remaining

Show:

- amount remaining
- thin progress bar
- clear friendly status

### Savings

Show:

- one primary active savings goal
- circular progress indicator
- link to view all savings goals

### Recent activity

Show the latest 5 transactions.

### Dashboard charts

Do not use conventional charts on Dashboard.

Allowed:

- progress bars
- circular progress
- small visual indicators

Detailed charts belong primarily in Insights.

### Dashboard actions

Primary:

Add Transaction

Secondary:

Import Bank SMS

When Add Transaction opens, the user chooses:

- Income
- Expense
- Transfer

Import Bank SMS remains part of AWN and is not to be removed.

## 10. Transactions

Transactions focuses only on the current month.

The page should be a visual monthly overview rather than primarily a transaction ledger.

Show:

- Total income
- Total expenses
- Net position
- Average transaction
- Top spending category

### Recent 10 days

Do not use a chart.

Show transactions as readable rows/cards containing:

- Merchant/title
- Category
- Date
- Amount
- Account/card used

### Full transaction list

Do not make the complete list dominate the page.

Provide a button such as:

View all transactions

which opens the current month's complete transaction history in a modal/popup.

### Categories

Show expense categories in one vertical list.

Each category shows:

- category name
- budget
- spent
- remaining
- percentage spent
- thin progress bar

Categories use names only.

No category icons are required.

## 11. History

History displays previous months as large monthly cards.

Cards should show the most important information initially.

Opening a month should display a larger modal/popup detail view.

Include:

- income
- expenses
- net position
- highest expense
- average daily expense
- top category
- budget performance
- comparison with previous month

AWN may say:

You spent 8% less than last month.

Keep comparisons easy to understand.

## 12. Cards & Accounts

Use exactly:

Cards & Accounts

Inside the page use three clearly separated expandable sections:

- Accounts
- Debit Cards
- Credit Cards

This expandable-section structure is the approved frozen design. Each section
keeps its own summary, content, and actions; never mix all three into one
generic list or replace the sections with tabs without explicit approval.

### Accounts

Accounts should have a visual treatment somewhat inspired by bank-account cards.

Supported initial account types:

- Current / Checking
- Savings
- Cash

Cash should behave like an account and transactions can be linked to it.

### Debit cards

Debit cards should visually resemble physical cards.

Show only basic information such as:

- card nickname
- last four digits
- linked account

### Credit cards

Credit cards should also resemble physical cards.

Show:

- nickname
- last four digits
- balance owed
- limit
- available credit
- payment information when supported

Individual cards should be visually distinguishable from one another.

Users do not need custom color selection.

Never request:

- full card number
- CVV
- PIN

## 13. Plan

Plan contains two tabs:

Monthly Budgets

Savings Goals

### Monthly Budgets

Show newest/current month first.

Each month card shows:

- Month
- Budget
- Spent
- Remaining
- Percentage used
- Status

Opening a month displays detailed category information.

Users can use:

- AWN default categories
- custom categories

The overall monthly budget remains the canonical total spending limit. Category
allocations are optional amounts inside that limit and are managed through the
shared Monthly Budget workflow; they do not need to add up to the overall
budget and must never rescale automatically.

AWN's default category catalog is a grouped suggestion system, not a data
restriction. Custom categories remain supported, and historical or legacy
category strings must continue to display exactly as recorded unless the user
edits them.

At month end, future functionality should allow the user to decide whether unused money:

- rolls into the next budget
- moves toward a savings goal

Do not build this advanced behavior unless explicitly requested.

### Savings Goals

Each goal shows:

- name
- goal amount
- amount saved
- remaining
- progress
- optional target date

Primary progress visualization:

Circular progress indicator

Contributions can eventually come from either:

- manual additions
- transfers into a linked savings account

Do not overbuild this before that functionality is specifically requested.

## 14. Insights

Insights may be more analytical than the rest of AWN.

It must still remain easy to understand.

Show:

- total months tracked
- average monthly spending
- best savings month
- historical trends

Use a side-by-side column chart:

Budget vs Spent

for each month.

Also show monthly performance with:

- Budget
- Spent
- Difference
- Under / On / Over budget

Include:

What history says

Insights should combine facts with light coaching.

Preferred style:

Dining is up 18% this month — reducing it slightly could help next month.

Not:

WARNING: Dining budget exceeded.

AWN should inform users, never shame them.

## 15. Empty States

Use friendly illustrated empty states where appropriate.

They should contain:

- simple illustration
- short explanation
- clear action

Do not fill empty screens with placeholder finance tables.

Once onboarding is completed, onboarding cards should disappear from Dashboard.

Onboarding remains accessible later through Settings.

## 16. Motion

Use subtle animation.

Appropriate examples:

- card hover
- button hover
- modal opening
- progress animation
- sidebar collapse
- tab transitions

Animation should make AWN feel polished.

It should never slow navigation or make financial information difficult to read.

## 17. Responsive Design

### Desktop

Dark sidebar + wide main content.

### Tablet

Adapt the sidebar/layout appropriately without losing hierarchy.

### Mobile

Use:

- hamburger navigation
- prominent Add Transaction action

The Add Transaction action should allow:

Manual Transaction

or

Import Bank SMS

A prominent transaction action should remain accessible on mobile.

No horizontal overflow.

## 18. Product Tone

AWN speaks simply.

Prefer:

You're comfortably within budget.

Dining is slightly higher this month.

AED 230 over budget.

Avoid:

Financial variance detected.

Budget threshold breached.

Excessive expenditure warning.

AWN should sound like a helpful finance companion, not an accountant.

## 19. Forbidden Design Drift

These rules are non-negotiable unless explicitly changed by the product owner.

Codex MUST NOT:

- change AWN's primary brand from purple
- change the authenticated application to a green design system
- recreate the Mizan visual identity
- introduce an unrelated second design system
- replace the dark sidebar without explicit instruction
- remove AWN's large headings
- remove rounded/bento cards
- turn AWN into a spreadsheet-style application
- create dense accounting tables as the primary interface
- introduce a completely new typography system
- redesign the landing page while working on authenticated pages
- redesign existing components merely because a new page is being added

Adding functionality does not grant permission to redesign AWN.

This is the most important implementation rule.

## 20. Future Features

Possible later AWN functionality includes:

- trip finances
- group finances
- joint finance
- linked partner accounts
- shared savings goals
- splitting expenses

These are future possibilities only.

Do not architect today's interface around them.

Do not add menus, database structures, screens or abstractions for them until specifically requested.

## 21. Rule for Codex

For every future AWN frontend task:

Preserve the AWN Design Constitution. Existing AWN styling is the default. A request to add, remove, move, or modify functionality does not authorize a redesign of the visual system. Only change the design system when the user explicitly requests a design-system change.

If a requested implementation conflicts with this constitution, Codex should flag the conflict rather than silently changing the design system.

## 22. Global Scale - Frozen

The authenticated AWN scale established by Dashboard Desktop v1.0 is frozen. Sidebar width, desktop page-title scale, body typography, page horizontal padding, button height, shared card radius and padding, and standard section/grid gaps are design tokens and should be treated like code.

The frozen Dashboard Desktop v1.0 visual density is the reference for authenticated desktop scale. Global scale tokens must be validated against that reference before being changed.

All authenticated pages must consume the shared scale tokens and reuse frozen components. Do not create duplicate page-specific sizes or component styles.

Page-specific visual work must not modify global scale tokens unless the task explicitly requires a global AWN scale change.

Do not enlarge typography, cards, buttons, sidebar, or page spacing to fill empty space.

## 23. Authenticated UI Hierarchy

Dashboard Desktop v1.0 is the visual reference. Authenticated pages use one semantic hierarchy:

- Typography: page title, section title, card title, metric value, body/supporting text, and eyebrow/label.
- Component scale: standard card, compact metric card, primary/secondary button, expandable row, standard or wide modal shell, and circular close control.
- Spacing: shared page, section, grid, card-padding, and control-gap values.

New page-specific styling must consume the frozen AWN typography, spacing and shared component scale before introducing a new size.

Unique components may differ in geometry, but shared semantic roles must remain visually consistent. Reuse the frozen component implementation instead of creating duplicate page-specific styles. Consistency takes priority over visual novelty.

## 24. Onboarding — Frozen Principles

- Give each screen one clear purpose and keep progress visible.
- Keep Back available after the welcome screen.
- Optional setup must always be cancellable and skippable without creating placeholder data.
- Reserve validation-message space so errors do not shift neighboring fields.
- Collect only information AWN currently uses.
- Financial accounts and cards are entered manually for now; automatic bank linking must be described as coming soon.
