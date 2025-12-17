# Bluetooth Reader Integration Notes

## Device snapshot
- **Model:** Authorize.net / BBPOS AWC Walker C3X Bluetooth card reader (Bluetooth 5.0, EMV/NFC capable).
- **Supported interfaces:** Bluetooth Low Energy (BLE), appears as HID/keyboard input to the host when used from native Accept Mobile apps. Tokenization is usually delivered via Authorize.Net’s Accept Mobile + Accept.js workflow.
- **Typical flow:** mobile app pairs with the reader through Accept Mobile or similar SDK, reader captures card (magstripe/EMV/contactless), sends encrypted data (token, deviceSessionId, cardData) to Authorize.Net’s Accept Mobile endpoint, and the app receives a payment `opaqueData` payload (or a `cardData` token) that is safe to pass to backend for final settlement.

## Integration strategy for RetailPro POS
1. **Pairing & capture:** the POS web app cannot natively pair with the reader (mobile OS restrictions), so we plan to rely on the same Accept Mobile workflow the hardware already expects:
   - Provide UI controls for initiating pairing (requesting Bluetooth permissions) and for invoking the Accept Mobile pairing helper or Web Bluetooth shim if we eventually embed the SDK (Accept has a standalone JS SDK that can talk to tokenized readers through Accept.js + Accept SDK).
   - Track reader status (connected/available, battery) inside the `PaymentModal`, storing the last-seen reader ID in `localStorage` like the current PAX terminal IP feature.
2. **Token delivery:** once the reader returns `opaqueData`/`deviceSessionId` and `paymentAccountMasked`:
   - Send those tokens alongside the sale payload to the backend (`salesController`) so the backend can call a new service (`bbposService.processPayment`) that posts the token to Authorize.Net using the `opaqueData` flow (`payment.opaqueData`).
   - Mirror the existing Authorize.Net `processPayment` structure but wire it through the `opaqueData` (mask the reader’s token) instead of raw PAN data.
3. **Backend & routing:** implement a dedicated route group under `/bbpos` that:
   - Allows the client to register/refresh tokens if needed (`POST /bbpos/token`).
   - Allows us to log reader health/status or accept pairing metadata.
   - For now the main responsibility will be routing tokenized payment data through `bbposService`, leaving the Accept Mobile handshake to the client (which will likely just be a stub until we have the real SDK integrated).

## Unknowns / follow-ups
- Need exact Accept Mobile SDK version and whether the retail app should bundle Accept.js or rely on a native host (desktop/wallet). The next step after prototyping the UI is to coordinate with Authorize.Net’s Accept Mobile documentation to confirm the required payload shape (`opaqueData`, `deviceSessionId`, `paymentAccountMasked`).
- Determine whether our POS should run inside a browser that supports Web Bluetooth (desktop Chrome?) or whether we will ultimately pair via a helper app (Electron, hybrid). This doc assumes we will eventually send token payloads from the client to the backend.

## Security & config
- Continue to use the existing `AUTHORIZE_NET_API_LOGIN_ID`/`TRANSACTION_KEY`.
- Require the new `BBPOS_READER_ID` or `BBPOS_SDK_KEY` env vars (to be added once we have SDK docs).
- Ensure the frontend never stores raw card data—only receives the encrypted `opaqueData` pair from the reader before submitting to the backend.

