# Bank SMS import

AWN supports local, manual-paste bank SMS import. The user does not choose a bank: the coordinator segments the pasted batch, detects each supported message format independently, and routes it through the registered parser. The only registered parser in v1 is FAB — First Abu Dhabi Bank, with these formats:

- Salary Credit
- Debit Card Purchase
- Outward Remittance
- Inward Remittance
- ATM Cash Withdrawal / Debit

Unknown banks and message formats remain Unsupported. The coordinator never defaults unknown text to FAB, and its registry allows future bank detectors, aliases, segmenters, and parsers to be added without introducing a bank dropdown or changing the shared review and ledger flow.

AWN never reads a device inbox or requests SMS access. Pasted text is parsed locally into temporary review proposals. Only reviewed transaction fields, import metadata, an observed balance where present, and a deterministic fingerprint are persisted; the complete raw SMS is not stored or logged.

## Matching and readiness

Detection uses message structure, not account or card suffixes. After detection, instrument matching considers the detected bank, financial type, last four digits, centralized bank aliases, currency, debit-card linkage, and uniqueness. A missing or ambiguous match is never guessed.

`Ready` is a centralized live ledger-safety result, not parser confidence. A proposal is Ready only when parsing, type, amount, currency, date, required category, all required endpoints, currency compatibility, uniqueness, debit linkage, duplicate checks, and the Phase 2 ledger validation succeed. Clearing a required choice immediately returns the proposal to Needs review. Included unresolved or unsupported proposals block the batch import until the user resolves or excludes them.

Salary Credit needs a valid destination. Debit Card Purchase needs a linked debit card and a category; `Other (Unbudgeted)` is valid. ATM Cash Withdrawal needs the debited Account and Cash. Outward remittances remain Needs review until classified as Expense or Transfer and completed; inward remittances remain Needs review until classified as Income or Transfer and completed. No SMS import path can create an orphan Income, Expense, Transfer, or debit-card purchase.

Imported proposals become ordinary AWN Income, Expense, or Transfer transactions and pass through the central ledger. A bank `Balance` value is reconciliation metadata only and never replaces AWN's ledger-derived balance.

Duplicate protection keeps the existing whitespace-normalized FAB fingerprint. A Household-scoped cloud tombstone prevents the same message from being applied twice, including after an imported transaction is edited or deleted. The transaction snapshot and fingerprint records are committed atomically, and automatic detection does not change existing FAB fingerprints.

FAB v1 uses deterministic local rules only; it sends no SMS or merchant data to AI, external categorization services, or any bank.
