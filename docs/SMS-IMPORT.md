# Bank SMS import

AWN supports manual paste import for FAB — First Abu Dhabi Bank (v1). The importer recognizes:

- Salary Credit
- Debit Card Purchase
- Outward Remittance
- Inward Remittance
- ATM Cash Withdrawal / Debit

AWN never reads a device inbox or requests SMS access. Pasted text is parsed locally into temporary review proposals. Only reviewed transaction fields, FAB import metadata, an observed balance where present, and a deterministic fingerprint are persisted; the complete raw SMS is not stored or logged.

Outward remittances must be classified as an Expense or Transfer. Inward remittances must be classified as Income or Transfer. Account and card matches use financial type, last four digits, and FAB naming aliases, but ambiguous or missing matches always require the user to choose an instrument.

Imported proposals become ordinary AWN Income, Expense, or Transfer transactions and pass through the central ledger. A FAB `Balance` value is reconciliation metadata only and never replaces AWN's ledger-derived balance.

Duplicate protection uses a whitespace-normalized FAB fingerprint. A Household-scoped cloud tombstone prevents the same message from being applied twice, including after an imported transaction is edited or deleted. The transaction snapshot and fingerprint records are committed atomically.

The parser coordinator keeps FAB-specific parsing and merchant rules isolated in `lib/sms-import`. Future banks can add a parser module and registry entry while reusing matching, review, ledger conversion, and persistence. FAB v1 uses deterministic rules only; it sends no SMS or merchant data to AI or external categorization services.
