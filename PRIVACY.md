# Privacy Policy

**EU261 Claim Agent** — Last updated: May 2026

## What we collect

When you submit a claim through this service you provide:

- **Flight details** — carrier, flight number, airports, dates, event type. These are stored in a GitHub Issue in plaintext. The repository is public.
- **Personal data (PII)** — your full name, email address, and booking reference. These are submitted as part of the claim form and transmitted directly to the GitHub Issues API.

## How PII is protected

Within seconds of an issue being created, an automated workflow overwrites the three PII fields in the issue body with libsodium SealedBox ciphertexts. After that point:

- The plaintext PII is no longer visible in the GitHub UI to anyone.
- Only the operator holding the corresponding private key can decrypt the fields.
- The private key is stored offline and is never committed to this repository or stored in GitHub Actions secrets used by public-facing workflows.
- The decrypted PII is used solely for drafting and submitting your claim to the airline; it is not retained beyond the claim process.

## GitHub as a data processor

Claim data is stored in GitHub Issues on GitHub's infrastructure (GitHub, Inc., a subsidiary of Microsoft). GitHub's Privacy Statement applies: <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>.

By submitting a claim you acknowledge that the issue (with PII encrypted) will be stored on GitHub's servers in the United States and replicated according to GitHub's standard practices.

## Retention

Issues are kept for the duration of the claim and for a reasonable period afterwards for audit purposes. You may request deletion of your claim issue by opening a new issue referencing the claim number.

## Your rights (GDPR / UK GDPR)

If you are based in the UK or EEA you have the right to access, rectify, erase, restrict, or object to processing of your personal data. To exercise these rights contact the repository owner via GitHub.

## Cookies and analytics

This site sets no cookies and uses no analytics.

## Contact

Open an issue on <https://github.com/richardawe/Eu261> or contact the repository owner directly.
