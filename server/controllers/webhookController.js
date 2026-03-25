import crypto from 'crypto';
import { getCustomerProfile, extractPaymentProfiles } from '../services/authorizeNetService.js';
import {
  findZohoCustomerByEmail,
  associateAuthorizeNetCardToZohoCustomer,
  updateZohoCustomerCardMetadata
} from '../services/zohoService.js';

const TARGET_EVENT = 'net.authorize.customer.paymentProfile.created';

const normalizeSignatureKey = (raw) => {
  const val = String(raw || '').trim();
  if (!val) return null;
  const noSpaces = val.replace(/\s+/g, '');
  if (/^[a-fA-F0-9]+$/.test(noSpaces) && noSpaces.length % 2 === 0) {
    return Buffer.from(noSpaces, 'hex');
  }
  return Buffer.from(val, 'utf8');
};

const verifyWebhookSignature = (req) => {
  const signatureHeader = String(req.get('X-ANET-SIGNATURE') || '').trim().toLowerCase();
  if (!signatureHeader.startsWith('sha512=')) {
    return { valid: false, reason: 'invalid_signature_header' };
  }
  const signature = signatureHeader.slice('sha512='.length);
  if (!signature) return { valid: false, reason: 'empty_signature' };

  const key = normalizeSignatureKey(process.env.AUTHORIZE_NET_WEBHOOK_SIGNATURE_KEY);
  if (!key) return { valid: false, reason: 'missing_signature_key' };

  const rawBody = req.rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    return { valid: false, reason: 'missing_raw_body' };
  }

  const digest = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
  const digestBuf = Buffer.from(digest, 'utf8');
  const sigBuf = Buffer.from(signature, 'utf8');
  const valid = digestBuf.length === sigBuf.length && crypto.timingSafeEqual(digestBuf, sigBuf);
  return { valid, reason: valid ? null : 'signature_mismatch' };
};

const extractIds = (body) => {
  const payload = body?.payload || {};
  const profile = payload?.profile || {};
  const customerProfileId =
    profile?.customerProfileId ||
    payload?.customerProfileId ||
    payload?.customer_profile_id ||
    null;
  const paymentProfileId =
    profile?.paymentProfileId ||
    profile?.customerPaymentProfileId ||
    payload?.paymentProfileId ||
    payload?.payment_profile_id ||
    null;
  return {
    customerProfileId: customerProfileId ? String(customerProfileId) : null,
    paymentProfileId: paymentProfileId ? String(paymentProfileId) : null
  };
};

const extractEmail = (profile) => {
  const email = Array.isArray(profile?.email) ? profile.email[0] : profile?.email;
  return String(email || '').trim() || null;
};

export const handleAuthorizeNetWebhook = async (req, res) => {
  try {
    const verification = verifyWebhookSignature(req);
    if (!verification.valid) {
      console.error(`[AUTHNET_WEBHOOK] Signature verification failed: ${verification.reason}`);
      return res.status(401).json({ success: false, message: 'Unauthorized webhook signature' });
    }

    const eventType = String(req.body?.eventType || '');
    if (eventType !== TARGET_EVENT) {
      return res.status(200).json({
        success: true,
        ignored: true,
        message: `Ignored event type: ${eventType || 'unknown'}`
      });
    }

    const { customerProfileId, paymentProfileId } = extractIds(req.body);
    if (!customerProfileId || !paymentProfileId) {
      return res.status(400).json({
        success: false,
        message: 'Missing customerProfileId/paymentProfileId in webhook payload'
      });
    }

    const authProfileResult = await getCustomerProfile(customerProfileId);
    if (!authProfileResult.success || !authProfileResult.profile) {
      console.error('[AUTHNET_WEBHOOK] Failed to fetch Authorize.Net customer profile', {
        customerProfileId,
        error: authProfileResult.error || 'unknown_error'
      });
      return res.status(502).json({
        success: false,
        message: 'Failed to fetch customer profile from Authorize.Net'
      });
    }

    const email = extractEmail(authProfileResult.profile);
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Authorize.Net profile has no email'
      });
    }

    const zohoCustomerResult = await findZohoCustomerByEmail(email);
    if (!zohoCustomerResult.success || !zohoCustomerResult.customerId) {
      console.error('[AUTHNET_WEBHOOK] Zoho customer not found by email', { email });
      return res.status(404).json({
        success: false,
        message: 'No Zoho customer found for email'
      });
    }

    const zohoCustomerId = zohoCustomerResult.customerId;
    const associateResult = await associateAuthorizeNetCardToZohoCustomer({
      customerId: zohoCustomerId,
      customerProfileId,
      paymentProfileId
    });

    if (!associateResult.success) {
      console.warn('[AUTHNET_WEBHOOK] Associate card endpoint failed, using metadata fallback', {
        customerProfileId,
        paymentProfileId,
        zohoCustomerId,
        error: associateResult.error
      });
    }

    const paymentProfiles = extractPaymentProfiles(authProfileResult.profile);
    const matched = paymentProfiles.find((p) => String(p.paymentProfileId) === String(paymentProfileId));
    const metadataResult = await updateZohoCustomerCardMetadata({
      customerId: zohoCustomerId,
      last4: matched?.last4 || null,
      cardBrand: matched?.cardType || null,
      paymentMethodId: paymentProfileId,
      customerProfileId
    });

    if (!associateResult.success && !metadataResult.success) {
      return res.status(502).json({
        success: false,
        message: 'Failed to associate card in Zoho and metadata fallback also failed',
        error: {
          associate: associateResult.error || null,
          metadata: metadataResult.error || metadataResult.reason || null
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Authorize.Net payment profile synced to Zoho',
      data: {
        eventType,
        email,
        customerProfileId,
        paymentProfileId,
        zohoCustomerId,
        associatedViaZohoEndpoint: !!associateResult.success,
        metadataSync: metadataResult.success ? 'ok' : (metadataResult.skipped ? `skipped:${metadataResult.reason}` : 'failed')
      }
    });
  } catch (error) {
    console.error('[AUTHNET_WEBHOOK] Unhandled error', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Internal webhook processing error'
    });
  }
};
